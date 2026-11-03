import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/**
 * CODE-F34 / CODE-F35 wiring: each of these forms is framed by the shared
 * ModalShell (dialog role, named close, Escape, Tab trap, focus return) and
 * hands it the exit rule's inputs, instead of carrying its own backdrop with
 * an unconditional `onClose` that fired mid-save.
 */
const SAVING_FORMS = [
  "./AddCaseModal.tsx",
  "./AddCaseStageModal.tsx",
  "./contracts/ContractFormModal.tsx",
  "./QuickToolsCustomizer.tsx",
];

for (const file of SAVING_FORMS) {
  test(`CODE-F34: ${file} is in ModalShell with busy={saving} and a dirty flag`, () => {
    const src = read(file);
    assert.match(src, /import ModalShell from "@\/components\/ui\/ModalShell";/);
    assert.match(src, /<ModalShell[\s\S]*?busy=\{saving\}[\s\S]*?dirty=\{dirty\}/);
    assert.match(src, /const dirty = /);
    // its own backdrop — the one that closed on any click — is gone
    assert.doesNotMatch(src, /e\.target === e\.currentTarget\) onClose\(\)/);
    assert.doesNotMatch(src, /fixed inset-0 z-\[60\]/);
  });
}

test("CODE-F34: a form whose success screen stays open is not 'dirty' on that screen", () => {
  assert.match(read("./AddCaseModal.tsx"), /const dirty = !done && /);
  assert.match(read("./AddCaseStageModal.tsx"), /const dirty = !done && /);
});

test("CODE-F34: ContractFormModal compares against what it opened with; QuickTools compares order", () => {
  const contract = read("./contracts/ContractFormModal.tsx");
  assert.match(contract, /const \[baseline\] = useState\(snapshot\);\n\s*const dirty = snapshot !== baseline;/);
  const tools = read("./QuickToolsCustomizer.tsx");
  assert.match(tools, /selected\.some\(\(id, i\) => id !== currentIds\[i\]\)/);
});

test("CODE-F35: ShareProfileModal uses the shell and no longer listens for Escape on window", () => {
  const src = read("./ShareProfileModal.tsx");
  assert.match(src, /<ModalShell/);
  assert.doesNotMatch(src, /window\.addEventListener\("keydown"/);
  assert.doesNotMatch(src, /role="dialog"/, "the shell owns the dialog role — no second one");
  assert.match(src, /zIndexClass="z-\[60\] print:hidden"/);
  // the link field keeps its bound label
  assert.match(src, /htmlFor="share-profile-url"[\s\S]*?id="share-profile-url"/);
});

test("CODE-F35: CRM cards are buttons, and every search/sort control has a name", () => {
  const src = read("../clients/page.tsx");
  assert.doesNotMatch(src, /<div onClick=\{\(\) => setDrawerClient\(client\)\}/);
  assert.match(src, /<button type="button" onClick=\{\(\) => setDrawerClient\(client\)\}/);
  assert.match(src, /aria-label="البحث في الموكّلين بالاسم أو الهاتف"/);
  assert.match(src, /aria-label="البحث في أرشيف الموكّلين"/);
  assert.match(src, /aria-label="ترتيب الموكّلين حسب"/);
  // no <button> without an explicit type on this page
  const buttons = src.match(/<button\s[^>]*>/g) ?? [];
  assert.ok(buttons.length > 0);
  for (const b of buttons) assert.match(b, /type="button"/, b);
});
