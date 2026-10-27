/**
 * ONE signed-in session per browser tab, shared by every useUser() caller.
 *
 * Before this module each useUser() call kept its own copy: its own
 * `supabase.auth.getUser()`, its own profile + four membership reads (plus
 * practice_kind / staff_role), and its own `onAuthStateChange` listener that
 * re-read everything on every auth event. 123 files call useUser(), and the
 * gates nest — app/ai/layout.tsx → dashboard/business/layout.tsx →
 * UserTypeGuard → ConsultantGate → the page — each holding its children until
 * ITS OWN read finished, so the reads ran as a waterfall behind supabase-js's
 * auth lock: 490 requests and ~45 s before /ai/najiz-optimizer rendered for an
 * admin (prod, 2026-10-28). Now the mount read and each auth event run once,
 * every caller subscribes to that one result, and a component that mounts
 * after the session has resolved gets it at once, `loading: false`, no fetch.
 *
 * The store starts on its first subscriber and is never torn down in the
 * browser: a route change that briefly unmounts every consumer must not
 * re-read. A sign-out navigates away (a full load), which starts a new one.
 *
 * Dependency-free apart from types and the readers in userSession.ts
 * (node --test loads it: userSessionStore.test.ts); the client is injected.
 */
import type { User } from "@supabase/supabase-js";
import type { createClient } from "../lib/supabase/client.ts";
import type { ActiveEntityMemberships } from "../lib/auth/entityMembership.ts";
import { toPracticeKind, type PracticeKind } from "../lib/auth/practiceKind.ts";
import type { StaffRole } from "../lib/auth/staffRoles.ts";
import {
  GUEST_SESSION,
  mapSupabaseUser,
  readEntityMemberships,
  readPracticeKind,
  readProfileUserType,
  readStaffRole,
} from "./userSession.ts";
import type { MembershipState, ProfileState, UserSession } from "./useUser.ts";

type SupabaseClient = ReturnType<typeof createClient>;

export interface UserSessionSnapshot {
  session: UserSession;
  loading: boolean;
}

/**
 * What every useUser() renders before the session is known: on the server, in
 * the hydration pass, and on the client until the mount read finishes — a
 * guest, still loading. One constant, so useSyncExternalStore sees one value.
 */
export const LOADING_SNAPSHOT: UserSessionSnapshot = { session: GUEST_SESSION, loading: true };

export interface UserSessionStoreDeps {
  createClient: () => SupabaseClient;
}

export interface UserSessionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => UserSessionSnapshot;
  /** Tests only: drop the auth listener and ignore every read still in flight. */
  dispose: () => void;
}

export function createUserSessionStore(deps: UserSessionStoreDeps): UserSessionStore {
  // Replaced, never mutated: useSyncExternalStore re-renders on a new object.
  let snapshot: UserSessionSnapshot = LOADING_SNAPSHOT;
  const listeners = new Set<() => void>();

  const emit = (next: UserSessionSnapshot) => {
    snapshot = next;
    for (const l of listeners) l();
  };

  /** Like a React state setter: a new session always re-renders. */
  const setSession = (next: UserSession | ((prev: UserSession) => UserSession)) => {
    const session = typeof next === "function" ? next(snapshot.session) : next;
    emit({ ...snapshot, session });
  };

  /** Like a React state setter: the same value is no change. */
  const setLoading = (loading: boolean) => {
    if (snapshot.loading !== loading) emit({ ...snapshot, loading });
  };

  // The mount read has started (and not thrown). A throw resets it, so the next
  // subscriber retries — the way each new mount used to.
  let started = false;

  // Set by dispose() (tests). Each hook instance used to carry a `cancelled`
  // flag for its own unmount; the shared store outlives every component, so a
  // read in flight is only ever dropped because a newer auth event overtook it.
  let disposed = false;
  let unsubscribe: (() => void) | undefined;

  // Monotonic counter over auth events. Every profile read remembers the value
  // it started with and discards its own result if a newer event has arrived
  // in the meantime. This is what stops a profile read that is still in flight
  // from re-populating a session after the user has already signed out.
  let latestEvent = 0;

  // The user id the last setSession put on screen, or null for a guest.
  // Used to tell a token refresh for the person already rendered (resolve it
  // quietly, no spinner) from a switch to a different person or an arrival
  // from signed-out (hold `loading` until the profile has been read).
  let renderedUserId: string | null = null;

  /** Resolve one signed-in user into a session — profile first, then render. */
  const applyUser = async (
    supabase: SupabaseClient,
    authUser: User,
    eventId: number,
  ) => {
    // practice_kind is read for a lawyer only, so it waits for the profile
    // read — while still overlapping the four membership reads.
    const profileRead = readProfileUserType(supabase, authUser.id);
    const [read, membershipRead, practiceRead, staffRead] = await Promise.all([
      profileRead,
      readEntityMemberships(supabase, authUser.id),
      profileRead.then((r) =>
        r.status === "found" && r.userType === "lawyer" ? readPracticeKind(supabase, authUser.id) : null,
      ),
      // Owner ٢١٠: the staff role, for an admin only (undefined: not read).
      profileRead.then((r) =>
        r.status === "found" && r.userType === "admin" ? readStaffRole(supabase) : undefined,
      ),
    ]);
    // Superseded: drop this result and leave `loading` alone — whichever event
    // overtook this one is responsible for releasing it.
    if (disposed || eventId !== latestEvent) return;

    setSession(prev => {
      // Carry the previously resolved type forward on `unavailable` ONLY, and
      // only for the same signed-in user. Without this, a token refresh while
      // the network is down would downgrade a lawyer to "individual" and
      // UserTypeGuard would throw them off their own dashboard — a regression
      // this change must not introduce. `missing` deliberately does not carry:
      // a row that is absent, or present with no type, is exactly what the
      // "individual" fallback exists for, and papering over it would hide a
      // real data problem.
      const carried =
        read.status === "unavailable" && prev.isLoggedIn && prev.userId === authUser.id
          ? prev.userType
          : null;

      const carriedMemberships: ActiveEntityMemberships =
        membershipRead.status === "unavailable" && prev.isLoggedIn && prev.userId === authUser.id
          ? {
              ...(prev.firmMembership ? { firm: prev.firmMembership } : {}),
              ...(prev.businessMembership ? { business: prev.businessMembership } : {}),
            }
          : {};

      // A carried type means the previous, successful read still stands for
      // this same user, so the session is "ok" — not "unavailable".
      const profileState: ProfileState =
        read.status === "found" || carried !== null
          ? "ok"
          : read.status === "missing"
            ? "missing"
            : "unavailable";

      // WP-6 B-9. «you have no role» and «we could not read your role» are
      // different answers, and the settings policy now denies by default, so
      // the session has to carry which one this is. `degraded` means at
      // least one of the four membership reads failed, so businessRole /
      // affiliation may be an undercount; a carried-forward previous session
      // is likewise not a fresh answer.
      const membershipState: MembershipState =
        membershipRead.status === "found"
          ? membershipRead.degraded
            ? "degraded"
            : "ok"
          : Object.keys(carriedMemberships).length > 0
            ? "degraded"
            : "unavailable";

      // Art. 18. A failed practice_kind read, or a profile read that failed
      // altogether, carries the previous answer forward for this same user,
      // the way the type is carried above — a token refresh on a bad network
      // must not flip a consultant to an advocate and back. With nothing to
      // carry (a first load) it is 'advocate', today's behaviour.
      const practiceKind: PracticeKind =
        practiceRead?.status === "found"
          ? practiceRead.practiceKind
          : (practiceRead?.status === "unavailable" || read.status === "unavailable") &&
              prev.isLoggedIn && prev.userId === authUser.id
            ? toPracticeKind(prev.practiceKind)
            : "advocate";

      // Owner ٢١٠. A profile read that failed carries the previous staff
      // role forward for this same user, like the type; any other failure
      // is null (the full admin nav — the server still enforces).
      const staffRole: StaffRole | null =
        staffRead !== undefined
          ? staffRead
          : read.status === "unavailable" && prev.isLoggedIn && prev.userId === authUser.id
            ? (prev.staffRole ?? null)
            : null;

      return mapSupabaseUser(
        authUser,
        read.status === "found" ? read.userType : carried,
        membershipRead.status === "found" ? membershipRead.memberships : carriedMemberships,
        profileState,
        membershipState,
        practiceKind,
        staffRole,
      );
    });

    renderedUserId = authUser.id;
    setLoading(false);
  };

  const start = () => {
    started = true;

    // The event id the mount claimed, so the `finally` below can tell whether
    // it is still the most recent thing to have happened.
    let mountEvent = 0;

    void (async () => {
      try {
        const supabase = deps.createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (disposed) return;

        if (user) {
          // Both round trips finish before the FIRST setSession of a signed-in
          // user, so there is no intermediate render that reports the wrong
          // type — no "individual" flash to bounce a lawyer off their dashboard.
          mountEvent = ++latestEvent;
          await applyUser(supabase, user, mountEvent);
        } else {
          setSession(GUEST_SESSION);
        }
        if (disposed) return;

        // Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, authSession) => {
            const authUser = authSession?.user ?? null;

            // supabase-js answers every new subscription with INITIAL_SESSION
            // for the session it already holds. Subscribing only after the
            // mount read, that is the very person the mount just resolved (or
            // the guest it just rendered): not a change, so it does not bump
            // the counter or re-read — that re-read used to double every
            // mount's requests. A different person (the mount saw a guest, or
            // a sign-in raced it) still takes the paths below.
            if (event === "INITIAL_SESSION" && (authUser?.id ?? null) === renderedUserId) return;

            latestEvent += 1;

            if (!authUser) {
              // Sign-out, or a session that has gone away. Clear it here and
              // now: the counter was bumped a line above, so any profile read
              // still in flight will drop its result instead of restoring the
              // account that just signed out.
              renderedUserId = null;
              setSession(GUEST_SESSION);
              setLoading(false);
              return;
            }

            // A different person than the one on screen — a sign-in arriving
            // after mount, or an account switch. The session currently
            // rendered describes somebody else (for a sign-in, it is the guest
            // session, whose userType is null), and `loading` was already
            // released by the mount above. Without this, consumers would see
            // that stale session as settled for one tick plus one profile
            // round trip: UserTypeGuard.tsx:32-34 would find null in
            // `allowedTypes`, and flash "صلاحيات غير كافية" at a user who is
            // in fact signed in. Hold the spinner instead, and release it in
            // applyUser once the profile has actually been read.
            //
            // A token refresh for the person already rendered takes the other
            // path: no flip, no spinner, the profile is re-read silently and
            // the session only changes if the answer changed.
            if (renderedUserId !== authUser.id) setLoading(true);

            // Deferred out of the callback instead of awaited inside it. The
            // Supabase auth client holds its lock for as long as the callback
            // runs, and awaiting another Supabase call in there can deadlock it.
            const eventId = latestEvent;
            setTimeout(() => {
              if (disposed || eventId !== latestEvent) return;
              void applyUser(supabase, authUser, eventId);
            }, 0);
          },
        );

        if (disposed) {
          subscription.unsubscribe();
          return;
        }
        unsubscribe = () => subscription.unsubscribe();
      } catch {
        renderedUserId = null;
        started = false;
        if (!disposed) setSession(GUEST_SESSION);
      } finally {
        // Released on every path the mount can take, the throw above included:
        // a hook stuck on `loading: true` leaves UserTypeGuard spinning
        // forever. Skipped only when an auth event has already overtaken the
        // mount — that event raised the spinner deliberately and its own
        // applyUser releases it, so releasing here would undo it. As written
        // there is no `await` between subscribing and this line, so the
        // subscription cannot in fact fire first; the guard is here so that
        // stops being something this block depends on.
        if (!disposed && latestEvent === mountEvent) setLoading(false);
      }
    })();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!started && !disposed) start();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    dispose() {
      disposed = true;
      unsubscribe?.();
      listeners.clear();
    },
  };
}
