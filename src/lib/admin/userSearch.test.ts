/**
 * Owner answer ٢٣٥ §4 (27 Nov 2026): the admin member search also finds the
 * mobile, typed in any spelling (batch l18-answers).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/admin/userSearch.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminUserSearchClause, phoneSearchDigits } from "./userSearch.ts";

test("every spelling of a Saudi mobile folds to its national digits", () => {
  for (const typed of ["0551234567", "551234567", "966551234567", "+966551234567", "00966551234567", "+966 55 123 4567", "055-123-4567", "٠٥٥١٢٣٤٥٦٧"]) {
    assert.equal(phoneSearchDigits(typed), "551234567", typed);
  }
});

test("a partial number searches its digits; too short or not a number is no phone search", () => {
  assert.equal(phoneSearchDigits("4567"), "4567");
  assert.equal(phoneSearchDigits("05512"), "5512");
  assert.equal(phoneSearchDigits("055"), null);
  assert.equal(phoneSearchDigits("123"), null);
  assert.equal(phoneSearchDigits("مكتب 5"), null);
  assert.equal(phoneSearchDigits("ahmed@x.sa"), null);
  assert.equal(phoneSearchDigits("12+34"), null);
});

test("the clause keeps the three name/e-mail arms and adds the phone arm only for a number", () => {
  assert.equal(adminUserSearchClause(null), null);
  assert.equal(adminUserSearchClause("   "), null);
  assert.equal(
    adminUserSearchClause("أحمد"),
    "display_name.ilike.%أحمد%,display_name_en.ilike.%أحمد%,email.ilike.%أحمد%",
  );
  assert.equal(
    adminUserSearchClause("0551234567"),
    "display_name.ilike.%0551234567%,display_name_en.ilike.%0551234567%,email.ilike.%0551234567%,phone.ilike.%551234567%",
  );
  assert.match(adminUserSearchClause("+966 55 123 4567") ?? "", /,phone\.ilike\.%551234567%$/);
});

test("characters that break a PostgREST or() token never reach the clause", () => {
  const c = adminUserSearchClause('a,b(c)d\\e"f') ?? "";
  assert.equal(c, "display_name.ilike.%abcdef%,display_name_en.ilike.%abcdef%,email.ilike.%abcdef%");
  for (const ch of [",", "(", ")", "\\", '"']) assert.equal(c.split(",").length, 3, ch);
});

test("the admin users route builds its search from this module (both the page and the counts)", () => {
  const route = readFileSync(new URL("../../app/api/v1/admin/users/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ adminUserSearchClause \} from "@\/lib\/admin\/userSearch";/);
  assert.match(route, /const searchClause = adminUserSearchClause;/);
  assert.equal((route.match(/q\.or\(orClause\)|query\.or\(orClause\)/g) ?? []).length, 2);
});

test("both admin screens show the mobile beside the name and e-mail", () => {
  const users = readFileSync(new URL("../../app/dashboard/admin/users/page.tsx", import.meta.url), "utf8");
  assert.match(users, /\{user\.phone \|\| "—"\}/);
  assert.match(users, /بحث بالاسم أو البريد أو الجوال/);
  const ent = readFileSync(new URL("../../app/dashboard/admin/entitlements/page.tsx", import.meta.url), "utf8");
  assert.match(ent, /\{u\.phone \|\| "—"\}/);
  assert.match(ent, /\{selected\.phone \|\| "—"\}/);
  assert.match(ent, /async function refreshSelected\(id: string\)/);
});
