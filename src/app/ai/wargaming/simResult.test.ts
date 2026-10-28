import test from "node:test";
import assert from "node:assert/strict";
import { asSimResult, groupPoints, simResultText } from "./_simResult.ts";

const output = {
  summary: "الخصم سيركز على الإنذار",
  points: [
    { source: "court", severity: "low", title: "الإثبات", detail: "ستطلب المحكمة العقد", counter: "أحضره" },
    { source: "opponent", severity: "medium", title: "الإنذار", detail: "سيقول إنه أنذر", counter: "" },
    { source: "opponent", severity: "high", title: "التقادم", detail: "سيدفع بالتقادم", counter: "العلم تأخر" },
  ],
  plea_script: "",
  citation_check: [],
};

test("the points group by target in the wizard's order, the most serious first", () => {
  const g = groupPoints(asSimResult(output)!.points);
  assert.deepEqual(g.map((x) => [x.source, x.points.map((p) => p.title)]), [["opponent", ["التقادم", "الإنذار"]], ["court", ["الإثبات"]]]);
  assert.equal(asSimResult({ summary: "x" }), null);
});

test("the copied text has the targets in words and no probability", () => {
  const t = simResultText(asSimResult(output)!);
  assert.match(t, /محاكاة الخصم:\n• \[خطر عالٍ\] التقادم — سيدفع بالتقادم\n {2}ما تفعله: العلم تأخر/);
  assert.match(t, /ما ستفحصه المحكمة:/);
  assert.doesNotMatch(t, /سكريبت المرافعة|٪|%/);
});
