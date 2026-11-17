/**
 * Saves a calendar file in the browser (P1-37). Not 0 ms before revoking:
 * Safari and older Firefox read the blob after click() returns.
 */
export function downloadIcsFile(ics: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** ASCII on purpose, like hearingIcsFilename: some mail clients mangle non-ASCII names. */
export function deadlineIcsFilename(dueDate: string): string {
  return `deadline-${dueDate}.ics`;
}
