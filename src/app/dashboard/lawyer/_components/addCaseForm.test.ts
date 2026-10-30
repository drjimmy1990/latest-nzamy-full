import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseSavedStatusLine, cardNamed, isAddCaseDirty, type AddCaseDraft } from "./addCaseForm.ts";
import { COURT_CHOICES, COURT_OTHER, resolveCourt } from "./courtTypes.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("CODE-F19: the success line names the status the server saved, never «النشطة» for a waiting row", () => {
  const waiting = caseSavedStatusLine("pending_assignment");
  assert.match(waiting, /بانتظار الإسناد/);
  assert.match(waiting, /«انتظار»/);
  assert.doesNotMatch(waiting, /النشطة/);
  assert.match(caseSavedStatusLine("assigned"), /«نشطة»/);
  // nothing back from the server → no claim about the status at all
  for (const s of [null, undefined, "", "weird"]) {
    assert.match(caseSavedStatusLine(s), /لم يُعِد الخادم حالتها/);
  }
});

test("CODE-F30: no court is a valid «not yet» — saved as no court, not a default", () => {
  assert.deepEqual(resolveCourt("", ""), { ok: true, court: null });
  assert.deepEqual(resolveCourt("المحكمة العمالية", ""), { ok: true, court: "المحكمة العمالية" });
});

test("CODE-F30: «أخرى» needs a typed name, and saves that name", () => {
  assert.equal(resolveCourt(COURT_OTHER, "  ").ok, false);
  assert.deepEqual(resolveCourt(COURT_OTHER, "  لجنة الفصل في المنازعات المصرفية "), { ok: true, court: "لجنة الفصل في المنازعات المصرفية" });
  assert.equal(resolveCourt("محكمة لا وجود لها", "").ok, false);
});

test("CODE-F30: the court list is the cases board's own COURTS_LIST, string for string", () => {
  const board = read("../../../../constants/lawyerCasesData.ts");
  const block = board.slice(board.indexOf("export const COURTS_LIST"));
  const ids = [...block.slice(0, block.indexOf("];")).matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10, "COURTS_LIST was found");
  assert.deepEqual([...COURT_CHOICES], ids);
  assert.ok(COURT_CHOICES.length > 3);
});

const blank: AddCaseDraft = {
  selectedClientId: "", clientName: "", title: "", courtChoice: "", courtOther: "", priority: "normal", description: "",
};

test("CODE-F34: an untouched form closes freely; anything typed or picked asks first", () => {
  assert.equal(isAddCaseDirty(blank), false);
  assert.equal(isAddCaseDirty({ ...blank, clientName: "   " }), false);
  for (const patch of [
    { title: "مطالبة" }, { clientName: "محمد" }, { selectedClientId: "c1" }, { courtChoice: "المحكمة العامة" },
    { description: "ملخص" }, { priority: "high" },
  ] as Partial<AddCaseDraft>[]) {
    assert.equal(isAddCaseDirty({ ...blank, ...patch }), true, JSON.stringify(patch));
  }
});

test("CODE-F30: a typed name that matches a card is offered back, spacing aside", () => {
  const cards = [{ id: "a", name: "شركة الأفق" }, { id: "b", name: "محمد  العتيبي" }];
  assert.equal(cardNamed(cards, " شركة الأفق ")?.id, "a");
  assert.equal(cardNamed(cards, "محمد العتيبي")?.id, "b");
  assert.equal(cardNamed(cards, "شركة"), null);
  assert.equal(cardNamed(cards, ""), null);
});

test("AddCaseModal wiring: shell with busy/dirty, no team choice, no court default, server status, linked name locked", () => {
  const src = read("./AddCaseModal.tsx");
  assert.match(src, /<ModalShell[^>]*busy=\{saving\}[^>]*dirty=\{dirty\}/);
  assert.match(src, /const dirty = !done && isAddCaseDirty\(/);
  // CODE-F19
  assert.doesNotMatch(src, /فريق العمل<\/option>/);
  assert.doesNotMatch(src, /metadata: \{[^}]*assignee/);
  assert.doesNotMatch(src, /قائمة قضاياك النشطة/);
  assert.match(src, /caseSavedStatusLine\(savedStatus\)/);
  assert.match(src, /setSavedStatus\(saved\?\.status \?\? null\)/);
  // CODE-F30
  assert.doesNotMatch(src, /useState\("المحكمة التجارية"\)/);
  assert.match(src, /useState\(""\);\n\s*const \[courtOther/);
  assert.match(src, /COURT_OTHER/);
  assert.match(src, /readOnly=\{Boolean\(selectedClientId\)\}/);
  assert.doesNotMatch(src, /if \(selectedClientId\) setSelectedClientId\(""\)/);
  assert.match(src, /clientsUnreadable \?[\s\S]*?loadClients\(\)[\s\S]*?إعادة المحاولة/);
});
