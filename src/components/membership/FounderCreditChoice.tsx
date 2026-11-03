"use client";

import { useEffect, useRef, useState } from "react";
import { founderCreditChoiceView, type FounderCreditKind } from "@/lib/membership/founderPlan";

/**
 * FounderCreditChoice — «استخدم رصيد باقة المؤسس» on the four AI tools (P3,
 * Task 7). It reads GET /api/v1/membership/founder once and renders nothing
 * while loading, on any error, for a non-member, when nothing of this credit
 * remains, or when the run would not spend it (`eligible` false: the
 * drafter's rejoinder). Otherwise a checkbox: a drafting work is checked by
 * default, the one shared independent output is not.
 *
 * The page owns `value` (initially false) and sends `useCredit: value`. The
 * component drives it to false whenever it is hidden, and to the default once
 * it shows, so a page never asks for a credit the lawyer cannot see
 * (founderCreditChoiceView). Remounting reads the balance again.
 */

interface Props {
  kind: FounderCreditKind;
  value: boolean;
  onChange: (v: boolean) => void;
  /** Whether this run would spend this credit at all (default true). */
  eligible?: boolean;
  isDark: boolean;
  disabled?: boolean;
}

export default function FounderCreditChoice({ kind, value, onChange, eligible = true, isDark, disabled = false }: Props) {
  const [reply, setReply] = useState<unknown>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/v1/membership/founder", { cache: "no-store", signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        if (!ctrl.signal.aborted) setReply(json);
      })
      .catch(() => {
        // Hidden on any failure: the run is then paid in points as usual.
      });
    return () => ctrl.abort();
  }, []);

  const view = founderCreditChoiceView(kind, reply, eligible);
  const shown = view.show;
  const defaultChecked = view.show && view.defaultChecked;
  useEffect(() => {
    onChangeRef.current(shown ? defaultChecked : false);
  }, [shown, defaultChecked]);

  if (!view.show) return null;
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold ${
        isDark ? "border-[#C8A762]/25 bg-[#C8A762]/[0.06] text-zinc-300" : "border-[#C8A762]/40 bg-[#C8A762]/[0.08] text-zinc-700"
      }`}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[#0B3D2E]"
      />
      <span>{view.label}</span>
    </label>
  );
}
