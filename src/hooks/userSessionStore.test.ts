/**
 * The shared session store (userSessionStore.ts): one getUser(), one profile +
 * membership read and one auth listener per tab, for every useUser() caller.
 *
 * The fake client counts every request the real one would send, and answers a
 * new auth subscription with INITIAL_SESSION asynchronously, as auth-js 2.107
 * does — without that, a store that re-reads on it would pass these tests and
 * still double every page's requests in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUserSessionStore, LOADING_SNAPSHOT, type UserSessionStore } from "./userSessionStore.ts";

type AuthUser = { id: string; email: string; user_metadata: Record<string, unknown> };
type AuthCallback = (event: string, session: { user: AuthUser } | null) => void;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Lets every pending timer and promise run (the store defers with setTimeout 0). */
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

const authUser = (id: string): AuthUser => ({ id, email: `${id}@example.test`, user_metadata: {} });

function fakeSupabase(opts: { types: Record<string, string>; signedIn: string | null }) {
  const calls = { getUser: 0, from: {} as Record<string, number>, rpc: 0 };
  let current: AuthUser | null = opts.signedIn ? authUser(opts.signedIn) : null;
  const callbacks: AuthCallback[] = [];
  /** Set to hold every `profiles` read until released. */
  let profileGate: Promise<void> | null = null;
  /** Set to make getUser() answer with an error (a network failure). */
  let getUserFails = false;
  /** Set to hold getUser() until released. */
  let getUserGate: Promise<void> | null = null;

  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "profiles") {
          if (profileGate) await profileGate;
          const type = opts.types[String(filters.id)];
          return { data: type ? { user_type: type } : null, error: null };
        }
        if (table === "lawyer_profiles") return { data: { practice_kind: "consultant" }, error: null };
        return { data: null, error: null }; // no firm / business membership
      },
    };
    return chain;
  };

  const client = {
    auth: {
      getUser: async () => {
        calls.getUser += 1;
        const answer = current; // what the server said when asked
        if (getUserGate) await getUserGate;
        if (getUserFails) return { data: { user: null }, error: { message: "fetch failed" } };
        return { data: { user: answer }, error: null };
      },
      onAuthStateChange: (cb: AuthCallback) => {
        callbacks.push(cb);
        const session = current ? { user: current } : null;
        setTimeout(() => cb("INITIAL_SESSION", session), 0);
        return { data: { subscription: { unsubscribe: () => { callbacks.splice(callbacks.indexOf(cb), 1); } } } };
      },
    },
    from: (table: string) => {
      calls.from[table] = (calls.from[table] ?? 0) + 1;
      return builder(table);
    },
    rpc: async () => {
      calls.rpc += 1;
      return { data: "super_admin", error: null };
    },
  };

  return {
    calls,
    client,
    /** Every request sent so far, getUser() included. */
    total: () => calls.getUser + calls.rpc + Object.values(calls.from).reduce((a, b) => a + b, 0),
    holdProfiles: () => { const d = deferred(); profileGate = d.promise; return () => { profileGate = null; d.resolve(); }; },
    /** What supabase-js does on sign-in, sign-out, refresh: tell every listener. */
    emit: (event: string, id: string | null) => {
      current = id ? authUser(id) : null;
      for (const cb of [...callbacks]) cb(event, current ? { user: current } : null);
    },
    /** The session goes away without an event reaching the store yet. */
    dropSession: () => { current = null; },
    /** A server-side write to user_metadata: no auth event reaches the tab. */
    setMetadata: (meta: Record<string, unknown>) => { if (current) current = { ...current, user_metadata: meta }; },
    failGetUser: (fails: boolean) => { getUserFails = fails; },
    holdGetUser: () => { const d = deferred(); getUserGate = d.promise; return () => { getUserGate = null; d.resolve(); }; },
    listeners: () => callbacks.length,
  };
}

function harness(opts: { types?: Record<string, string>; signedIn?: string | null } = {}) {
  const sb = fakeSupabase({ types: opts.types ?? { u1: "admin" }, signedIn: opts.signedIn === undefined ? "u1" : opts.signedIn });
  const store: UserSessionStore = createUserSessionStore({ createClient: () => sb.client as never });
  return { sb, store };
}

test("before any read the snapshot is the loading guest (what the server renders)", () => {
  const { store } = harness();
  assert.equal(store.getSnapshot(), LOADING_SNAPSHOT);
  assert.equal(store.getSnapshot().loading, true);
  assert.equal(store.getSnapshot().session.isLoggedIn, false);
});

test("N concurrent subscribers share one getUser and one profile read", async () => {
  const { sb, store } = harness();
  const notified = new Array(12).fill(0);
  notified.forEach((_, i) => store.subscribe(() => { notified[i] += 1; }));
  await settle();

  assert.equal(sb.calls.getUser, 1);
  assert.equal(sb.calls.from.profiles, 1);
  for (const table of ["firm_members", "business_members", "firm_profiles", "business_profiles"]) {
    assert.equal(sb.calls.from[table], 1, table);
  }
  assert.equal(sb.calls.rpc, 1); // staff_role, admins only
  assert.equal(sb.listeners(), 1); // one auth listener for the tab
  assert.ok(notified.every((n) => n > 0), "every subscriber hears the result");

  const { session, loading } = store.getSnapshot();
  assert.equal(loading, false);
  assert.equal(session.userId, "u1");
  assert.equal(session.userType, "admin");
  assert.equal(session.staffRole, "super_admin");
  store.dispose();
});

test("nested gates (each mounting after its parent resolved) cost one read in total", async () => {
  // app/ai/layout → business layout → UserTypeGuard → ConsultantGate → page.
  const { sb, store } = harness();
  for (let gate = 0; gate < 5; gate++) {
    store.subscribe(() => {});
    await settle();
    assert.equal(store.getSnapshot().loading, false, `gate ${gate} released`);
  }
  // auth getUser + profiles + 4 memberships + staff_role. Was 490 on prod.
  assert.equal(sb.total(), 7);
  store.dispose();
});

test("a late subscriber gets the cached session at once, with no new fetch", async () => {
  const { sb, store } = harness();
  store.subscribe(() => {});
  await settle();
  const before = sb.total();

  store.subscribe(() => {});
  const snap = store.getSnapshot();
  assert.equal(snap.loading, false);
  assert.equal(snap.session.userId, "u1");
  await settle();
  assert.equal(sb.total(), before);
  store.dispose();
});

test("a guest resolves once too", async () => {
  const { sb, store } = harness({ signedIn: null });
  store.subscribe(() => {});
  store.subscribe(() => {});
  await settle();
  assert.equal(sb.calls.getUser, 1);
  assert.equal(sb.total(), 1);
  assert.equal(store.getSnapshot().loading, false);
  assert.equal(store.getSnapshot().session.isLoggedIn, false);
  store.dispose();
});

test("sign-out during a refresh read clears at once and the read does not restore the user", async () => {
  const { sb, store } = harness();
  store.subscribe(() => {});
  await settle();

  const release = sb.holdProfiles();
  sb.emit("TOKEN_REFRESHED", "u1");
  await settle(); // the refresh read is now in flight, held at `profiles`
  assert.equal(store.getSnapshot().loading, false, "a refresh for the same person shows no spinner");

  sb.emit("SIGNED_OUT", null);
  assert.equal(store.getSnapshot().session.isLoggedIn, false, "cleared immediately");
  assert.equal(store.getSnapshot().loading, false);

  release();
  await settle();
  assert.equal(store.getSnapshot().session.isLoggedIn, false, "the superseded read was dropped");
  store.dispose();
});

test("a session that went away during the mount read is cleared by INITIAL_SESSION", async () => {
  const { sb, store } = harness();
  const release = sb.holdProfiles();
  store.subscribe(() => {});
  await settle(); // getUser answered u1; the profile read is held

  sb.dropSession();
  release();
  await settle();

  // The mount rendered u1, then subscribed: INITIAL_SESSION says nobody.
  assert.equal(store.getSnapshot().session.isLoggedIn, false);
  assert.equal(store.getSnapshot().loading, false);
  store.dispose();
});

test("an account switch holds loading and re-reads once for every subscriber", async () => {
  const { sb, store } = harness({ types: { u1: "lawyer", u2: "admin" } });
  const loadings: boolean[] = [];
  for (let i = 0; i < 5; i++) store.subscribe(() => loadings.push(store.getSnapshot().loading));
  await settle();
  assert.equal(store.getSnapshot().session.userType, "lawyer");
  assert.equal(store.getSnapshot().session.practiceKind, "consultant");
  assert.equal(sb.calls.from.profiles, 1);

  sb.emit("SIGNED_IN", "u2");
  assert.equal(store.getSnapshot().loading, true, "the previous person is not shown as settled");
  assert.equal(store.getSnapshot().session.userId, "u1");

  await settle();
  const { session, loading } = store.getSnapshot();
  assert.equal(loading, false);
  assert.equal(session.userId, "u2");
  assert.equal(session.userType, "admin");
  assert.equal(session.practiceKind, "advocate");
  assert.equal(sb.calls.from.profiles, 2, "one re-read for the event, not one per subscriber");
  assert.equal(sb.calls.getUser, 1);
  store.dispose();
});

test("a token refresh re-reads once, quietly", async () => {
  const { sb, store } = harness();
  for (let i = 0; i < 5; i++) store.subscribe(() => {});
  await settle();

  sb.emit("TOKEN_REFRESHED", "u1");
  assert.equal(store.getSnapshot().loading, false);
  await settle();
  assert.equal(sb.calls.from.profiles, 2);
  assert.equal(store.getSnapshot().session.userType, "admin");
  store.dispose();
});

test("a thrown mount releases loading as a guest, and the next subscriber retries", async () => {
  const sb = fakeSupabase({ types: { u1: "admin" }, signedIn: "u1" });
  let attempts = 0;
  const store = createUserSessionStore({
    createClient: () => {
      attempts += 1;
      if (attempts === 1) throw new Error("no Supabase configuration");
      return sb.client as never;
    },
  });
  store.subscribe(() => {});
  await settle();
  assert.equal(store.getSnapshot().loading, false);
  assert.equal(store.getSnapshot().session.isLoggedIn, false);

  store.subscribe(() => {});
  await settle();
  assert.equal(attempts, 2);
  assert.equal(store.getSnapshot().session.userId, "u1");
  store.dispose();
});

test("refresh() picks up a server-side tier change that fired no auth event", async () => {
  const { sb, store } = harness({ types: { u1: "lawyer" } });
  for (let i = 0; i < 3; i++) store.subscribe(() => {});
  await settle();
  assert.equal(store.getSnapshot().session.tier, "free");

  sb.setMetadata({ tier: "pro" }); // what a settled payment's updateUserById does
  const refreshing = store.refresh();
  assert.equal(store.getSnapshot().loading, false, "quiet: no spinner");
  await refreshing;
  assert.equal(store.getSnapshot().session.tier, "pro");
  assert.equal(sb.calls.getUser, 2);
  assert.equal(sb.calls.from.profiles, 2, "one re-read, not one per subscriber");
  store.dispose();
});

test("refresh() before the first read, or on a failed read, changes nothing", async () => {
  const { sb, store } = harness();
  await store.refresh(); // not started: no subscriber yet
  assert.equal(sb.total(), 0);

  store.subscribe(() => {});
  await store.refresh(); // the mount read is in flight and already fresh
  await settle();
  assert.equal(sb.calls.getUser, 1);

  sb.failGetUser(true);
  await store.refresh();
  await settle();
  assert.equal(store.getSnapshot().session.userId, "u1", "a network failure is not a sign-out");
  assert.equal(store.getSnapshot().loading, false);
  store.dispose();
});

test("a sign-out during refresh() wins over the refresh's answer", async () => {
  const { sb, store } = harness();
  store.subscribe(() => {});
  await settle();

  const release = sb.holdGetUser();
  const refreshing = store.refresh(); // getUser in flight; it will still answer u1
  sb.emit("SIGNED_OUT", null);
  assert.equal(store.getSnapshot().session.isLoggedIn, false);
  release();
  await refreshing;
  await settle();
  assert.equal(store.getSnapshot().session.isLoggedIn, false, "the refresh did not restore the user");
  store.dispose();
});
