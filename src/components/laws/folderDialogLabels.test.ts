/**
 * folderDialogLabels.test.ts — the save dialog's finish button and toast
 * (owner note ٠٥ §٢.١, live-test LIVE-F23).
 *   node --test src/components/laws/folderDialogLabels.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { folderDialogPrimaryLabel, folderSavedToast } from "./folderDialogLabels.ts";

test("«تم ✓» with a folder chosen, «إغلاق» with none, «جارٍ الحفظ...» while a save is in flight", () => {
  assert.equal(folderDialogPrimaryLabel({ saving: false, selectedCount: 1, isRTL: true }), "تم ✓");
  assert.equal(folderDialogPrimaryLabel({ saving: false, selectedCount: 3, isRTL: true }), "تم ✓");
  assert.equal(folderDialogPrimaryLabel({ saving: false, selectedCount: 0, isRTL: true }), "إغلاق");
  assert.equal(folderDialogPrimaryLabel({ saving: true, selectedCount: 1, isRTL: true }), "جارٍ الحفظ...");
  assert.equal(folderDialogPrimaryLabel({ saving: true, selectedCount: 0, isRTL: true }), "جارٍ الحفظ...");
});

test("toast names the folder", () => {
  assert.equal(folderSavedToast("saved", "الحب الحب", true), "تم حفظ المستند في مجلد «الحب الحب»");
  assert.equal(folderSavedToast("removed", "عقود", true), "أُزيل المستند من مجلد «عقود»");
  assert.equal(folderSavedToast("saved", "  ", true), "تم حفظ المستند في مجلد «المجلد»");
});
