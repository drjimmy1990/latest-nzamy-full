import assert from "node:assert/strict";
import test from "node:test";
import { diffSourceText, diffTexts, diffWords, tokenizeWords, type DiffRun } from "./wordDiff.ts";

const side = (runs: DiffRun[], keep: "del" | "add") =>
  runs.filter((r) => r.op === "equal" || r.op === keep).map((r) => r.text).join("").replace(/\s+/g, " ").trim();

test("identical texts are one equal run", () => {
  const d = diffWords("للعامل الحق في إجازة", "للعامل الحق في إجازة");
  assert.deepEqual(d, { runs: [{ op: "equal", text: "للعامل الحق في إجازة" }], removed: 0, added: 0 });
});

test("a replaced word is a deletion then an addition, the rest equal", () => {
  const d = diffWords("مدة الإجازة خمسة عشر يوما", "مدة الإجازة واحد وعشرون يوما")!;
  assert.deepEqual(d.runs, [
    { op: "equal", text: "مدة الإجازة " },
    { op: "del", text: "خمسة عشر" },
    { op: "equal", text: " " },
    { op: "add", text: "واحد وعشرون" },
    { op: "equal", text: " يوما" },
  ]);
  assert.equal(d.removed, 2);
  assert.equal(d.added, 2);
});

test("the runs rebuild both texts", () => {
  const oldT = "يجب على صاحب العمل أن يدفع الأجر في موعده\nولا يجوز تأخيره";
  const newT = "يجب على صاحب العمل دفع الأجر كاملا في موعده المحدد\nولا يجوز تأخيره أو خصمه";
  const d = diffWords(oldT, newT)!;
  assert.equal(side(d.runs, "del"), oldT.replace(/\s+/g, " "));
  assert.equal(side(d.runs, "add"), newT.replace(/\s+/g, " "));
});

test("pure insertion and pure deletion", () => {
  assert.deepEqual(diffWords("", "نص جديد")!.runs, [{ op: "add", text: "نص جديد" }]);
  assert.deepEqual(diffWords("نص قديم", "")!.runs, [{ op: "del", text: "نص قديم" }]);
  const d = diffWords("أ ب د", "أ ب ج د")!;
  assert.deepEqual(d.runs, [{ op: "equal", text: "أ ب " }, { op: "add", text: "ج" }, { op: "equal", text: " د" }]);
});

test("harakat and tatweel alone are not a change", () => {
  const d = diffWords("الحقّ ثابت", "الحق ثـابت")!;
  assert.equal(d.removed, 0);
  assert.equal(d.added, 0);
});

test("re-wrapped spaces are not a change, line breaks are tokens", () => {
  assert.equal(diffWords("أ   ب", "أ ب")!.added, 0);
  assert.deepEqual(tokenizeWords("أ ب\nج"), ["أ", "ب", "\n", "ج"]);
  const d = diffWords("أ\nب", "أ\nب\nج")!;
  assert.deepEqual(d.runs, [{ op: "equal", text: "أ\nب" }, { op: "add", text: "\nج" }]);
});

test("too long to diff → null (the reader shows the texts plainly)", () => {
  const big = (w: string) => Array.from({ length: 2000 }, (_, i) => `${w}${i}`).join(" ");
  assert.equal(diffWords(big("x"), big("y")), null);
  // The common head and tail do not count toward the guard.
  const same = big("x");
  assert.notEqual(diffWords(`${same} قديم`, `${same} جديد`), null);
  assert.equal(diffWords("أ ب", "ج د", 3), null);
});

test("diffSourceText drops the embedded history block and markdown marks", () => {
  const stored = "**المادة الخامسة:** للعامل الحق\n<details>\n<summary>النص قبل التعديل</summary>\n> النص القديم\n</details>\nفي `إجازة`";
  assert.equal(diffSourceText(stored), "المادة الخامسة: للعامل الحق\nفي إجازة");
  assert.equal(diffSourceText(null), "");
  // The status label and heading / quote prefixes are not words of the law.
  assert.equal(diffSourceText("## المادة (5): `[معدّلة]`\n> للعامل الحق (معدلة)"), "المادة (5):\nللعامل الحق");
  assert.equal(diffWords(diffSourceText("للعامل الحق"), diffSourceText("للعامل الحق [مُعدَّلة]"))!.added, 0);
  assert.equal(diffSourceText("أ\r\n\r\n\r\nب"), "أ\nب");
});

// ── B-09 (owner package 25-Nov §2.4): the coloured diff never disappears ─────
test("diffTexts: the word diff when it fits", () => {
  assert.deepEqual(diffTexts("أ ب ج", "أ د ج"), diffWords("أ ب ج", "أ د ج"));
});

test("diffTexts: too long for the word diff → lines, each changed block word by word; never null", () => {
  const lines = (w: string, n: number) => Array.from({ length: n }, (_, i) => `${w}${i} سطر`).join("\n");
  // A cap so small the word diff refuses; the changed lines are then compared line by line.
  const rewritten = `${lines("x", 40)}\nالقديمة\n${lines("y", 40)}`;
  const target = `${lines("x", 40)}\nالجديدة\n${lines("w", 40)}`;
  assert.equal(diffWords(rewritten, target, 20), null);
  const coarse = diffTexts(rewritten, target, 20);
  assert.equal(side(coarse.runs, "del"), side([{ op: "equal", text: rewritten }], "del"), "old side rebuilds the old text");
  assert.equal(side(coarse.runs, "add"), side([{ op: "equal", text: target }], "add"), "new side rebuilds the new text");
  assert.ok(coarse.removed > 0 && coarse.added > 0);
  assert.ok(coarse.runs.some((r) => r.op === "equal" && r.text.includes("x0 سطر")), "the common head stays equal");
});

test("diffTexts: a full rewrite past every cap is all red then all green", () => {
  const d = diffTexts("أ ب\nج", "د هـ\nو", 1);
  assert.equal(side(d.runs, "del"), "أ ب ج");
  assert.equal(side(d.runs, "add"), "د هـ و");
  assert.equal(d.removed, 3);
  assert.equal(d.added, 3);
  assert.ok(!d.runs.some((r) => r.op === "equal" && r.text.trim() !== ""), "no word is kept as equal");
});

test("diffTexts: equal lines stay equal in the line fallback (harakat ignored)", () => {
  const d = diffTexts("مَادة ثابتة\nقديم قديم", "مادة ثابتة\nجديد جديد", 2);
  assert.equal(d.runs[0].op, "equal");
  assert.match(d.runs[0].text, /مادة ثابتة/);
  assert.equal(d.removed, 2);
  assert.equal(d.added, 2);
});
