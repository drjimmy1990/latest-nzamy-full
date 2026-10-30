/**
 * Source pins for the case canvas (N3.5 / N3.10). The pure parts have their own
 * tests; these hold the wiring that only shows in the .tsx files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const read = (f: string) => readFileSync(join(here, f), "utf8");
const view = read("CaseGraphView.tsx");
const hook = read("_use-case-graph-state.ts");
const extras = read("CaseGraphCardExtras.tsx");
const drawer = read("CaseImportDrawer.tsx");
const css = readFileSync(join(here, "../../../globals.css"), "utf8");

test("a loaded board is normalised and is not an undo step", () => {
  assert.match(view, /resetGraph\(normalizeLoadedNodes\(saved\.nodes\), normalizeLoadedEdges\(saved\.edges\)\)/);
  assert.doesNotMatch(view, /setNodes\(saved\.nodes/);
  assert.match(hook, /setHistory\(emptyHistory\(\)\)/);
});

test("drags and resizes record one step per gesture, not per pointermove", () => {
  const move = hook.slice(hook.indexOf("const handlePointerMove"), hook.indexOf("const handlePointerUp"));
  assert.doesNotMatch(move, /\bsetNodes\(/, "pointermove uses the raw setter");
  assert.match(hook, /beginGesture\(\);\s*setDraggedNode\(id\)/);
  assert.match(hook, /setResizingNode\(null\);\s*endGesture\(\);/);
});

test("the shortcuts skip fields and use the physical key", () => {
  assert.match(hook, /isEditableTarget\(document\.activeElement/);
  assert.match(hook, /historyShortcut\(e\)/);
});

test("link cards open http(s) only, in a new tab without an opener", () => {
  assert.match(extras, /const safe = safeExternalUrl\(raw\)/);
  assert.match(extras, /href=\{safe\}/);
  assert.match(extras, /rel="noopener noreferrer"/);
  assert.doesNotMatch(extras, /href=\{raw\}|href=\{node\.url\}/);
});

test("urgent cards: a text badge, and the glow stops under reduced motion", () => {
  assert.match(view, /nz-urgent-glow/);
  assert.match(view, /مستعجل/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nz-urgent-glow\s*\{\s*animation: none !important;/);
});

test("no percentages and no invented analysis on the canvas", () => {
  for (const [name, src] of [["CaseGraphView", view], ["CaseImportDrawer", drawer], ["CaseGraphCardExtras", extras]] as const) {
    // (the zoom chip «١٠٠٪» is a zoom level, not a score — so the words, not the sign)
    assert.doesNotMatch(src, /نسبة|احتمال|قوة الموقف|فرص النجاح|ميزان القوة/, `${name} shows no score`);
    assert.doesNotMatch(src, /setTimeout\([^)]*(AI|تحليل)/, `${name} fakes no AI delay`);
  }
});

test("the import drawer is only on the lawyer and firm case files", () => {
  assert.match(view, /const canImport = enableCaseImport && !!caseId;/);
  const lawyer = readFileSync(join(here, "../../lawyer/cases/[id]/page.tsx"), "utf8");
  const firm = readFileSync(join(here, "../../firm/cases/[id]/LegalCanvas.tsx"), "utf8");
  assert.equal((lawyer.match(/caseId=\{id\} enableCaseImport/g) ?? []).length, 2);
  assert.match(firm, /enableCaseImport/);
  const business = readFileSync(join(here, "../cases/[id]/page.tsx"), "utf8");
  assert.doesNotMatch(business, /enableCaseImport/);
});

test("one live board per case page: the inline canvas unmounts while fullscreen is open", () => {
  const lawyer = readFileSync(join(here, "../../lawyer/cases/[id]/page.tsx"), "utf8");
  assert.match(lawyer, /\{!graphFullscreen && \(\s*<CaseGraphView isDark=\{isDark\} isGlobal=\{false\} caseId=\{id\} enableCaseImport \/>/);
});

test("an unconfirmed change is sent on unmount, and a read waits for it", () => {
  // CODE-F24: the controller's dispose() sends what is unconfirmed — in the
  // debounce or failed and waiting to retry (caseGraphAutosave.test.ts).
  assert.match(view, /void ctl\.dispose\(\);/);
  assert.match(view, /autosave\.current\?\.change\(\{ nodes, edges, viewport: \{ pan, scale \} \}\)/);
  assert.doesNotMatch(view, /pendingSave/, "the pre-ack clear is gone");
  const svc = readFileSync(join(here, "../../../../lib/services/caseGraphService.ts"), "utf8");
  const get = svc.slice(svc.indexOf("export async function getCaseGraph"), svc.indexOf("type GraphBody"));
  assert.match(get, /const pending = inflight\.get\(caseId\);\s*if \(pending\) await pending/);
});

test("CODE-F24: versioned saves, conflict choices, page-close guard, draft offered not applied", () => {
  const svc = readFileSync(join(here, "../../../../lib/services/caseGraphService.ts"), "utf8");
  assert.match(svc, /versions\.set\(caseId, data \? data\.updatedAt : null\)/);
  assert.match(svc, /baseUpdatedAt: base/);
  assert.match(svc, /if \(isDemoMode\)/);
  assert.doesNotMatch(svc, /new Date\([^)]/, "the version string is never re-parsed");
  assert.match(view, /حمّل النسخة المحفوظة/);
  assert.match(view, /احتفظ بنسختي/);
  assert.match(view, /addEventListener\("beforeunload"/);
  assert.match(view, /addEventListener\("pagehide"/);
  assert.match(view, /else setOfferedDraft\(d\)/);
  const route = readFileSync(join(here, "../../../api/v1/lawyer/case-graph/[caseId]/route.ts"), "utf8");
  const put = route.slice(route.indexOf("export async function PUT"));
  assert.match(put, /\.eq\("updated_at", baseUpdatedAt\)/);
  assert.match(put, /insertError\.code === "23505"\) return conflict\(\)/);
  assert.match(put, /status: 409/);
  const update = put.slice(put.indexOf(".update("), put.indexOf(".eq(\"case_request_id\""));
  assert.doesNotMatch(update, /owner_user_id|firm_id/, "an update never reassigns the owner");
});
