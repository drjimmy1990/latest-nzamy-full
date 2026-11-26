/**
 * accountTypeConvert.test.ts — l16 C14 (owner package 25 Nov, §٣.٣): the
 * admin account-type converter's vocabulary, the route's checks, and the
 * wiring (route → the one SQL function; page → the card).
 * The database half is supabase/tests/rls/admin_account_type_l16.test.sql.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/admin/accountTypeConvert.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONVERT_TARGETS,
  blockerLabelsAr,
  convertRefusal,
  fullAccountTypeLabelAr,
  isConvertTarget,
  isConverterMissing,
  readConvertBody,
} from "./accountTypeConvert.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("the five targets are exactly the SQL function's list", () => {
  assert.deepEqual([...CONVERT_TARGETS], ["advocate", "consultant", "notary", "arbitrator", "bailiff"]);
  const sql = read("../../../supabase/migrations/20261206_80_admin_account_type_converter.sql");
  assert.ok(sql.includes("p_target not in ('advocate', 'consultant', 'notary', 'arbitrator', 'bailiff')"));
  for (const bad of ["admin", "lawyer", "firm", "", null, 3]) assert.equal(isConvertTarget(bad), false, String(bad));
});

test("the full type: lawyer and provider carry their kind; the rest is the base label", () => {
  assert.equal(fullAccountTypeLabelAr("lawyer", "consultant"), "محامٍ — مستشار قانوني");
  assert.equal(fullAccountTypeLabelAr("lawyer", "advocate"), "محامٍ — محامٍ مترافع");
  assert.equal(fullAccountTypeLabelAr("provider", "bailiff"), "مزوّد خدمة — مراجع حكومي");
  assert.equal(fullAccountTypeLabelAr("lawyer", null), "محامٍ");
  assert.equal(fullAccountTypeLabelAr("individual", "advocate"), "عميل فرد", "a kind never decorates a type that has none");
  assert.equal(fullAccountTypeLabelAr("strange", null), "نوع غير معروف");
  for (const t of ["individual", "lawyer", "firm", "corporate", "micro", "provider", "government", "ngo", "admin"]) {
    assert.doesNotMatch(fullAccountTypeLabelAr(t, null), /[A-Za-z]/, t);
  }
});

test("the body: a known target and a reason of 5–1000 characters, trimmed", () => {
  assert.deepEqual(readConvertBody({ target: "consultant", reason: "  سبب واضح  " }), { ok: true, target: "consultant", reason: "سبب واضح" });
  assert.equal(readConvertBody({ target: "admin", reason: "سبب واضح" }).ok, false);
  assert.equal(readConvertBody({ target: "notary", reason: "قصير" }).ok, false);
  assert.equal(readConvertBody({ target: "notary", reason: "س".repeat(1001) }).ok, false);
  assert.equal(readConvertBody({ target: "notary" }).ok, false);
  assert.equal(readConvertBody(null).ok, false);
  assert.equal(readConvertBody([]).ok, false);
});

test("each refusal code is an Arabic message with its status; blockers are named", () => {
  const r = convertRefusal({ ok: false, code: "open_commitments", blockers: ["paid_plan", "founder_seat"] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.blockers, ["اشتراك مدفوع ساري", "مقعد في حملة المؤسس"]);
  assert.match(r.error, /اشتراك مدفوع ساري، مقعد في حملة المؤسس/);
  assert.equal(convertRefusal({ code: "not_supported" }).status, 400);
  assert.equal(convertRefusal({ code: "reason_required" }).status, 400);
  assert.equal(convertRefusal({ code: "self" }).status, 400);
  assert.equal(convertRefusal({ code: "actor_not_admin" }).status, 403);
  assert.equal(convertRefusal({ code: "not_found" }).status, 404);
  assert.equal(convertRefusal({ code: "??" }).status, 500);
  for (const code of ["open_commitments", "not_supported", "reason_required", "bad_target", "self", "actor_not_admin", "not_found", "x"]) {
    assert.doesNotMatch(convertRefusal({ code, blockers: ["open_cases"] }).error, /[A-Za-z]/, code);
  }
  assert.deepEqual(blockerLabelsAr(["firm_membership", "open_cases", "weird", 4]), ["عضوية في مكتب محاماة أو ملكية مكتب", "طلب أو قضية مفتوحة", "التزام قائم"]);
  assert.deepEqual(blockerLabelsAr("paid_plan"), []);
});

test("a missing function / table reads as «not installed yet», nothing else does", () => {
  for (const c of ["42883", "PGRST202", "42P01"]) assert.equal(isConverterMissing(c), true, c);
  for (const c of ["23505", "42501", undefined, null]) assert.equal(isConverterMissing(c), false, String(c));
});

test("the route: users.change_type before the one RPC, the actor from the gate, no audit row of its own", () => {
  const route = read("../../app/api/v1/admin/users/[id]/account-type/route.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  const post = route.slice(route.indexOf("export async function POST"));
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.ok(post.indexOf('await requireStaff("users.change_type")') > -1);
  assert.ok(post.indexOf('await requireStaff("users.change_type")') < post.indexOf(".rpc("));
  assert.match(post, /\.rpc\("admin_change_account_type", \{\s*p_user: targetId,\s*p_target: parsed\.target,\s*p_reason: parsed\.reason,\s*p_actor: gate\.userId,/);
  assert.ok(get.indexOf('await requireStaff("read")') > -1 && get.indexOf('await requireStaff("read")') < get.indexOf(".rpc("));
  assert.match(get, /\.rpc\("admin_account_type_state"/);
  for (const gone of ["logAdminAction(", 'from("admin_audit_events")', 'from("profiles")', ".update(", ".insert(", ".delete("]) {
    assert.equal(route.includes(gone), false, gone);
  }
});

test("the page: the card is mounted, and the old control no longer offers individual → lawyer / provider", () => {
  const page = read("../../app/dashboard/admin/users/[id]/page.tsx");
  assert.match(page, /<AccountTypeConverterCard userId=\{U\.id\} isDark=\{isDark\} card=\{card\} onConverted=\{fetchUser\} \/>/);
  assert.ok(page.includes('.filter(t => !(U.user_type === "individual" && (t === "lawyer" || t === "provider")))'));
  const card = read("../../app/dashboard/admin/users/[id]/AccountTypeConverterCard.tsx");
  assert.match(card, /تأكيد التحويل/);
  assert.match(card, /disabled=\{!target \|\| !reasonOk\}/, "no confirm step without a target and a reason");
  assert.match(card, /staffMaySee\(staffRole, "users\.change_type"\)/);
});
