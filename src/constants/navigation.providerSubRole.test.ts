/**
 * Live check of 13 Nov, row 19: the notary's links were added only through
 * active_roles, so a provider whose own specialty is notary never saw them.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.providerSubRole.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getSidebarByUserType } from "./navigation.sidebars.ts";

const hrefs = (groups: { items: { href: string }[] }[]) => groups.flatMap((g) => g.items.map((i) => i.href));
const NOTARY = "/dashboard/provider/notary/requests";
// The notary rows are «قريباً»: owner ق٢٦-١ hides them from the menu drawn, so
// the merge is checked on the menu WITH them (keepUnbuilt, the last argument).
const KEEP = [false, null, null, null, null, false, true] as const;

test("a notary provider sees the notary section", () => {
  assert.ok(hrefs(getSidebarByUserType("provider", "full", "notary", [], null, null, null, ...KEEP)).includes(NOTARY));
});

test("the notary section is listed once even when active_roles also names notary", () => {
  const seen = hrefs(getSidebarByUserType("provider", "full", "notary", ["notary"], null, null, null, ...KEEP));
  assert.equal(seen.filter((h) => h === NOTARY).length, 1);
});

test("a provider with no notary specialty does not get the notary section", () => {
  assert.equal(hrefs(getSidebarByUserType("provider", "full", null, [], null, null, null, ...KEEP)).includes(NOTARY), false);
  assert.equal(hrefs(getSidebarByUserType("provider", "full", "arbitrator", [], null, null, null, ...KEEP)).includes(NOTARY), false);
  assert.equal(hrefs(getSidebarByUserType("provider", "full", "bailiff", [], null, null, null, ...KEEP)).includes(NOTARY), false);
});

test("a lawyer who is also a notary (active_roles): the section's rows sit under /dashboard/provider, so ق٢٦-١ hides them from his menu", () => {
  // Merged before the filters (the provider pages are another account type's — routeAccess refuses a lawyer)…
  assert.equal(hrefs(getSidebarByUserType("lawyer", "full", null, ["notary"])).includes(NOTARY), false);
  // …while the notary provider keeps them in the menu once built.
  assert.ok(hrefs(getSidebarByUserType("provider", "full", "notary", [], null, null, null, ...KEEP)).includes(NOTARY));
});
