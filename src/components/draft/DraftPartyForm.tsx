"use client";

import { PartyData } from "@/components/draft/draftConstants";

interface PartyFormProps {
  data: PartyData;
  onChange: (field: keyof PartyData, value: string) => void;
  isCommittee: boolean;
  isDark: boolean;
}

export function DraftPartyForm({ data, onChange, isCommittee, isDark }: PartyFormProps) {
  const inp = `w-full rounded-xl border p-3 text-[12px] outline-none transition-colors ${
    isDark
      ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"
  }`;
  const lbl = `block text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {([ ["company", "🏢 شركة"], ["individual", "👤 فرد"], ["government", "🏛️ جهة حكومية"] ] as const).map(([t, l]) => (
          <button key={t} onClick={() => onChange("type", t)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-all ${
              data.type === t
                ? isDark ? "bg-[#0B3D2E]/30 border-[#0B3D2E]/50 text-emerald-300" : "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E]"
                : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
            }`}>{l}</button>
        ))}
      </div>

      {data.type === "company" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>اسم الشركة</label><input className={inp} value={data.companyName} onChange={e => onChange("companyName", e.target.value)} placeholder="الاسم التجاري" /></div>
          <div><label className={lbl}>السجل التجاري</label><input className={inp} value={data.commercialReg} onChange={e => onChange("commercialReg", e.target.value)} placeholder="10 أرقام" /></div>
          <div><label className={lbl}>الرقم الموحد (700)</label><input className={inp} value={data.unifiedNum} onChange={e => onChange("unifiedNum", e.target.value)} placeholder="700XXXXXXX" /></div>
          {isCommittee && <div><label className={lbl}>الرقم الضريبي / الجمركي</label><input className={inp} value={data.taxOrCustomsNum} onChange={e => onChange("taxOrCustomsNum", e.target.value)} placeholder="الرقم" /></div>}
          <div><label className={lbl}>الممثل النظامي</label><input className={inp} value={data.representative} onChange={e => onChange("representative", e.target.value)} placeholder="الاسم الكامل" /></div>
          <div>
            <label className={lbl}>صفة الممثل</label>
            <select className={inp} value={data.representativeRole} onChange={e => onChange("representativeRole", e.target.value)}>
              <option value="">اختر الصفة</option>
              <option value="مدير عام">مدير عام</option>
              <option value="عضو مجلس إدارة">عضو مجلس إدارة</option>
              <option value="مفوض بالتوقيع">مفوض بالتوقيع</option>
              <option value="مدير">مدير</option>
            </select>
          </div>
          <div className="col-span-2"><label className={lbl}>العنوان</label><input className={inp} value={data.address} onChange={e => onChange("address", e.target.value)} placeholder="المدينة — الحي — الشارع" /></div>
        </div>
      )}

      {data.type === "individual" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>الاسم الكامل</label><input className={inp} value={data.fullName} onChange={e => onChange("fullName", e.target.value)} placeholder="الاسم الرباعي" /></div>
          <div><label className={lbl}>رقم الهوية / الإقامة</label><input className={inp} value={data.idNumber} onChange={e => onChange("idNumber", e.target.value)} placeholder="10 أرقام" /></div>
          <div><label className={lbl}>الجنسية</label><input className={inp} value={data.nationality} onChange={e => onChange("nationality", e.target.value)} placeholder="سعودي / غير ذلك" /></div>
          {isCommittee && <div><label className={lbl}>الرقم الضريبي / الجمركي</label><input className={inp} value={data.taxOrCustomsNum} onChange={e => onChange("taxOrCustomsNum", e.target.value)} placeholder="الرقم" /></div>}
        </div>
      )}

      {data.type === "government" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>اسم الجهة</label><input className={inp} value={data.entityName} onChange={e => onChange("entityName", e.target.value)} placeholder="اسم الجهة الحكومية" /></div>
          <div><label className={lbl}>الرقم الموحد</label><input className={inp} value={data.unifiedNumGov} onChange={e => onChange("unifiedNumGov", e.target.value)} placeholder="الرقم الموحد" /></div>
          <div><label className={lbl}>المسؤول / جهة التواصل</label><input className={inp} value={data.contactPerson} onChange={e => onChange("contactPerson", e.target.value)} placeholder="الجهة المختصة" /></div>
        </div>
      )}
    </div>
  );
}
