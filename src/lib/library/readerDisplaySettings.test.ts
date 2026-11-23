import test from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_READER_DISPLAY_DEFAULTS, libraryReaderDisplayIssue, parseLibraryReaderDisplay } from "./readerDisplaySettings.ts";
import { freeDecreePages } from "./freePages.ts";

test("library_reader_display: defaults 0 free decree pages and the automatic child name (owner Q172 ب)", () => {
  assert.deepEqual(LIBRARY_READER_DISPLAY_DEFAULTS, { decree_free_pages: 0, child_names: "auto" });
  assert.deepEqual(parseLibraryReaderDisplay(null), LIBRARY_READER_DISPLAY_DEFAULTS);
  assert.deepEqual(parseLibraryReaderDisplay({ decree_free_pages: 2, child_names: "short" }), { decree_free_pages: 2, child_names: "short" });
  assert.deepEqual(parseLibraryReaderDisplay({ decree_free_pages: 2, child_names: "full" }), { decree_free_pages: 2, child_names: "full" });
  // a malformed field takes its default; the other keeps its value
  assert.deepEqual(parseLibraryReaderDisplay({ decree_free_pages: -1, child_names: "short" }), { decree_free_pages: 0, child_names: "short" });
  assert.deepEqual(parseLibraryReaderDisplay({ decree_free_pages: 3, child_names: "x" }), { decree_free_pages: 3, child_names: "auto" });
});

test("Q172 (l13): a row saved before the owner's answer (batch l12's child_name_form) no longer pins (أ)", () => {
  // l12's admin page saved both fields together, so a stored "full" may only be the old default.
  assert.deepEqual(parseLibraryReaderDisplay({ decree_free_pages: 0, child_name_form: "full" }), { decree_free_pages: 0, child_names: "auto" });
  assert.deepEqual(parseLibraryReaderDisplay({ decree_free_pages: 1, child_name_form: "short" }), { decree_free_pages: 1, child_names: "auto" });
  // the admin forces full with the new key
  assert.equal(parseLibraryReaderDisplay({ child_names: "full", child_name_form: "short" }).child_names, "full");
});

test("library_reader_display: the admin write is validated", () => {
  assert.equal(libraryReaderDisplayIssue({ decree_free_pages: 0, child_names: "auto" }), null);
  assert.equal(libraryReaderDisplayIssue({ decree_free_pages: 0, child_names: "full" }), null);
  assert.equal(libraryReaderDisplayIssue({ child_names: "short" }), null);
  assert.equal(libraryReaderDisplayIssue({ decree_free_pages: 2 }), null);
  // an old open admin tab still saves (its key is ignored on read)
  assert.equal(libraryReaderDisplayIssue({ decree_free_pages: 0, child_name_form: "full" }), null);
  assert.ok(libraryReaderDisplayIssue({ child_name_form: "auto" }));
  assert.ok(libraryReaderDisplayIssue([]));
  assert.ok(libraryReaderDisplayIssue({ decree_free_pages: 1.5 }));
  assert.ok(libraryReaderDisplayIssue({ decree_free_pages: 21 }));
  assert.ok(libraryReaderDisplayIssue({ child_names: "long" }));
  assert.ok(libraryReaderDisplayIssue({ other: 1 }));
});

test("Q101: decree free pages follow the setting; whitelist and per-item override still win", () => {
  assert.equal(freeDecreePages({ freeLimit: 5 }, 9, 0), 0);
  assert.equal(freeDecreePages({ freeLimit: 5 }, 9, 2), 2);
  assert.equal(freeDecreePages({ freeLimit: 5 }, 1, 2), 1);
  assert.equal(freeDecreePages({ freeLimit: -1 }, 9, 0), -1);
  assert.equal(freeDecreePages({ freeLimit: 5, isWhitelisted: true }, 9, 0), -1);
  assert.equal(freeDecreePages({ freeLimit: 4, freeLimitSource: "override" }, 9, 0), 4);
  // no setting given → the old two pages (the books' rule is untouched)
  assert.equal(freeDecreePages({ freeLimit: 5 }, 9), 2);
});
