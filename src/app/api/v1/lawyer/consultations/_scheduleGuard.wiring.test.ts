/**
 * _scheduleGuard.wiring.test.ts — the server half of LIVE-F34 / LIVE-F35 /
 * LIVE-F37 / CODE-F31 is wired into every route that writes a consultation
 * slot, and the screens send Riyadh time, not the browser's.
 *
 * The rules themselves are tested in src/lib/services/consultationSchedule.test.ts;
 * these routes import Next and the `@/` alias, which node:test cannot load,
 * so this file reads their source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("POST /api/v1/service-requests runs the slot guard for consultations only, before the insert", () => {
  const src = read("../../service-requests/route.ts");
  const guard = src.indexOf("consultationBookingRefusal(supabase");
  const insert = src.search(/\.from\("service_requests"\)\s*\.insert\(/);
  assert.ok(guard > 0, "guard not called");
  assert.ok(insert > guard, "guard must run before the insert");
  assert.match(src, /if \(shape\.value\.type === "consultation"\) \{\s*const slotRefusal/);
  assert.match(src, /confirmOverlap: requestData\.confirmOverlap === true/);
});

test("the booking guard refuses a partial or past slot and checks overlap only for a self-assigned booking", () => {
  const src = read("./_scheduleGuard.ts");
  assert.match(src, /checkDayTimeSlot\(meta\.day, meta\.time, args\.nowMs\)/);
  assert.match(src, /checkInstantSlot\(meta\.scheduledAt, args\.nowMs, true\)/);
  assert.match(src, /if \(slot\.kind !== "slot" \|\| !args\.assignedToSelf\) return null;/);
  assert.match(src, /\.eq\("status", "scheduled"\)/);
  assert.match(src, /status: 409/);
  assert.match(src, /status: 503/);
});

test("PATCH /api/v1/lawyer/consultations/[id] requires a zoned instant, refuses a new past slot and checks overlap", () => {
  const src = read("./[id]/route.ts");
  assert.match(src, /checkInstantSlot\(body\.scheduledAt, nowMs, false\)/);
  assert.match(src, /\(slotChanged \|\| becomesScheduled\) && effectiveMs <= nowMs/);
  assert.match(src, /overlapRefusal\(supabase, \{/);
  assert.match(src, /excludeId: row\.id/);
  assert.doesNotMatch(src, /patch\.scheduled_at = body\.scheduledAt;/);
});

test("the legacy PATCH /api/v1/consultations/[id] applies the same zone + future rule", () => {
  const src = read("../../consultations/[id]/route.ts");
  assert.match(src, /checkInstantSlot\(v, Date\.now\(\), true\)/);
});

test("the schedule modal converts Riyadh wall clock, not the browser's zone", () => {
  const src = read("../../../../dashboard/lawyer/_components/consultations/ConsultationActionModal.tsx");
  assert.match(src, /riyadhSlotIso\(scheduledDate, scheduledTime\)/);
  assert.match(src, /riyadhWallClock\(consultation\.scheduledAt\)/);
  assert.doesNotMatch(src, /fromDatetimeLocalValue|toDatetimeLocalValue/);
  assert.doesNotMatch(src, /toLocaleTimeString/);
});

test("the lawyer consultations page shows Riyadh time and names the zone; the button says what will happen", () => {
  const src = read("../../../../dashboard/lawyer/consultations/page.tsx");
  assert.doesNotMatch(src, /toLocaleTimeString/);
  assert.match(src, /RIYADH_ZONE_LABEL_AR/);
  assert.match(src, /hasSlot \? "تأكيد الجدولة" : "حفظ كطلب غير مجدول"/);
  assert.match(src, /checkDayTimeSlot\(date, time, Date\.now\(\)\)/);
});

test("the other consultation screens format in Riyadh time", () => {
  for (const rel of [
    "../../../../dashboard/lawyer/_components/consultations/ConsultationDetail.tsx",
    "../../../../dashboard/firm/consultations/page.tsx",
    "../../../../dashboard/client/consultation/[id]/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /riyadhWallClock|formatRiyadhTimeAr/, rel);
    assert.match(src, /RIYADH_ZONE_LABEL_AR/, rel);
  }
});

test("q357: the guard reads the lawyer's scheduled timed hearings too, and keeps the consultation 409 code", () => {
  const src = read("./_scheduleGuard.ts");
  assert.match(src, /\.from\("hearings"\)[\s\S]*?\.eq\("owner_user_id", args\.lawyerUserId\)[\s\S]*?\.eq\("status", "scheduled"\)[\s\S]*?\.neq\("kind", DEADLINE_HEARING_KIND\)/);
  assert.match(src, /findScheduleClashes\(args\.startMs, args\.durationMinutes, items, exclude\)/);
  assert.match(src, /code: CONSULTATION_OVERLAP_CODE, conflicts: read\.conflicts/);
  assert.match(src, /export async function hearingOverlapRefusal\(/);
  assert.match(src, /code: HEARING_OVERLAP_CODE, conflicts: read\.conflicts/);
});

test("q357: POST and PATCH /api/v1/lawyer/hearings check the slot before writing, warn-then-confirm", () => {
  const post = read("../hearings/route.ts");
  const guard = post.indexOf("hearingOverlapRefusal(supabase");
  const insert = post.search(/\.from\("hearings"\)\s*\.insert\(/);
  assert.ok(guard > 0 && insert > guard, "POST: guard before the insert");
  assert.match(post, /confirmOverlap: confirmOverlap === true/);
  assert.match(post, /typeToKind\(type as UiHearingType\) === DEADLINE_HEARING_KIND \? null/);
  const patch = read("../hearings/[id]/route.ts");
  const pGuard = patch.indexOf("hearingOverlapRefusal(supabase");
  const update = patch.search(/\.from\("hearings"\)\s*\.update\(/);
  assert.ok(pGuard > 0 && update > pGuard, "PATCH: guard before the update");
  assert.match(patch, /excludeHearingId: current\.id/);
  assert.match(patch, /nextStatus === "scheduled" && slotChanged && nextKind !== DEADLINE_HEARING_KIND/);
});

test("q357: the hearing screens tell the overlap 409 apart by code and offer «حفظ رغم التعارض»", () => {
  const svc = read("../../../../../lib/services/lawyerHearingsService.ts");
  assert.match(svc, /response\.status === 409 && errorBody\?\.code === "hearing_overlap"/);
  for (const rel of [
    "../../../../dashboard/lawyer/_components/AddHearingModal.tsx",
    "../../../../dashboard/lawyer/hearings/_HearingActionDialog.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /instanceof HearingOverlapError/, rel);
    assert.match(src, /حفظ رغم التعارض/, rel);
    assert.match(src, /confirmOverlap/, rel);
  }
});
