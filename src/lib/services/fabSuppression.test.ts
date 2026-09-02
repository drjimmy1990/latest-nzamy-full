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
const FAB_SUPPRESSED_PREFIXES = ["/dashboard/admin"] as const;

function isFabSuppressedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return FAB_SUPPRESSED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

test("the copy here still matches the source of truth", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile("src/components/FloatingButtons.tsx", "utf8");
  assert.ok(
    src.includes('const FAB_SUPPRESSED_PREFIXES = ["/dashboard/admin"] as const;'),
    "the prefix list in FloatingButtons.tsx changed — update this file with it",
  );
  assert.ok(
    src.includes("(p) => pathname === p || pathname.startsWith(p + \"/\"),"),
    "the match rule in FloatingButtons.tsx changed — update this file with it",
  );
});

test("the admin console, where the button covered a row's controls", () => {
  // Shot 07: the FAB physically over the third user row, hiding its «تحقق»
  // button and its overflow menu. Staff-facing screen, no customer CTA.
  assert.equal(isFabSuppressedPath("/dashboard/admin"), true);
  assert.equal(isFabSuppressedPath("/dashboard/admin/users"), true);
  assert.equal(isFabSuppressedPath("/dashboard/admin/service-orders"), true);
});

test("every OTHER authenticated surface keeps it — it is an ordering path", () => {
  // `FloatingButtons → CreateClient` is a real execution flow: the widget
  // takes `isLoggedIn`, greets a known user by name, and can open a service
  // request. The screenshots complain that it lands on top of things, not that
  // it exists; the z-index is what fixes that. Deleting it here would have
  // removed a way to order, to fix a way to overlap.
  assert.equal(isFabSuppressedPath("/dashboard/lawyer/tasks"), false);
  assert.equal(isFabSuppressedPath("/dashboard/lawyer/hearings"), false);
  assert.equal(isFabSuppressedPath("/dashboard/client"), false);
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
  assert.equal(isFabSuppressedPath("/dashboard/administrator"), false);
  assert.equal(isFabSuppressedPath("/dashboard/admins"), false);
  assert.equal(isFabSuppressedPath("/dashboard"), false);
});

test("the FAB sits below every dialog in the product", async () => {
  // The stacking half of the fix, asserted against the real z-indexes so a
  // future modal at a lower layer cannot silently reintroduce shot 25.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile("src/components/FloatingButtons.tsx", "utf8");
  assert.ok(!src.includes("z-[9999] flex flex-col"), "the FAB is back above every overlay");
  assert.ok(src.includes("z-40 flex flex-col items-center"), "the FAB lost its z-40 band");
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
