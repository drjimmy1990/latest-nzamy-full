/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/dashboard/lawyer/cases/_caseSummaryBlocks.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { caseSummaryBlocks } from "./_caseSummaryBlocks.ts";

const base = {
  title: "دعوى عمالية",
  typeLabel: "قضية",
  referenceNo: "REQ-1",
  clientName: "شركة الأفق",
  court: "—",
  assignee: null,
  filedDate: "١ نوفمبر ٢٠٢٦",
  stage: "قيد التداول",
  description: "سطر أول\n\nسطر ثانٍ",
  hearings: ["١ ديسمبر ٢٠٢٦ — جلسة مرافعة — المحكمة العمالية"],
  deadlines: [],
};

test("header facts skip empty and «—» values; the description is one paragraph per line", () => {
  const b = caseSummaryBlocks(base);
  assert.deepEqual(b[0], { kind: "title", text: "ملخّص القضية — دعوى عمالية" });
  const facts = b[1];
  assert.equal(facts.kind, "list");
  if (facts.kind !== "list") return;
  assert.ok(!facts.items.some((i) => i.startsWith("المحكمة")));
  assert.ok(!facts.items.some((i) => i.startsWith("المحامي")));
  assert.equal(b.filter((x) => x.kind === "para" && x.text.startsWith("سطر")).length, 2);
});

test("a failed read says so; an empty one says none", () => {
  const b = caseSummaryBlocks({ ...base, hearings: null });
  assert.ok(b.some((x) => x.kind === "para" && x.text.includes("تعذّرت قراءة")));
  assert.ok(b.some((x) => x.kind === "para" && x.text === "لا مهل مفتوحة."));
});

test("the case page and the hearings page mount the letterhead bar (P1-37)", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  assert.match(read("src/app/dashboard/lawyer/cases/[id]/page.tsx"), /<LetterheadExportBar[\s\S]{0,200}blocks=\{caseSummaryBlocks\(/);
  const hearings = read("src/app/dashboard/lawyer/hearings/page.tsx");
  assert.ok(hearings.includes("<HearingsExportBar"));
  // The single-event file and the Google link no longer carry notes or the client.
  assert.ok(!hearings.includes("`الموكل: ${ev.client}`"));
  assert.ok(!hearings.includes("منصة نظامي القانونية"));
  const bar = read("src/app/dashboard/lawyer/hearings/_HearingsExportBar.tsx");
  assert.ok(bar.includes("<LetterheadExportBar"));
  // A capped read is said in the file's note, never hidden.
  assert.ok(hearings.includes("hearingsTruncated={truncated}") && bar.includes("deadlines.truncated"));
  // A single deadline as a calendar file, under the same privacy rule.
  assert.ok(read("src/app/dashboard/lawyer/_components/DeadlineCard.tsx").includes("buildHearingIcs(deadlineIcsInput("));
});
