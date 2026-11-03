/**
 * CODE-F36 — a client note is archived, never hard-deleted (source shape:
 * the routes need a session, the migration needs a database).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const root = join(here, "../../../../../../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const itemRoute = read("src/app/api/v1/lawyer/clients/[id]/notes/[noteId]/route.ts");
const listRoute = read("src/app/api/v1/lawyer/clients/[id]/notes/route.ts");
const shared = read("src/app/api/v1/lawyer/clients/[id]/notes/_shared.ts");
const service = read("src/lib/services/lawyerClientNotesService.ts");
const page = read("src/app/dashboard/lawyer/clients/[id]/page.tsx");
const sql = read("supabase/migrations/20261030_30_client_notes_archive.sql");

test("DELETE archives (sets deleted_at) and never issues a hard delete", () => {
  assert.doesNotMatch(itemRoute, /\.delete\(/);
  assert.match(itemRoute, /deleted_at:\s*archive \?/);
  assert.match(itemRoute, /export async function DELETE/);
  assert.match(itemRoute, /export async function PATCH/);
  assert.match(itemRoute, /\.eq\("author_user_id", user\.id\)/);
});

test("before the migration: archive answers 503 naming 20261030_30, and the list falls back to every row", () => {
  assert.match(shared, /20261030_30/);
  assert.match(itemRoute, /CLIENT_NOTES_ARCHIVE_UNAVAILABLE_AR[\s\S]*status: 503/);
  assert.match(listRoute, /liveRowsOnly\(/);
  assert.match(listRoute, /archived"\) === "1"/);
});

test("the service and the page offer archive + undo, not delete", () => {
  assert.doesNotMatch(service, /export async function deleteClientNote/);
  assert.match(service, /export async function archiveClientNote/);
  assert.match(service, /export async function restoreClientNote/);
  assert.match(page, /archiveClientNote\(/);
  assert.match(page, /تراجع/);
  assert.doesNotMatch(page, /deleteClientNote/);
});

test("migration: columns, stamp trigger, no DELETE policy or privilege, trailing SELECT check", () => {
  assert.match(sql, /add column if not exists deleted_at timestamptz/);
  assert.match(sql, /drop policy if exists "client notes deletable by author"/);
  assert.match(sql, /revoke delete, truncate on public\.lawyer_client_notes from authenticated/);
  assert.match(sql, /RETENTION POLICY/);
  const tail = sql.slice(sql.lastIndexOf("commit;"));
  assert.match(tail, /\r?\nselect\r?\n/);
});
