import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIBRARY_ACCESS_DEFAULTS,
  LIBRARY_ACCOUNT_LOCKED_AR,
  LIBRARY_ACCOUNT_LOCKED_CODE,
  isLibraryAccountLockedBody,
  isLibraryHref,
  libraryAccessDecision,
  libraryAccountKey,
  libraryAccountLockedBody,
  parseLibraryAccessMap,
  parseLibraryAccessPatch,
  parseOverrideInput,
  withoutLibraryItems,
} from "./accountAccess.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("owner item 9: the account keys — consultant by practice_kind, business types grouped, admin apart", () => {
  assert.equal(libraryAccountKey("lawyer", "advocate"), "lawyer");
  assert.equal(libraryAccountKey("lawyer", null), "lawyer"); // no lawyer_profiles row = advocate
  assert.equal(libraryAccountKey("lawyer", "consultant"), "consultant");
  assert.equal(libraryAccountKey("firm", "consultant"), "firm");
  assert.equal(libraryAccountKey("individual", null), "individual");
  for (const t of ["corporate", "micro", "government", "ngo"]) assert.equal(libraryAccountKey(t, null), "business");
  assert.equal(libraryAccountKey("provider", null), "provider");
  assert.equal(libraryAccountKey("admin", null), "admin");
  assert.equal(libraryAccountKey("martian", null), null);
  assert.equal(libraryAccountKey(undefined, null), null);
});

test("owner ق٢٦-٢: the defaults — lawyer, consultant and firm open, every other type closed", () => {
  assert.deepEqual({ ...LIBRARY_ACCESS_DEFAULTS }, {
    lawyer: true, consultant: true, firm: true, individual: false, business: false, provider: false,
  });
  assert.deepEqual(parseLibraryAccessMap(null), { ...LIBRARY_ACCESS_DEFAULTS });
  assert.deepEqual(parseLibraryAccessMap({ firm: "yes", individual: true, extra: true }), {
    ...LIBRARY_ACCESS_DEFAULTS, individual: true,
  });
});

test("the decision: admin always, an exception wins both ways, else the switch; no profile closed", () => {
  const map = { individual: true };
  assert.deepEqual(libraryAccessDecision({ userType: "admin", practiceKind: null, map: { lawyer: false }, override: false }),
    { allowed: true, accountKey: "admin", via: "admin" });
  assert.deepEqual(libraryAccessDecision({ userType: "firm", practiceKind: null, map, override: true }),
    { allowed: true, accountKey: "firm", via: "override" });
  assert.deepEqual(libraryAccessDecision({ userType: "lawyer", practiceKind: null, map, override: false }),
    { allowed: false, accountKey: "lawyer", via: "override" });
  assert.equal(libraryAccessDecision({ userType: "individual", practiceKind: null, map, override: null }).allowed, true);
  // ق٢٦-٢: an unsaved firm / consultant key reads as the new default (open); a saved false stays closed.
  assert.equal(libraryAccessDecision({ userType: "firm", practiceKind: null, map, override: null }).allowed, true);
  assert.equal(libraryAccessDecision({ userType: "firm", practiceKind: null, map: { firm: false }, override: null }).allowed, false);
  assert.equal(libraryAccessDecision({ userType: "lawyer", practiceKind: "consultant", map: null, override: null }).allowed, true);
  assert.equal(libraryAccessDecision({ userType: "lawyer", practiceKind: "consultant", map: { consultant: false }, override: null }).allowed, false);
  assert.equal(libraryAccessDecision({ userType: "corporate", practiceKind: null, map: null, override: null }).allowed, false);
  assert.equal(libraryAccessDecision({ userType: "lawyer", practiceKind: "advocate", map: null, override: null }).allowed, true);
  assert.deepEqual(libraryAccessDecision({ userType: null, practiceKind: null, map, override: true }),
    { allowed: false, accountKey: null, via: "no_profile" });
  assert.equal(libraryAccessDecision({ userType: "martian", practiceKind: null, map: { lawyer: true }, override: null }).allowed, false);
});

test("the locked answer carries the owner's sentence (ق٢٦-٢ wording) and a code", () => {
  assert.equal(LIBRARY_ACCOUNT_LOCKED_AR, "المكتبة القانونية متاحة حالياً للمحامين والمستشارين القانونيين ومكاتب المحاماة، وستُفتح لحسابات أخرى قريباً");
  const body = libraryAccountLockedBody();
  assert.equal(body.error, LIBRARY_ACCOUNT_LOCKED_AR);
  assert.equal(body.code, LIBRARY_ACCOUNT_LOCKED_CODE);
  assert.ok(isLibraryAccountLockedBody(body));
  assert.ok(!isLibraryAccountLockedBody({ error: "x", libraryClosed: true }));
  assert.ok(!isLibraryAccountLockedBody(null));
});

test("the admin's patch: known keys, booleans only, at least one", () => {
  assert.deepEqual(parseLibraryAccessPatch({ map: { firm: true, individual: false } }), { ok: true, patch: { firm: true, individual: false } });
  assert.equal(parseLibraryAccessPatch({ map: { firms: true } }).ok, false);
  assert.equal(parseLibraryAccessPatch({ map: { firm: "true" } }).ok, false);
  assert.equal(parseLibraryAccessPatch({ map: {} }).ok, false);
  assert.equal(parseLibraryAccessPatch({}).ok, false);
  assert.equal(parseLibraryAccessPatch({ map: [true] }).ok, false);
});

test("an exception needs an account, a decision and a reason", () => {
  const ok = parseOverrideInput({ email: " A@B.SA ", allowed: true, reason: "فريق العمل" });
  // Q94a (l12): an old body (no end) is a permanent exception.
  assert.deepEqual(ok, { ok: true, userId: null, email: "a@b.sa", allowed: true, reason: "فريق العمل", expiresAt: null, endsWithSubscription: false });
  const byId = parseOverrideInput({ userId: "00000000-0000-0000-0000-0000000000AA", allowed: false, reason: "تجربة" });
  assert.equal(byId.ok && byId.userId, "00000000-0000-0000-0000-0000000000aa");
  assert.equal(parseOverrideInput({ email: "nope", allowed: true, reason: "تجربة" }).ok, false);
  assert.equal(parseOverrideInput({ email: "a@b.sa", reason: "تجربة" }).ok, false);
  assert.equal(parseOverrideInput({ email: "a@b.sa", allowed: true, reason: " " }).ok, false);
  assert.equal(parseOverrideInput({ email: "a@b.sa", allowed: true, reason: "x".repeat(501) }).ok, false);
});

test("the sidebar loses the library rows (children too) and empty groups", () => {
  assert.ok(isLibraryHref("/laws"));
  assert.ok(isLibraryHref("/laws/my"));
  assert.ok(isLibraryHref("/precedents/x"));
  assert.ok(!isLibraryHref("/lawsuit"));
  assert.ok(!isLibraryHref("/dashboard/admin/content/laws"));
  const groups = [
    { title: "a", items: [{ href: "/laws" }, { href: "/ai/draft", children: [{ href: "/laws/my" }, { href: "/x" }] }] },
    { title: "b", items: [{ href: "/laws" }] },
  ];
  assert.deepEqual(withoutLibraryItems(groups), [{ title: "a", items: [{ href: "/ai/draft", children: [{ href: "/x" }] }] }]);
});

test("wiring: the gate covers every entry point the brief names", () => {
  const gate = read("../library-gate.ts");
  assert.match(gate, /libraryGate\(opts: \{ accountLock\?: boolean \} = \{\}\)/);
  assert.match(gate, /opts\.accountLock === false \? null : libraryAccountGate\(\)/);
  // the lawyers' AI tools are not locked; the library assistant is
  assert.match(read("../../app/api/v1/ai/runs/route.ts"), /libraryGate\(\{ accountLock: isLibraryAiTool\(toolId\) \}\)/);
  assert.match(read("../../app/api/library/stats/route.ts"), /libraryGate\(\{ accountLock: false \}\)/);
  for (const rel of [
    "../../app/api/library/folders/route.ts",
    "../../app/api/library/folders/items/route.ts",
    "../../app/api/v1/library/notes/route.ts",
    "../../app/api/v1/library/notes/audio-url/route.ts",
    "../../app/api/v1/library/invitations/redeem/route.ts",
    "../../app/api/v1/ai/library-history/route.ts",
    "../../app/api/v1/drafts/cart/route.ts",
  ]) {
    const src = read(rel);
    const handlers = src.match(/export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*\) \{\r?\n/g) ?? [];
    assert.ok(handlers.length > 0, rel);
    for (const h of handlers) {
      const at = src.indexOf(h) + h.length;
      assert.match(src.slice(at, at + 120), /^\s*const libraryLocked = await libraryAccountGate\(\);/, `${rel}: ${h.trim()}`);
    }
  }
  // every /api/library route that does not call libraryAccountGate itself calls libraryGate()
  const checkout = read("../payments/checkoutCore.ts");
  // l14: the ERP + library bundle (a plan carrying a library pass) is locked the same way
  assert.match(checkout, /\(known\.kind === "library" \|\| known\.libraryByBilling\) && deps\.libraryAccountAllowed/);
  assert.match(read("../../app/api/v1/payments/checkout/route.ts"), /libraryAccountAllowed: async \(userId\) => \(await readLibraryAccountAccess\(userId\)\)\.allowed/);
});

test("wiring: a bearer token is a signed-in caller, never a guest (createClient honours it)", () => {
  const server = read("./accountAccessServer.ts");
  assert.ok(server.includes(String.raw`const bearer = /^\s*bearer\s+\S/i.test(auth);`));
  assert.match(server, /if \(!bearer && !hasSupabaseAuthCookie\(/);
  assert.match(read("../supabase/server.ts"), /Authorization: authHeader/);
});

test("wiring: the client shows the lock before any library page, /laws/subscribe included", () => {
  const guard = read("../../components/library/LibraryGuard.tsx");
  const lock = guard.indexOf("if (lib.accountLock)");
  const open = guard.indexOf("if (alwaysOpen) return <>{children}</>;");
  assert.ok(lock > 0 && open > lock, "the account lock is checked before the always-open paths");
  assert.match(read("../../app/api/v1/library/status/route.ts"), /accountLock: accountLocked \? \{ message: LIBRARY_ACCOUNT_LOCKED_AR \} : null/);
  assert.match(read("../../components/dashboard/SharedSidebar.tsx"), /libraryLock\.locked \? withoutLibraryItems\(roleGroups\) : roleGroups/);
  assert.match(read("../../components/LegalLibraryBanner.tsx"), /libraryLock\.loading \|\| libraryLock\.locked\) return null/);
});
