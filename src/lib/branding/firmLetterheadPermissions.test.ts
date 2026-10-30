/**
 * firmLetterheadPermissions.test.ts — owner answer ٣١٥: only the firm owner,
 * the managing partner and the office manager may print the firm's letterhead,
 * as an EXPLICIT permission enforced on the server and in the UI.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  FIRM_LETTERHEAD_GRANTS,
  LETTERHEAD_PERMISSIONS,
  firmHas,
  letterheadPermissionsFor,
} from "./firmLetterheadPermissions.ts";
import { FIRM_BRANDING_ROLES } from "./brandingVault.ts";
import { getFirmRouteDecision } from "../../constants/entityRouteAccess.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Every role the firm_members CHECK allows (20260603_phase1_002_entities.sql).
const ALL_FIRM_ROLES = [
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
  "legal_secretary", "office_admin", "finance_manager", "hr_manager",
  "compliance_manager", "external_of_counsel", "legal_consultant", "in_house_counsel",
];

test("٣١٥: letterhead.print is held by the owner, managing_partner and office_admin — nobody else", () => {
  assert.equal(firmHas({ isOwner: true, role: "lawyer" }, "letterhead.print"), true, "the owner, whatever his member row says");
  for (const role of ALL_FIRM_ROLES) {
    const expected = role === "managing_partner" || role === "office_admin";
    assert.equal(firmHas({ isOwner: false, role }, "letterhead.print"), expected, role);
  }
  assert.equal(firmHas({ isOwner: false, role: null }, "letterhead.print"), false);
  assert.equal(firmHas({ isOwner: false, role: "owner" }, "letterhead.print"), false, "a role string is not ownership");
  assert.equal(firmHas({ isOwner: false, role: "managing_partner" }, "letterhead.delete" as never), false, "unknown permission");
});

test("every permission is an explicit grant; the roles exist in the firm_members CHECK", () => {
  const ddl = read("../../../supabase/migrations/20260603_phase1_002_entities.sql");
  const check = /create table if not exists public\.firm_members[\s\S]*?check \(role in \(([\s\S]*?)\)\)/.exec(ddl);
  assert.ok(check, "firm_members role CHECK found");
  const modelled = new Set([...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  for (const p of LETTERHEAD_PERMISSIONS) {
    const g = FIRM_LETTERHEAD_GRANTS[p];
    assert.ok(g, p);
    for (const r of g.roles) assert.ok(modelled.has(r), `${p}: ${r} is a real firm_members role`);
  }
});

test("the explicit grants agree with the database gate, the route rules and the vault constant", () => {
  const sql = read("../../../supabase/migrations/20261026_63_branding_vault.sql");
  const m = /m\.role in \(([^)]*)\)/.exec(sql);
  assert.ok(m, "can_manage_branding_vault role list found");
  const dbRoles = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual([...FIRM_LETTERHEAD_GRANTS["branding.manage"].roles].sort(), dbRoles);
  assert.deepEqual([...FIRM_LETTERHEAD_GRANTS["letterhead.print"].roles].sort(), dbRoles);
  assert.deepEqual([...FIRM_BRANDING_ROLES].sort(), dbRoles);
  for (const role of ALL_FIRM_ROLES) {
    const may = firmHas({ isOwner: false, role }, "letterhead.print");
    for (const path of ["/dashboard/firm/vault", "/dashboard/firm/letterhead"]) {
      assert.equal(getFirmRouteDecision(path, role as never).allowed, may, `${path} for ${role}`);
    }
  }
});

test("the flags the page receives", () => {
  assert.deepEqual(letterheadPermissionsFor("lawyer"), { print: true, manage: true });
  assert.deepEqual(letterheadPermissionsFor("firm", null), { print: false, manage: false });
  assert.deepEqual(letterheadPermissionsFor("firm", { isOwner: false, role: "office_admin" }), { print: true, manage: true });
  assert.deepEqual(letterheadPermissionsFor("firm", { isOwner: false, role: "partner" }), { print: false, manage: false });
});

test("the server asks for the permission BY NAME: GET needs letterhead.print, writes need branding.manage", () => {
  const server = read("./brandingServer.ts");
  assert.match(server, /if \(!firmHas\(firm, need\)\)/, "the firm gate is the named permission");
  assert.ok(!/FIRM_BRANDING_ROLES/.test(server), "no implied role set in the gate");
  const route = read("../../app/api/v1/branding/route.ts");
  const get = route.slice(route.indexOf("export async function GET("), route.indexOf("export async function PUT("));
  assert.match(get, /resolveBrandingCaller\(.*, "letterhead\.print"\);/);
  assert.match(get, /permissions: owner\.permissions/);
  const put = route.slice(route.indexOf("export async function PUT("));
  assert.match(put, /resolveBrandingCaller\(request\.nextUrl\.searchParams\.get\("scope"\)\)/, "PUT keeps the manage default");
});
