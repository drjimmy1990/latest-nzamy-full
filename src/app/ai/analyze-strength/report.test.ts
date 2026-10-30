import test from "node:test";
import assert from "node:assert/strict";
import { asStrengthReport, strengthReportText } from "./_report.ts";

const output = {
  grounds: { level: "weak", summary: "لا عقد مكتوب", strengths: ["شاهد"], weaknesses: ["لا عقد"], recommendations: [] },
  opponent: [{ kind: "attack", move: "الدفع بالتقادم", counter: "العلم تأخر" }],
  risks: [{ risk: "عدم الاختصاص", level: "high", mitigation: "دفع مقابل" }],
  devil: [],
  citation_check: [{ cited: "المادة ٨٠", status: "ok" }],
};

test("the stored result reads back as the four tabs and the library's verdicts", () => {
  const r = asStrengthReport(output)!;
  assert.equal(r.grounds.level, "weak");
  assert.equal(r.opponent.length, 1);
  assert.equal(r.citation_check.length, 1);
  assert.equal(asStrengthReport({ grounds: { level: "strong" } }), null);
  assert.equal(asStrengthReport(null), null);
  assert.equal(asStrengthReport({ grounds: { summary: "x", level: 90 } })!.grounds.level, "medium");
});

test("the copied text names the level in words and carries no number or percentage", () => {
  const t = strengthReportText(asStrengthReport(output)!);
  assert.match(t, /^قوة الأسانيد: أسانيد ضعيفة/);
  assert.match(t, /عدم الاختصاص \(مرتفع\) — دفع مقابل/);
  assert.doesNotMatch(t, /[0-9٠-٩]|٪|%/);
  assert.doesNotMatch(t, /التوصيات|محامي الشيطان/, "an empty list is left out");
});
