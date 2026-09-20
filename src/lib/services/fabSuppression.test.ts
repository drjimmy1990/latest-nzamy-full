import test from "node:test";
import assert from "node:assert/strict";

/**
 * `isFabSuppressedPath` lives in src/components/FloatingButtons.tsx, which is a
 * "use client" React module that imports framer-motion and @phosphor-icons —
 * `node --test` cannot load it. The predicate is therefore re-stated here,
 * CHARACTER FOR CHARACTER, and the first test asserts the source file still
 * contains this exact text.
 *
 * That is the same discipline `countVaultDocuments` uses in businessOverview.ts
 * for the vault predicate, and for the same reason: a paraphrase is what drifts.
 */
const FAB_SUPPRESSED_PREFIXES = ["/dashboard"] as const;

function isFabSuppressedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return FAB_SUPPRESSED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/** Mirror of the phone-only auth suppression — see FloatingButtons.tsx. */
const FAB_MOBILE_SUPPRESSED_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/auth",
] as const;

function isFabMobileSuppressedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return FAB_MOBILE_SUPPRESSED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

test("the copy here still matches the source of truth", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile("src/components/FloatingButtons.tsx", "utf8");
  assert.ok(
    src.includes('const FAB_SUPPRESSED_PREFIXES = ["/dashboard"] as const;'),
    "the prefix list in FloatingButtons.tsx changed — update this file with it",
  );
  // The phone-only auth list is a second source of truth and drifts the same
  // way, so it is guarded entry-by-entry plus a count, which also catches a
  // route ADDED there and not here.
  for (const prefix of FAB_MOBILE_SUPPRESSED_PREFIXES) {
    assert.ok(
      src.includes(`"${prefix}",`),
      `FAB_MOBILE_SUPPRESSED_PREFIXES no longer contains ${prefix} — update this file with it`,
    );
  }
  const mobileList = src.match(/const FAB_MOBILE_SUPPRESSED_PREFIXES = \[([\s\S]*?)\] as const;/);
  assert.ok(mobileList, "FAB_MOBILE_SUPPRESSED_PREFIXES is no longer an array literal");
  assert.equal(
    (mobileList[1].match(/"/g) ?? []).length / 2,
    FAB_MOBILE_SUPPRESSED_PREFIXES.length,
    "FloatingButtons.tsx suppresses a different NUMBER of auth prefixes than this copy",
  );
  assert.ok(
    src.includes("(p) => pathname === p || pathname.startsWith(p + \"/\"),"),
    "the match rule in FloatingButtons.tsx changed — update this file with it",
  );
});

test("all dashboard workspaces suppress the public support/order FAB", () => {
  assert.equal(isFabSuppressedPath("/dashboard/admin"), true);
  assert.equal(isFabSuppressedPath("/dashboard/admin/users"), true);
  assert.equal(isFabSuppressedPath("/dashboard/admin/service-orders"), true);
  assert.equal(isFabSuppressedPath("/dashboard/lawyer/tasks"), true);
  assert.equal(isFabSuppressedPath("/dashboard/lawyer/hearings"), true);
  assert.equal(isFabSuppressedPath("/dashboard/client"), true);
  assert.equal(isFabSuppressedPath("/dashboard"), true);
});

test("auth screens hide it ON PHONES ONLY — owner-ledger item ١٦٨", () => {
  // At 375px the FAB lands on top of the «سجّل مجاناً» link that /login exists
  // to surface. At desktop width it sits in empty margin, so this is a phone
  // rule applied as `hidden lg:flex` on the container, NOT an unmount.
  assert.equal(isFabMobileSuppressedPath("/login"), true);
  assert.equal(isFabMobileSuppressedPath("/register"), true);
  assert.equal(isFabMobileSuppressedPath("/register/client"), true);
  assert.equal(isFabMobileSuppressedPath("/register/provider"), true);
  assert.equal(isFabMobileSuppressedPath("/forgot-password"), true);
  assert.equal(isFabMobileSuppressedPath("/auth/callback"), true);
});

test("auth screens are NOT unmounted — the desktop site is untouched", () => {
  // The guarantee the owner asked for in as many words: fixing the phone must
  // not change the desktop. These paths stay OUT of the hard-suppression list,
  // so on desktop the component mounts and renders exactly as it always did.
  assert.equal(isFabSuppressedPath("/login"), false);
  assert.equal(isFabSuppressedPath("/register"), false);
  assert.equal(isFabSuppressedPath("/forgot-password"), false);
  assert.equal(isFabSuppressedPath("/auth/callback"), false);
});

test("the auth prefixes do not swallow their neighbours", () => {
  // Same guarantee the admin prefix already had: `=== p` or `p + "/"`, never a
  // bare startsWith, so a future marketing route is not caught by accident.
  assert.equal(isFabMobileSuppressedPath("/login-help"), false);
  assert.equal(isFabMobileSuppressedPath("/registered-lawyers"), false);
  assert.equal(isFabMobileSuppressedPath("/authors"), false);
});

test("non-dashboard authenticated tools keep the support/order path", () => {
  // `FloatingButtons → CreateClient` is a real execution flow: the widget
  // takes `isLoggedIn`, greets a known user by name, and can open a service
  // request. The screenshots complain that it lands on top of things, not that
  // it exists; the z-index is what fixes that. Deleting it here would have
  // removed a way to order, to fix a way to overlap.
  assert.equal(isFabSuppressedPath("/ai/procedures"), false);
  assert.equal(isFabSuppressedPath("/settings"), false);
});

test("public marketing and the legal library keep it", () => {
  assert.equal(isFabSuppressedPath("/"), false);
  assert.equal(isFabSuppressedPath("/pricing"), false);
  assert.equal(isFabSuppressedPath("/laws/labor-law"), false);
  assert.equal(isFabSuppressedPath("/precedents/judgment/123"), false);
  assert.equal(isFabSuppressedPath("/community"), false);
});

test("a prefix match must not swallow its neighbours", () => {
  // This is why the rule is `=== p || startsWith(p + "/")` and not a bare
  // `startsWith(p)` — silently, since nothing renders an error when a button
  // simply fails to appear. It guards any prefix added here later.
  assert.equal(isFabSuppressedPath("/dashboarding"), false);
});

test("the FAB sits below every dialog in the product", async () => {
  // The stacking half of the fix, asserted against the real z-indexes so a
  // future modal at a lower layer cannot silently reintroduce shot 25.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile("src/components/FloatingButtons.tsx", "utf8");
  assert.ok(!src.includes("z-[9999] flex flex-col"), "the FAB is back above every overlay");
  // Matched as "z-40 … flex-col items-center" rather than one literal run: the
  // container now interpolates a phone-only `hidden lg:flex` between the two,
  // and a literal match would fail on a change that never touched the layer.
  assert.match(
    src,
    /z-40[^`]*flex-col items-center/,
    "the FAB lost its z-40 band",
  );
  const hearingModal = await readFile(
    "src/app/dashboard/lawyer/_components/AddHearingModal.tsx", "utf8");
  // 60 is the LOWEST overlay in the app; the FAB must stay under it.
  assert.ok(hearingModal.includes("z-[60]"),
    "AddHearingModal changed layer — re-check that the FAB is still below every modal");
});

test("no pathname means no suppression", () => {
  // `usePathname()` can be null before the router settles. Defaulting to
  // "suppress" would blink the FAB out on public pages during navigation.
  assert.equal(isFabSuppressedPath(null), false);
  assert.equal(isFabSuppressedPath(""), false);
});
