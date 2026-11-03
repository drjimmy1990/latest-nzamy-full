/**
 * ownerAnswers30Oct.test.ts — owner answers ٣٠٧–٣١٣ (package 2026-10-30) on
 * the code side. The database side is proved in Docker by
 * supabase/tests/rls/accounts_firms_owner_answers.test.sql (20261030_12).
 * Ledger: docs/audits/2026-10-30-owner-package-accounts-firms.md.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/accountDeletion/ownerAnswers30Oct.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_FROZEN_AR,
  ADMIN_FREEZE_AR,
  deletionErrorAr,
  deletionSuspendedAr,
  entityOwnerBlockAr,
  normalizeOwnerBlock,
  purgeBlockedAr,
} from "../auth/accountFreeze.ts";
import { readOwnerBlock } from "./accountDeletionServer.ts";
import { fileFolderOwner, isPathInOwnerFolder } from "../storagePathOwnership.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ── ٣٠٧ the refusal promises no ownership-transfer screen ─────────────────
test("٣٠٧: an entity owner's refusal says transfer is needed and not available — never «انقل الملكية»", () => {
  const cases: Array<[string, RegExp]> = [
    ["ACCOUNT_DELETION_ENTITY_OWNER:firm", /المكتب/],
    ["ACCOUNT_DELETION_ENTITY_OWNER:business", /الشركة/],
    ["ACCOUNT_DELETION_ENTITY_OWNER:ngo", /الجمعية/],
    ["ACCOUNT_DELETION_ENTITY_OWNER:government", /الجهة/],
    // the auth.users trigger's wording, as GoTrue may pass it on
    ["Database error deleting user: ACCOUNT_DELETE_ENTITY_OWNER: account x owns a firm that still has members", /المكتب/],
    ["ACCOUNT_DELETE_ENTITY_OWNER: account x owns a business that still has members", /الشركة/],
  ];
  for (const [message, entity] of cases) {
    const ar = deletionErrorAr(message);
    assert.match(ar, entity, message);
    assert.match(ar, /نقل الملكية غير متاح/, message);
    assert.match(ar, /تواصل مع الدعم/, message);
    assert.doesNotMatch(ar, /انقل الملكية|أخرج الأعضاء/, message);
  }
});

test("٣٠٧: the block kinds, and the suspended-deletion copy", () => {
  for (const k of ["firm", "business", "government", "ngo"]) assert.equal(normalizeOwnerBlock(k), k);
  for (const k of [null, undefined, "", "FIRM", "micro", 1, {}]) assert.equal(normalizeOwnerBlock(k), null, String(k));
  assert.match(entityOwnerBlockAr(null), /الجهة/);
  assert.match(deletionSuspendedAr("firm"), /^الحذف النهائي موقوف/);
  assert.match(deletionSuspendedAr("firm"), /نقل ملكية المكتب/);
  assert.match(deletionSuspendedAr(null), /^الحذف النهائي موقوف/);
  assert.doesNotMatch(deletionSuspendedAr(null), /الملكية/);
});

test("٣٠٧: the admin's «حذف نهائي الآن» that ends blocked names the reason", () => {
  assert.match(purgeBlockedAr("entity_owner"), /موقوف حتى نقل الملكية/);
  assert.match(purgeBlockedAr("entity_owner"), /لا شاشة لنقل الملكية بعد/);
  assert.match(purgeBlockedAr("firm_assets_left"), /سجلات مكتب/);
  for (const r of ["foreign_key", "database_refused", undefined]) assert.match(purgeBlockedAr(r), /بقي الحساب مجمّداً/);
});

function fakeRpc(answer: () => { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const calls: string[] = [];
  const client = {
    rpc: async (fn: string) => {
      calls.push(fn);
      return answer();
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("٣٠٧: readOwnerBlock asks the caller's own block; missing / failing / odd answers are null", async () => {
  const ok = fakeRpc(() => ({ data: "firm", error: null }));
  assert.equal(await readOwnerBlock(ok.client), "firm");
  assert.deepEqual(ok.calls, ["account_deletion_owner_block"]);
  assert.equal(await readOwnerBlock(fakeRpc(() => ({ data: null, error: null })).client), null);
  assert.equal(await readOwnerBlock(fakeRpc(() => ({ data: "x", error: null })).client), null);
  // before 20261030_12: the function is not there
  assert.equal(await readOwnerBlock(fakeRpc(() => ({ data: null, error: { code: "PGRST202", message: "not found" } })).client), null);
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(await readOwnerBlock(fakeRpc(() => ({ data: null, error: { code: "57014", message: "timeout" } })).client), null);
    const throwing = { rpc: async () => { throw new Error("network"); } } as unknown as SupabaseClient;
    assert.equal(await readOwnerBlock(throwing), null);
  } finally {
    console.error = origError;
  }
});

test("٣٠٧: the status route returns ownerBlock; Settings shows the refusal with no delete button; the frozen page says the deletion is suspended", () => {
  const route = read("src/app/api/v1/me/account-deletion/route.ts");
  assert.ok(route.includes("readOwnerBlock(supabase)"), "read with the caller's own session (auth.uid())");
  assert.match(route, /frozen: shouldBeFrozen, ownerBlock/);

  const panel = read("src/app/settings/components/tabs/AccountDeletionPanel.tsx");
  assert.ok(panel.includes("{entityOwnerBlockAr(ownerBlock)}"), "the panel explains the refusal");
  assert.match(panel, /\{ownerBlock \? \(/, "the refusal replaces the delete button");
  assert.doesNotMatch(panel, /انقل الملكية/);

  const page = read("src/app/account-frozen/page.tsx");
  assert.ok(page.includes("deletionSuspendedAr(state.ownerBlock)"));
  assert.ok(page.includes('state.status === "blocked"'), "a blocked purge is shown as suspended, not dated");

  const admin = read("src/app/api/v1/admin/users/[id]/route.ts");
  assert.ok(admin.includes("purgeBlockedAr(run.reason)"));
  const adminPage = read("src/app/dashboard/admin/users/page.tsx");
  assert.match(adminPage, /موقوف حتى نقل الملكية، ولا شاشة لنقل الملكية بعد/);
});

// ── ٣٠٨ the original author is the database's, no route sends it ──────────
function filesUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

test("٣٠٨: no route or page writes original_author_id (the trigger sets it; a deploy before the SQL never breaks an insert)", () => {
  const hits = filesUnder(join(ROOT, "src")).filter((f) => readFileSync(f, "utf8").includes("original_author_id"));
  assert.deepEqual(hits, []);
});

// ── ٣٠٩ a document kept for the other party stays downloadable ────────────
test("٣٠٩: a document detached at the uploader's deletion (owner null) is still served from his folder", () => {
  const uploader = "44444444-0000-0000-0000-000000000004";
  const path = `${uploader}/3-shared.pdf`;
  // 20261026_72 recorded the folder; the keep rule nulled the owner
  assert.equal(isPathInOwnerFolder(path, fileFolderOwner(uploader, null)), true);
  // with no recorded folder and no owner, nothing is served (a forged row)
  assert.equal(isPathInOwnerFolder(path, fileFolderOwner(null, null)), false);
});

// ── ٣١٣ only the administration lifts its freeze ──────────────────────────
test("٣١٣: the gates' 403 never tells an admin-frozen user to restore the account himself", () => {
  assert.match(ACCOUNT_FROZEN_AR, /بقرار من الإدارة فتواصل مع الدعم/);
  assert.match(ACCOUNT_FROZEN_AR, /إن كان التجميد بطلبك/);
  assert.doesNotMatch(ACCOUNT_FROZEN_AR, /^حسابك مجمّد بطلب حذف\. استعده/);
  assert.equal(ADMIN_FREEZE_AR, "تم تجميد الحساب بقرار من الإدارة — تواصل مع الدعم");
  const page = read("src/app/account-frozen/page.tsx");
  assert.match(page, /state\.status !== "purging" && !state\.byAdmin/, "no restore button on an admin freeze");
});

// ── the SQL the user runs ──────────────────────────────────────────────────
test("20261030_12: one transaction, a SELECT check, and nothing that deletes or rewrites existing rows", () => {
  const sql = read("supabase/migrations/20261030_12_accounts_firms_owner_answers.sql");
  const batch = read("SQL_batch_2026-10-30_accounts_firms/10_ANY_TIME_20261030_12_accounts_firms_owner_answers.sql");
  assert.equal(batch, sql, "the batch copy is the migration, byte for byte");
  const code = sql.replace(/--[^\n]*/g, "");
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /^commit;/m);
  assert.match(code, /lock_timeout/);
  assert.doesNotMatch(code, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  // the only UPDATE fills the new column where it is still empty
  const updates = code.match(/\bupdate\s+public\.%1\$I[\s\S]*?where n\.original_author_id is null/g) ?? [];
  assert.equal(updates.length, 1);
  assert.equal((code.match(/\bupdate\s+public\./gi) ?? []).length, 1);
  // the SELECT check after the commit
  const tail = code.slice(code.lastIndexOf("commit;"));
  assert.match(tail, /select[\s\S]*notes_without_author[\s\S]*specs_312[\s\S]*owner_block_fn[\s\S]*invoice_guard[\s\S]*invoice_fk_set_null/);
});
