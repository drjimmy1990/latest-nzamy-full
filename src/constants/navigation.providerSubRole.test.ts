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

test("a notary provider sees the notary section", () => {
  assert.ok(hrefs(getSidebarByUserType("provider", "full", "notary")).includes(NOTARY));
});

test("the notary section is listed once even when active_roles also names notary", () => {
  const seen = hrefs(getSidebarByUserType("provider", "full", "notary", ["notary"]));
  assert.equal(seen.filter((h) => h === NOTARY).length, 1);
});

test("a provider with no notary specialty does not get the notary section", () => {
  assert.equal(hrefs(getSidebarByUserType("provider", "full", null)).includes(NOTARY), false);
  assert.equal(hrefs(getSidebarByUserType("provider", "full", "arbitrator")).includes(NOTARY), false);
  assert.equal(hrefs(getSidebarByUserType("provider", "full", "bailiff")).includes(NOTARY), false);
});

test("a lawyer who is also a notary (active_roles) keeps the section, as before", () => {
  assert.ok(hrefs(getSidebarByUserType("lawyer", "full", null, ["notary"])).includes(NOTARY));
});
