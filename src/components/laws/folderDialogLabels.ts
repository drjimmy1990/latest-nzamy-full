/**
 * folderDialogLabels.ts — the words of «إضافة المستند للمجلدات»'s finish
 * button and toast (owner note ٠٥ §٢.١, live-test LIVE-F23). Pure, so the
 * three states are tested without rendering: folderDialogLabels.test.ts.
 */

/**
 * The footer's one primary button:
 *   - «جارٍ الحفظ...» (disabled) while any save/remove request is in flight;
 *   - «تم ✓» once the document is in at least one folder;
 *   - «إغلاق» when it is in none.
 */
export function folderDialogPrimaryLabel(input: { saving: boolean; selectedCount: number; isRTL: boolean }): string {
  const { saving, selectedCount, isRTL } = input;
  if (saving) return isRTL ? "جارٍ الحفظ..." : "Saving...";
  if (selectedCount > 0) return isRTL ? "تم ✓" : "Done ✓";
  return isRTL ? "إغلاق" : "Close";
}

/** «تم حفظ المستند في مجلد «…»» / «أُزيل المستند من مجلد «…»». */
export function folderSavedToast(kind: "saved" | "removed", folderName: string, isRTL: boolean): string {
  const name = folderName.trim() || (isRTL ? "المجلد" : "the folder");
  if (kind === "removed") return isRTL ? `أُزيل المستند من مجلد «${name}»` : `Removed from folder “${name}”`;
  return isRTL ? `تم حفظ المستند في مجلد «${name}»` : `Saved to folder “${name}”`;
}
