/**
 * RequiredMark — the visible «*» after a required field's label (owner package
 * §3.5-3c). The star itself is hidden from screen readers: a control says it
 * is required with `aria-required` (or `required`). A choice made with buttons
 * has no such attribute, so `announce` adds a screen-reader-only «مطلوب».
 * Optional fields get no mark.
 */
export function RequiredMark({ announce = false }: { announce?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="ms-0.5 text-red-500">*</span>
      {announce && <span className="sr-only"> (مطلوب)</span>}
    </>
  );
}
