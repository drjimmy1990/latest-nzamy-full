/**
 * Live check of 13 Nov, row 23: a notary could open the arbitrator's pages.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/providerSpecialty.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mayOpenSpecialty, PROVIDER_SPECIALTIES, PROVIDER_SPECIALTY_PREFIXES } from "./providerSpecialty.ts";
import { getSidebarByUserType } from "../../constants/navigation.sidebars.ts";

const APP = join(import.meta.dirname, "../../app");

test("each specialty opens its own pages only; the admin opens all", () => {
  for (const required of PROVIDER_SPECIALTIES) {
    assert.equal(mayOpenSpecialty(required, { userType: "admin", subRole: "unavailable" }), true);
    for (const own of PROVIDER_SPECIALTIES) {
      assert.equal(mayOpenSpecialty(required, { userType: "provider", subRole: own }), own === required, `${own} → ${required}`);
    }
  }
});

test("an unread or missing specialty, or another account type, is refused (fail closed)", () => {
  assert.equal(mayOpenSpecialty("notary", { userType: "provider", subRole: "unavailable" }), false);
  assert.equal(mayOpenSpecialty("notary", { userType: "provider", subRole: null }), false);
  assert.equal(mayOpenSpecialty("notary", { userType: null, subRole: "notary" }), false);
  assert.equal(mayOpenSpecialty("notary", { userType: "lawyer", subRole: "notary" }), false);
});

test("every specialty subtree has a server layout naming its specialty", () => {
  for (const [prefix, specialty] of Object.entries(PROVIDER_SPECIALTY_PREFIXES)) {
    const file = join(APP, prefix.replace(/^\//, ""), "layout.tsx");
    assert.ok(existsSync(file), file);
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /^"use client"/m, "a server layout");
    assert.match(src, new RegExp(`<ProviderSpecialtyGate specialty="${specialty}">`));
  }
});

test("each specialty's sidebar links only into its own subtree", () => {
  for (const specialty of PROVIDER_SPECIALTIES) {
    const hrefs = getSidebarByUserType("provider", "full", specialty).flatMap((g) => g.items.map((i) => i.href.split("?")[0]));
    for (const [prefix, owner] of Object.entries(PROVIDER_SPECIALTY_PREFIXES)) {
      if (owner === specialty) continue;
      for (const href of hrefs) assert.equal(href.startsWith(prefix), false, `${specialty} sidebar links ${href}`);
    }
  }
});

test("the gate reads the specialty from provider_profiles through the RLS client", () => {
  const gate = readFileSync(join(import.meta.dirname, "../../components/auth/ProviderSpecialtyGate.tsx"), "utf8");
  assert.match(gate, /from "@\/lib\/supabase\/server"/);
  assert.doesNotMatch(gate, /createServiceClient|user_metadata/);
  assert.match(gate, /\.from\("provider_profiles"\)\.select\("sub_role"\)/);
});
