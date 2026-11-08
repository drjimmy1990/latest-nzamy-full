/**
 * aiTab.test.ts — the /laws AI tab («باحث المكتبة الذكي») asks the real library
 * assistant and invents nothing (owner note 02, P0).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/laws/aiTab.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tab = readFileSync(new URL("./components/AiTabContent.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the tab asks the real assistant through askLibrary and shows the server's citations", () => {
  assert.match(tab, /import \{ askLibrary, LIBRARY_AI_SOON \} from "\.\.\/\[slug\]\/_library-assistant";/);
  assert.match(tab, /await askLibrary\(\{ message: q \}, window\.location\.pathname \+ window\.location\.search\)/);
  assert.match(tab, /asCitations\(res\.citations\)/);
  assert.match(tab, /<CitedText /);
  assert.match(tab, /<SourceList /);
  assert.match(tab, /const TOOL = "library-assistant";/);
});

test("no fake answer, fake upload, fake status or platform-wide tool cards are left", () => {
  for (const gone of [
    "mockAI", "نظام العمل م/51", "Paperclip", 'type="file"', "متصل", "ThumbsUp", "ThumbsDown", "Robot",
    "StreamingText", "QUICK_ACTIONS", "صغ عقد أو مذكرة", "راجع عقداً", "مسار قضائي", "ترجم مستنداً", "setTimeout(r, 1600",
  ]) {
    assert.ok(!tab.includes(gone), gone);
  }
  assert.doesNotMatch(tab, /مدر[ً-ْ]*ب/);
});

test("honest states before a question: guest, checking, «قريباً», and the price only when usable", () => {
  assert.match(tab, /if \(!user\.isLoggedIn\) return <Shell isDark=\{isDark\} access="guest" \/>;/);
  assert.match(tab, /const usable = useToolUsable\(TOOL\);/);
  assert.match(tab, /usable === null \? "checking" : usable \? "open" : "soon"/);
  assert.match(tab, /href="\/login\?next=%2Flaws"/);
  // The price and the input render only inside the "open" branch.
  const open = tab.slice(tab.indexOf('{access === "open" && ('));
  assert.ok(open.includes("aiToolPriceText(TOOL, \"ar\")"));
  assert.ok(tab.indexOf("aiToolPriceText(TOOL") > tab.indexOf('{access === "open" && ('));
});

test("a refusal is shown in the server's words with its link; a run in flight says so", () => {
  assert.match(tab, /refused: res\.refused === true/);
  assert.match(tab, /\{a\?\.refused && \(/);
  assert.match(tab, /<Link href=\{a\.action\.href\}/);
  assert.match(tab, /يبحث في نصوص المكتبة ويكتب الجواب…/);
});

test("LiteMarkdown stays exported for the law page's chat", () => {
  assert.match(tab, /export const LiteMarkdown = memo\(function LiteMarkdown/);
});

test("dark mode: no surface grays used as text", () => {
  assert.doesNotMatch(tab, /text-(gray|slate)-(50|100|200)\b/);
});

test("the switcher names the tab «باحث المكتبة الذكي» with no robot icon", () => {
  assert.ok(page.includes('{isRTL ? "باحث المكتبة الذكي" : "Smart Library Search"}'));
  assert.ok(!page.includes("PhosphorIcons.Robot"));
});
