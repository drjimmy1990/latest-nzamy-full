"use client";

/**
 * LatinDigitsEverywhere — owner file 10 ب24 (batch l12-access): «أي رقم يُكتب
 * في حقول … المبلغ يتحوّل إلى أرقام لاتينية حتى من لوحة مفاتيح عربية».
 *
 * Mounted once in the root layout; draws nothing. Two capture-phase
 * listeners on the document, for NUMBER fields only (wantsLatinDigits in
 * src/lib/forms/latinDigits.ts — type number / tel, inputMode numeric /
 * decimal / tel, or data-latin-digits="true"; never free text):
 *
 *   - `beforeinput` on a `type="number"` field: the browser would DROP an
 *     Arabic digit before any `input` event, so the keystroke is cancelled
 *     and its Latin form appended (a number field keeps no caret position);
 *   - `input` on any other number field: the value is rewritten to Latin in
 *     place, caret kept, before the page's own onChange reads it.
 *
 * Both write through the INPUT prototype's own value setter, not the
 * element's: React tracks a controlled input's last value on the element, so
 * a write through the element would make React think nothing changed and
 * skip its onChange. The fields that already convert while typing (the 20
 * forms of 064b7b6e, the Moyasar card fields) are unaffected — their value
 * is already Latin, so nothing is written.
 */

import { useEffect } from "react";
import { hasNonLatinDigits, latinReplacementFor, toLatinDigits, wantsLatinDigits } from "@/lib/forms/latinDigits";

function nativeSetValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export default function LatinDigitsEverywhere() {
  useEffect(() => {
    const onBeforeInput = (e: Event) => {
      const el = e.target as HTMLInputElement | null;
      if (!el || el.type !== "number" || !wantsLatinDigits(el)) return;
      const ie = e as InputEvent;
      const latin = latinReplacementFor(ie.data);
      if (latin === null || !ie.cancelable) return;
      e.preventDefault();
      nativeSetValue(el, `${el.value}${latin}`);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement | null;
      if (!el || el.type === "number" || !wantsLatinDigits(el)) return;
      const before = el.value;
      if (typeof before !== "string" || !hasNonLatinDigits(before)) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      nativeSetValue(el, toLatinDigits(before));
      if (start !== null && end !== null) {
        try {
          el.setSelectionRange(start, end);
        } catch {
          // a type without a selection: the value is what matters
        }
      }
    };
    document.addEventListener("beforeinput", onBeforeInput, { capture: true });
    document.addEventListener("input", onInput, { capture: true });
    return () => {
      document.removeEventListener("beforeinput", onBeforeInput, { capture: true });
      document.removeEventListener("input", onInput, { capture: true });
    };
  }, []);
  return null;
}
