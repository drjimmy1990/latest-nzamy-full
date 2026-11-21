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
// Researcher V3 (owner file 11): the session and the answer view are shared with /laws/research.
const session = readFileSync(new URL("./research/_components/useLibraryResearch.ts", import.meta.url), "utf8");
const turnView = readFileSync(new URL("./research/_components/ResearchTurn.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./(index)/page.tsx", import.meta.url), "utf8");

test("the tab asks the real assistant through askLibrary and shows the server's citations", () => {
  assert.match(tab, /import \{ LIBRARY_AI_SOON \} from "\.\.\/\[slug\]\/_library-assistant";/);
  assert.match(tab, /const \{ turns, running, send, reset \} = useLibraryResearch\(\);/);
  assert.match(tab, /await send\(q, scope\);/);
  assert.match(session, /import \{ askLibrary \} from "\.\.\/\.\.\/\[slug\]\/_library-assistant";/);
  // Q458: with the session's conversation id (the server reads the history itself);
  // A2: the key askLibrary mints is followed for the live stages.
  assert.match(session, /\{ message: q, conversationId: conversationRef\.current, \.\.\.scopeField\(scope\) \},\s*window\.location\.pathname \+ window\.location\.search,\s*fetch,\s*\(key\) => watch\.follow\(key\),/);
  assert.match(session, /asCitations\(res\.citations\)/);
  assert.match(turnView, /<CitedText /);
  assert.match(turnView, /<SourceList /);
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

test("a refusal is shown in the server's words with its link; a run in flight shows the live stages", () => {
  assert.match(session, /refused: res\.refused === true/);
  assert.match(turnView, /\{a\?\.refused && \(/);
  assert.match(turnView, /<Link href=\{a\.action\.href\}/);
  assert.match(turnView, /\{a === null && <ResearchStageCard events=\{turn\.events\}/);
});

test("researcher V3 items 2–3 on the tab: no guidance inside the answer, no false footer, no cross-like icons", () => {
  for (const src of [tab, turnView]) {
    assert.ok(!src.includes("اضغط مصدراً"), "guidance moved to the tour");
    assert.ok(!src.includes("كل سؤال يُجاب مستقلاً"), "false: questions share a conversation (Q458)");
    assert.doesNotMatch(src, /\b(Sparkle|Scales|ArrowCounterClockwise)\b/);
  }
  assert.match(tab, /<NotePencil size=\{13\}/);
  assert.match(tab, /<ResearchTour open=\{tourOpen\}/);
  assert.match(tab, /href="\/laws\/research"/);
});

test("LiteMarkdown stays exported for the law page's chat", () => {
  assert.match(tab, /export const LiteMarkdown = memo\(function LiteMarkdown/);
});

test("dark mode: no surface grays used as text", () => {
  assert.doesNotMatch(tab, /text-(gray|slate)-(50|100|200)\b/);
});

test("the researcher's own files: no fake upload, robot, cross icon or surface-gray text", () => {
  const dir = new URL("./research/_components/", import.meta.url);
  for (const f of ["ResearchStudio.tsx", "ResearchTurn.tsx", "ResearchStageCard.tsx", "ResearchAnswerActions.tsx", "ResearchRefDrawer.tsx", "ResearchTour.tsx", "ResearchSelectionBar.tsx"]) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const gone of ["Paperclip", 'type="file"', "Robot", "Scales", "Sparkle", "مزامن سحابياً", "setTimeout(nextStage"]) assert.ok(!src.includes(gone), `${f}: ${gone}`);
    assert.doesNotMatch(src, /text-(gray|slate)-(50|100|200)\b/, f);
    assert.doesNotMatch(src, /مدر[ً-ْ]*ب/, f);
  }
});

test("the switcher names the tab «باحث المكتبة الذكي» with no robot icon", () => {
  assert.ok(page.includes('{isRTL ? "باحث المكتبة الذكي" : "Smart Library Search"}'));
  assert.ok(!page.includes("PhosphorIcons.Robot"));
});
