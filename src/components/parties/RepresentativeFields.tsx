"use client";

import { useId, useState } from "react";
import { PARTY_ROLE_OTHER, REPRESENTATIVE_ID_ERROR, representativeIdValid } from "@/lib/services/orderIntake";

type RepresentativeField = "representativeRole" | "representativeRoleOther" | "representativeId";

const ROLES = ["مدير عام", "عضو مجلس إدارة", "مفوض بالتوقيع", "مدير"] as const;

/**
 * A company party's representative: capacity (with «أخرى» and a free-text
 * field) and an optional ID / iqama number (owner package §3.5-3b). Shared by
 * the drafter's DraftPartyForm and contracts' PartyForm, so both ask the same
 * thing; the validators read it with orderIntake.ts's helpers.
 */
export function RepresentativeFields({ role, roleOther, repId, onChange, inp, lbl, isDark }: {
  role: string;
  roleOther: string | undefined;
  repId: string | undefined;
  onChange: (field: RepresentativeField, value: string) => void;
  inp: string;
  lbl: string;
  isDark: boolean;
}) {
  const ids = useId();
  const id = repId ?? "";
  // The error waits until the field is left or 10 characters are in: the
  // first digit alone is not a mistake yet.
  const [left, setLeft] = useState(false);
  const idBad = (left || id.trim().length >= 10) && !representativeIdValid(id);

  return (
    <>
      <div>
        <label htmlFor={`${ids}-role`} className={lbl}>صفة الممثل</label>
        <select id={`${ids}-role`} className={inp} value={role} onChange={e => onChange("representativeRole", e.target.value)}>
          <option value="">اختر الصفة</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          <option value={PARTY_ROLE_OTHER}>{PARTY_ROLE_OTHER}</option>
        </select>
      </div>
      {role === PARTY_ROLE_OTHER && (
        <div>
          <label htmlFor={`${ids}-other`} className={lbl}>حدّد الصفة</label>
          <input id={`${ids}-other`} className={inp} maxLength={80} value={roleOther ?? ""}
            onChange={e => onChange("representativeRoleOther", e.target.value)} placeholder="مثال: وكيل شرعي" />
        </div>
      )}
      <div>
        <label htmlFor={`${ids}-id`} className={lbl}>رقم هوية الممثل / الإقامة</label>
        <input id={`${ids}-id`} className={inp} inputMode="numeric" maxLength={10} dir="ltr" value={id}
          onChange={e => onChange("representativeId", e.target.value)} onBlur={() => setLeft(true)} placeholder="اختياري — 10 أرقام"
          aria-invalid={idBad} aria-describedby={idBad ? `${ids}-id-error` : undefined} />
        {idBad && (
          <p id={`${ids}-id-error`} className={`mt-1 text-[10px] ${isDark ? "text-red-400" : "text-red-600"}`}>{REPRESENTATIVE_ID_ERROR}</p>
        )}
      </div>
    </>
  );
}
