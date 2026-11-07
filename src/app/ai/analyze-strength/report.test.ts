import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asStrengthReport, strengthReportText, LEVEL_LABEL, STRENGTH_DISCLAIMER } from "./_report.ts";

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
  assert.match(t, /^تقدير الموقف: يحتاج تدعيماً/);
  assert.match(t, /عدم الاختصاص \(مرتفع\) — دفع مقابل/);
  assert.doesNotMatch(t, /[0-9٠-٩]|٪|%/);
  assert.doesNotMatch(t, /التوصيات|محامي الشيطان/, "an empty list is left out");
});

test("٤١٤: the owner's level words and his disclaimer, last in the exported text and under the level on screen", () => {
  assert.deepEqual(LEVEL_LABEL, { strong: "موقف قوي", medium: "موقف متوسط", weak: "يحتاج تدعيماً" });
  assert.equal(
    STRENGTH_DISCLAIMER,
    "تقدير آلي استرشادي مبني على المعطيات المدخلة للمساعدة والتحليل فقط، ولا يُعد ضماناً لنتيجة قضائية أو رأياً نهائياً؛ إذ يخضع الفصل النهائي لسلطة المحكمة التقديرية.",
  );
  const t = strengthReportText(asStrengthReport(output)!);
  assert.ok(t.endsWith(`\n\n${STRENGTH_DISCLAIMER}`), "the disclaimer closes the export");
  assert.doesNotMatch(t, /أسانيد (قوية|متوسطة|ضعيفة)/);
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const level = page.indexOf("{LEVEL_LABEL[g.level]}");
  const note = page.indexOf("{STRENGTH_DISCLAIMER}");
  assert.ok(level > 0 && note > level && note - level < 300, "the disclaimer sits right under the level");
  assert.match(page, /<ConsultantGate>/, "R1: part of the simulator, so Art. 18 applies");
  assert.doesNotMatch(page, /٪|%\}/);
});
