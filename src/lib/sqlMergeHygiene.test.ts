/**
 * sqlMergeHygiene.test.ts — the SQL the user pastes into the editor (and
 * _verify.sql, which he runs by hand; deploy.sh does not) carries no merge
 * leftovers.
 *
 * The 2026-10-25 batch merged two tracks that both appended sections to the
 * end of supabase/migrations/_verify.sql. The resolution kept one bare
 * `=======` line, which psql glued onto the next statement: a syntax error
 * that skipped the hearing-reminders check, and under ON_ERROR_STOP (the manual
 * run's `-v ON_ERROR_STOP=1`) stopped _verify.sql before every section after it. No unit or RLS test ran
 * _verify.sql top to bottom, so nothing caught it. This guard does, without a
 * database: no conflict marker in any SQL file, and every
 * `-- >>> verify:<name>` block in _verify.sql is opened once and closed once.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

function sqlFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sqlFilesUnder(p));
    else if (name.endsWith(".sql")) out.push(p);
  }
  return out;
}

function allSqlFiles(): string[] {
  const dirs = [join(ROOT, "supabase")];
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith("SQL_batch_") && statSync(join(ROOT, name)).isDirectory()) dirs.push(join(ROOT, name));
  }
  return dirs.flatMap(sqlFilesUnder);
}

const CONFLICT_MARKER = /^(<{7}|={7}|>{7})(\s|$)/;

test("no SQL file carries a merge conflict marker", () => {
  const files = allSqlFiles();
  assert.ok(files.some((f) => f.endsWith("_verify.sql")), "the scan reaches supabase/migrations/_verify.sql");
  const hits: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (CONFLICT_MARKER.test(line)) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1}: ${line}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("_verify.sql: every verify block is opened once and closed once, in order", () => {
  const lines = readFileSync(join(ROOT, "supabase", "migrations", "_verify.sql"), "utf8").split(/\r?\n/);
  const opened = new Set<string>();
  let open: string | null = null;
  lines.forEach((line, i) => {
    const start = /^-- >>> verify:([\w-]+)/.exec(line);
    const end = /^-- <<< verify:([\w-]+)/.exec(line);
    if (start) {
      assert.equal(open, null, `line ${i + 1}: verify:${start[1]} opens inside verify:${open}`);
      assert.equal(opened.has(start[1]), false, `line ${i + 1}: verify:${start[1]} opened twice`);
      opened.add(start[1]);
      open = start[1];
    } else if (end) {
      assert.equal(end[1], open, `line ${i + 1}: verify:${end[1]} closes but verify:${open} is open`);
      open = null;
    }
  });
  assert.equal(open, null, `verify:${open} is never closed`);
  for (const name of ["grant_plan_atomic", "hearing_reminders", "dashboard_notes", "legal_ledger", "case_tracking_links",
    "profile_visibility", "soft_delete_case_records", "law_summary_brief", "law_sort_key", "search_scoped_page", "search_relevance",
    "founder_campaign", "founder_no_signup_grant", "founder_badges_unpaid_removed", "billing_cycles", "coupons_server_only",
    "tracking_links_v2", "branding_vault", "attachments_path_ownership", "document_shares_path_ownership",
    "account_deletion", "storage_documents_read_guard", "file_folder_owner",
    // The owner-priority wave: one block per 20261103_* migration.
    "library_auto_lock_hours", "library_invitation_grant_days", "library_eligibility_verifications",
    "library_fts_tashkeel_fold", "library_invitations_closed", "s6_contract_review_business",
    "s6_newclient_flag", "s6_coupon_business_role", "progress_events", "letterhead_verify_card",
    // Task F (owner answers 2026-11-07): 20261107_50.
    "owner_answers_prices",
    // Owner answers 2026-11-07: 20261107_10 / _20 / _30.
    "library_merged_regulation_names", "library_caps_owner_426", "deadline_cassation_urgent_194",
    // 20261107_60 (owner ٤١٠).
    "founder_rejoinder_410", "library_tier_columns_1108", "firm_member_points_1108", "library_device_limit_1108", "drafter_section_edits_1108", "free_daily_question_1108",
    // Final review of the 2026-11-08 batch: 20261108_41.
    "drafter_daily_limit_1108",
    // Batch 2026-11-09 (owner package 6-Nov): 20261109_10..14 and _20..22.
    "library_invitation_redemptions", "share_passcode_lockout", "group_membership_self_check", "admin_audit_events_no_guest",
    "academy_certificates_policy", "academy_answer_keys", "library_merged_regulations", "library_principles_printed_page",
    "library_feqh_book_type_data01",
    // Legal GraphRAG (20261110_10), its explorer (20261113_10) and review fixes (20261114_10):
    "library_graph_rag", "library_graph_explorer", "library_graph_rag_fixes"]) {
    assert.ok(opened.has(name), `verify:${name} is present`);
  }
});

test("20261103_22: the last SELECT is the check, since the SQL editor shows only the last result", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261103_22_coupon_business_role.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const selects = sql.slice(sql.lastIndexOf("commit;")).split(/^(?=select )/m).filter((s) => s.startsWith("select "));
  assert.equal(selects.length, 2);
  assert.match(selects[1], /as ok\b/);
  assert.doesNotMatch(selects[0], /as ok\b/);
});
