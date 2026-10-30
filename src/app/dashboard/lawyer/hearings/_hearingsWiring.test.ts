/**
 * CODE-F17 / LIVE-F28 / CODE-F18 / LIVE-F29 — source shape of the diary,
 * the add modal and the hearings routes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const diary = read("src/app/dashboard/lawyer/hearings/page.tsx");
const dialog = read("src/app/dashboard/lawyer/hearings/_HearingActionDialog.tsx");
const modal = read("src/app/dashboard/lawyer/_components/AddHearingModal.tsx");
const post = read("src/app/api/v1/lawyer/hearings/route.ts");
const patch = read("src/app/api/v1/lawyer/hearings/[id]/route.ts");

test("CODE-F17 / LIVE-F28: the general add links by a picked case id; typed text is a label only", () => {
  assert.match(modal, /loadLinkableCases\(/);
  assert.match(modal, /— موعد غير مرتبط بقضية —/);
  assert.match(modal, /caseName: linkId \? undefined : caseName/);
  assert.match(post, /resolveOwnCase\(/);
  assert.match(post, /case_request_id: linkedCaseId/);
});

test("CODE-F17: an unlinked hearing is labelled as such in the diary", () => {
  assert.match(diary, /غير مرتبط بقضية/);
});

test("LIVE-F29 / CODE-F34: the add modal uses ModalShell with busy and dirty", () => {
  assert.match(modal, /<ModalShell[\s\S]*busy=\{saving\}[\s\S]*dirty=\{dirty\}/);
});

test("CODE-F18: cancelled / held rows are closed; actions go through PATCH with a reason; calendar links only for upcoming", () => {
  assert.match(diary, /isClosedHearingStatus\(row\.status\)/);
  assert.match(diary, /allowedHearingActions\(/);
  assert.match(diary, /state==="upcoming"/);
  assert.match(dialog, /updateLawyerHearing\(/);
  assert.match(dialog, /nzamy-workflow-updated/);
  assert.match(dialog, /createPortal\(/);
  assert.match(patch, /assertCourtPractice\(supabase, user\.id\)/);
  assert.match(patch, /\.eq\("updated_at", current\.updated_at\)/);
  assert.match(patch, /HEARING_STATUS_CHANGED/);
});
