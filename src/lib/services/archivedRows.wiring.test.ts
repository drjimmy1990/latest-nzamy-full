/**
 * Source pins for N3.9 (owner directive ٥): nothing on a case file is
 * hard-deleted from the app; archived rows leave the normal lists.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(join(src, f), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("no code path deletes a case_notes row", () => {
  const offenders = walk(src).filter((f) => /from\("case_notes"\)[\s\S]{0,200}?\.delete\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("DELETE on a note archives it through the RPC, and never falls back to a delete", () => {
  const route = read("app/api/v1/cases/[id]/notes/[noteId]/route.ts");
  const del = route.slice(route.indexOf("export async function DELETE"));
  assert.match(del, /rpc\("archive_case_note", \{ p_note: noteId \}\)/);
  assert.match(del, /ARCHIVE_UNAVAILABLE_AR \}, \{ status: 503 \}/);
  assert.doesNotMatch(del, /\.delete\(/);
});

test("the normal note readers drop archived rows (with the pre-migration fallback)", () => {
  for (const f of [
    "app/api/v1/cases/[id]/notes/route.ts",
    "app/api/v1/cases/[id]/timeline/route.ts",
    "app/api/v1/cases/shared-notes/route.ts",
  ]) {
    const s = read(f);
    assert.match(s, /liveRowsOnly\(/, `${f} uses liveRowsOnly`);
    assert.match(s, /\.is\("deleted_at", null\)/, `${f} filters deleted_at`);
  }
});

test("case documents are never purged: the route refuses, the cron skips them, the bin hides the button", () => {
  const doc = read("app/api/v1/documents/[id]/route.ts");
  const permanent = doc.slice(doc.indexOf("if (permanent)"), doc.indexOf("// ── soft delete"));
  assert.ok(permanent.indexOf("if (doc.request_id)") > -1);
  assert.ok(permanent.indexOf("if (doc.request_id)") < permanent.indexOf("createServiceClient()"), "refused before any service-role call");
  const cron = read("app/api/v1/cron/deadlines/route.ts");
  const purge = cron.slice(cron.indexOf("// ── (c) PURGE"));
  assert.match(purge, /\.is\("request_id", null\)/);
  const bin = read("components/documents/DocumentsTrashPanel.tsx");
  assert.match(bin, /d\.request_id \? \(/);
});

test("both case files say «أرشفة», confirm first, and mount «المحذوفات»", () => {
  for (const f of ["app/dashboard/lawyer/cases/[id]/page.tsx", "app/dashboard/firm/cases/[id]/page.tsx"]) {
    const s = read(f);
    assert.match(s, /<Archive size=\{11\} \/> أرشفة/, `${f} labels the action as archive`);
    assert.match(s, /window\.confirm\("أرشفة هذه الملاحظة؟/, `${f} confirms`);
    assert.match(s, /<CaseArchivePanel/, `${f} mounts the archive panel`);
    assert.doesNotMatch(s, /<Trash size=\{11\} \/> حذف/, `${f} no longer offers «حذف»`);
  }
});
