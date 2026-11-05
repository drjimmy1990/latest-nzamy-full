import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_DOC_FILE_COPY, AI_READABLE_ACCEPT, aiReadableAccept, aiSkippedNote, isAiReadable, pasteState, splitAiReadable, withTextAccept,
} from "./aiReadable.ts";
import { FILE_COPY } from "../../lib/ai/aiFiles.ts";
import { BRIEF_CHECK_PASTE_MAX, BRIEF_CHECK_PASTE_MIN } from "../../lib/ai/tools.ts";

test("PDF and images are readable; Word and the rest are not", () => {
  for (const n of ["صحيفة.pdf", "A.PDF", "scan.jpg", "scan.jpeg", "p.png", "p.webp "]) assert.equal(isAiReadable(n), true, n);
  for (const n of ["مذكرة.docx", "x.doc", "pdf", "a.pdf.exe", ""]) assert.equal(isAiReadable(n), false, n);
});

test("the readable files' ids go out in order; the others are named", () => {
  const files = [
    { documentId: "a", name: "عقد.pdf" },
    { documentId: "b", name: "مذكرة.docx" },
    { documentId: "c", name: "إنذار.jpg" },
  ];
  assert.deepEqual(splitAiReadable(files), { ids: ["a", "c"], skipped: ["مذكرة.docx"] });
});

test("B6: with the flag off nothing changes: the same accept list, and Word stays unreadable", () => {
  assert.equal(AI_READABLE_ACCEPT, ".pdf,.png,.jpg,.jpeg,.webp");
  assert.equal(aiReadableAccept(), AI_READABLE_ACCEPT);
  assert.equal(aiReadableAccept(false), AI_READABLE_ACCEPT);
  assert.equal(isAiReadable("a.docx"), false);
  assert.equal(isAiReadable("a.md"), false);
  assert.equal(withTextAccept(".pdf,.doc,.docx,.jpg,.png"), ".pdf,.doc,.docx,.jpg,.png");
});

test("B6: with the flag on Word and text are readable, and a legacy .doc never is", () => {
  assert.equal(isAiReadable("a.docx", true), true);
  assert.equal(isAiReadable("A.MD", true), true);
  assert.equal(isAiReadable("a.txt", true), true);
  assert.equal(isAiReadable("a.doc", true), false);
  assert.equal(isAiReadable("a.pdf", true), true);
  assert.equal(aiReadableAccept(true).endsWith(",.docx,.txt,.md"), true);
  assert.deepEqual(splitAiReadable([{ documentId: "1", name: "m.md" }], true).ids, ["1"]);
  assert.deepEqual(splitAiReadable([{ documentId: "1", name: "m.md" }]).ids, []);
  assert.deepEqual(splitAiReadable([{ documentId: "1", name: "m.doc" }], true), { ids: [], skipped: ["m.doc"] });
  assert.equal(withTextAccept(".pdf,.doc,.docx,.jpg,.png", true), ".pdf,.doc,.docx,.jpg,.png,.txt,.md");
});

test("B6: the .doc wording on a page is the server's wording (a client page cannot import aiFiles)", () => {
  assert.equal(AI_DOC_FILE_COPY, FILE_COPY.doc);
  assert.equal(aiSkippedNote(["a.doc", "b.doc"]), `${FILE_COPY.doc}. لن تُرسل: a.doc، b.doc`);
});

test("B6: a pasted text counts after trim, the way the server counts it", () => {
  const rules = { min: BRIEF_CHECK_PASTE_MIN, max: BRIEF_CHECK_PASTE_MAX };
  assert.deepEqual(pasteState("  ", rules), { chars: 0, empty: true, tooShort: false, tooLong: false, ok: false });
  assert.deepEqual(pasteState(` ${"س".repeat(199)} `, rules), { chars: 199, empty: false, tooShort: true, tooLong: false, ok: false });
  assert.equal(pasteState("س".repeat(200), rules).ok, true);
  assert.equal(pasteState("س".repeat(60000), rules).ok, true);
  assert.deepEqual(pasteState("س".repeat(60001), rules), { chars: 60001, empty: false, tooShort: false, tooLong: true, ok: false });
});
