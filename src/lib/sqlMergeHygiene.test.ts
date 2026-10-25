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
    "profile_visibility", "soft_delete_case_records", "law_summary_brief", "law_sort_key", "search_scoped_page",
    "founder_campaign", "founder_no_signup_grant", "founder_badges_unpaid_removed", "billing_cycles", "coupons_server_only",
    "tracking_links_v2", "branding_vault", "attachments_path_ownership", "document_shares_path_ownership",
    "account_deletion", "storage_documents_read_guard", "file_folder_owner"]) {
    assert.ok(opened.has(name), `verify:${name} is present`);
  }
});
