/**
 * foldersSourceContract.test.ts — what the «مجلداتي» screens must keep
 * (owner notes ٠٣–٠٥, LIVE-F23, 2026-10-30). The components are "use client"
 * JSX that `node --test` cannot render, so their contract is read from source.
 *   node --test src/app/laws/components/foldersSourceContract.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");
const read = (rel: string) => readFileSync(path.join(srcRoot, rel), "utf8");

/** Source with block and line comments removed (a comment may still name a deleted symbol). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("ALL_LIBRARY_DOCS (the 14-row sample) is gone from every source file", () => {
  const users = walk(srcRoot).filter(f => /\bALL_LIBRARY_DOCS\b/.test(code(readFileSync(f, "utf8"))));
  assert.deepEqual(users.map(f => path.relative(srcRoot, f)), []);
});

test("both «إدارة المحتوى» screens use the real-library picker", () => {
  for (const rel of ["app/laws/components/SmartFolders.tsx", "components/laws/FolderSelectionModal.tsx"]) {
    assert.match(read(rel), /<FolderContentPicker\b/, rel);
  }
  const hook = read("app/laws/components/useFolderLibrarySearch.ts");
  assert.match(hook, /\/api\/library\/search/);
  assert.match(hook, /\/api\/library\/init\?section=/);
  assert.match(hook, /DEBOUNCE_MS/);
  assert.match(hook, /AbortController/);
});

test("the «⋮» menu is portalled to <body>, fixed, and closes on outside press / Escape / scroll / resize", () => {
  const card = code(read("app/laws/components/FolderCard.tsx"));
  assert.match(card, /createPortal\(/);
  assert.match(card, /document\.body/);
  assert.match(card, /position: "fixed"/);
  assert.match(card, /placeFloatingMenu\(/);
  assert.ok(!/absolute bottom-full/.test(card), "the clipped absolute menu is gone");
  for (const ev of ['"pointerdown"', '"scroll"', '"resize"', '"Escape"']) assert.ok(card.includes(ev), ev);
  assert.match(card, /role="menu"/);
  assert.match(card, /role="menuitem"/);
  assert.match(card, /aria-haspopup="menu"/);
});

test("an empty folder offers «إضافة محتوى للمجلد», wired to onManageContent", () => {
  const card = read("app/laws/components/FolderCard.tsx");
  assert.match(card, /onClick=\{onManageContent\}[\s\S]{0,700}إضافة محتوى للمجلد/);
});

test("the save dialog: a finish button with three labels, Escape/backdrop close (not mid-save), focus kept inside", () => {
  const modal = code(read("components/laws/FolderSelectionModal.tsx"));
  assert.match(modal, /folderDialogPrimaryLabel\(\{ saving, selectedCount, isRTL \}\)/);
  assert.match(modal, /data-testid="folder-dialog-finish"/);
  assert.match(modal, /bg-\[#0B3D2E\]/);
  assert.match(modal, /const finish = useCallback\(\(\) => \{\s*if \(saving\) return;/);
  assert.match(modal, /onMouseDown=\{e => \{ if \(e\.target === e\.currentTarget\) finish\(\); \}\}/);
  assert.match(modal, /e\.key === "Escape"/);
  assert.match(modal, /e\.key !== "Tab"/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /opener\.focus\(\)/);
  assert.match(modal, /folderSavedToast\("saved"/);
  assert.match(modal, /محفوظ هنا ✓/);
});

test("the silent «+» beside the tick is replaced by a named «إدارة المجلد» link", () => {
  const modal = code(read("components/laws/FolderSelectionModal.tsx"));
  assert.match(modal, /إدارة المجلد/);
  assert.ok(!/\bPlus\b/.test(modal), "no bare «+» icon left in the dialog");
});

test("the dialog's props stay compatible for the result-card stream (isOpen, onClose, currentDoc)", () => {
  const modal = read("components/laws/FolderSelectionModal.tsx");
  const props = modal.match(/interface FolderSelectionModalProps \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(props, /isOpen: boolean;/);
  assert.match(props, /onClose: \(\) => void;/);
  assert.match(props, /currentDoc: \{/);
  assert.match(props, /type: "law" \| "precedent" \| "order" \| "book";/);
});

test("«ملاحظاتي وتحديداتي» names and badges rows through noteDocRef, in one batched title call", () => {
  const notes = code(read("app/laws/components/MyNotesSection.tsx"));
  assert.match(notes, /parseNotePageId/);
  assert.match(notes, /noteDisplayTitle/);
  assert.match(notes, /fetchLibraryTitles\(body\)/);
  assert.ok(!/getCleanDocumentName/.test(notes));
  assert.ok(!/startsWith\("precedents-"\)/.test(notes), "the prefix no reader writes is no longer the precedent test");
});
