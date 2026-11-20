"use client";

/**
 * InheritanceCalculator — T18-P1-39 (batch l11): the heirs form and the shares
 * (src/lib/inheritance/faraid.ts). Everything happens in this tab: nothing is
 * stored or sent, and no points are spent. Every result carries the review
 * note; an unsupported case is refused with its reason, never guessed.
 */
import { useMemo, useState } from "react";
import { Scales, Warning, Info } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import {
  HEIR_LABELS_AR,
  MAX_COUNT,
  REVIEW_NOTE_AR,
  amountOf,
  calculateFaraid,
  type Frac,
  type Heir,
  type Heirs,
} from "@/lib/inheritance/faraid";

const GROUPS: { title: string; heirs: Heir[] }[] = [
  { title: "الزوجان", heirs: ["husband", "wife"] },
  { title: "الأصول", heirs: ["father", "mother", "grandfather", "paternalGrandmother", "maternalGrandmother"] },
  { title: "الفروع", heirs: ["son", "daughter", "sonsSon", "sonsDaughter"] },
  { title: "الإخوة", heirs: ["fullBrother", "fullSister", "paternalBrother", "paternalSister", "maternalSibling"] },
  { title: "بقية العصبة", heirs: ["fullNephew", "paternalNephew", "fullUncle", "paternalUncle", "fullCousin", "paternalCousin"] },
];

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (v: number | string) => String(v).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
const fracAr = (f: Frac) => (f.d === 1 ? ar(f.n) : `${ar(f.n)}/${ar(f.d)}`);
const money = (v: number | null) => (v === null ? "" : `${v.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`);

export default function InheritanceCalculator({ preview }: { preview: boolean }) {
  const { isDark } = useTheme();
  const [heirs, setHeirs] = useState<Heirs>({});
  const [estateText, setEstateText] = useState("");
  const estate = useMemo(() => {
    const v = Number(estateText.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,،\s]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [estateText]);
  const result = useMemo(() => (Object.values(heirs).some((v) => (v ?? 0) > 0) ? calculateFaraid(heirs) : null), [heirs]);

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const field = `w-16 rounded-lg border px-2 py-1 text-center text-[12px] ${isDark ? "border-white/[0.08] bg-zinc-950 text-zinc-200" : "border-slate-200 bg-white text-slate-800"}`;

  const set = (k: Heir, raw: string) => {
    const v = Math.max(0, Math.min(MAX_COUNT[k], Math.floor(Number(raw) || 0)));
    setHeirs((h) => {
      const next: Heirs = { ...h, [k]: v };
      // A husband and a wife never inherit together.
      if (k === "husband" && v) next.wife = 0;
      if (k === "wife" && v) next.husband = 0;
      return next;
    });
  };

  const text = result && result.ok
    ? [
        "حاسبة المواريث — نتيجة استرشادية",
        ...result.shares.map((s) => `${HEIR_LABELS_AR[s.heir]} (${s.count}): ${s.share.n}/${s.share.d}${s.count > 1 ? ` — لكل واحد ${s.each.n}/${s.each.d}` : ""}${estate ? ` — ${money(amountOf(s.share, estate))}` : ""} — ${s.reason}`),
        ...result.excluded.map((e) => `${HEIR_LABELS_AR[e.heir]}: محجوب بـ${e.by}`),
        ...result.notes,
        REVIEW_NOTE_AR,
      ].join("\n")
    : "";

  return (
    <div className={`mx-auto max-w-4xl space-y-4 p-5 ${isDark ? "text-zinc-100" : "text-slate-800"}`} dir="rtl">
      <div className="flex items-center gap-2">
        <Scales size={22} weight="duotone" className="text-[#C8A762]" />
        <h1 className="text-[18px] font-black">حاسبة المواريث</h1>
      </div>
      {preview && (
        <p role="status" className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          معاينة للإدارة: الحاسبة غير منشورة للمستخدمين حتى يراجع المالك نتائجها.
        </p>
      )}
      <p className={`flex items-start gap-1.5 text-[12px] leading-relaxed ${muted}`}>
        <Info size={14} className="mt-0.5 shrink-0" /> {REVIEW_NOTE_AR}
      </p>

      <div className={`${card} space-y-4 p-4`}>
        {GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend className="mb-2 text-[12px] font-bold">{g.title}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.heirs.map((k) => (
                <label key={k} className="flex items-center justify-between gap-2 text-[12px]">
                  <span>{HEIR_LABELS_AR[k]}</span>
                  <input type="number" inputMode="numeric" min={0} max={MAX_COUNT[k]} value={heirs[k] ?? 0}
                    onChange={(e) => set(k, e.target.value)} className={field} aria-label={`عدد: ${HEIR_LABELS_AR[k]}`} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-bold">صافي التركة (اختياري)</span>
          <input value={estateText} onChange={(e) => setEstateText(e.target.value)} inputMode="decimal" placeholder="بعد الديون والوصية"
            className={`w-48 rounded-lg border px-2 py-1 text-[12px] ${isDark ? "border-white/[0.08] bg-zinc-950 text-zinc-200" : "border-slate-200 bg-white"}`} />
          <span className={muted}>بالريال</span>
        </label>
      </div>

      {result && !result.ok && (
        <p role="alert" className={`flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] ${isDark ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <Warning size={15} className="mt-0.5 shrink-0" /> {result.unsupported}
        </p>
      )}

      {result && result.ok && (
        <div className={`${card} space-y-3 p-4`}>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-bold">أصل المسألة بعد التصحيح: {ar(result.base)}</span>
            {result.awl && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-700"}`}>عائلة</span>}
            {result.radd && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-700"}`}>فيها رد</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className={muted}>
                  <th className="py-1 text-start">الوارث</th>
                  <th className="py-1 text-start">العدد</th>
                  <th className="py-1 text-start">نصيبهم</th>
                  <th className="py-1 text-start">لكل واحد</th>
                  {estate && <th className="py-1 text-start">المبلغ لكل واحد</th>}
                  <th className="py-1 text-start">السبب</th>
                </tr>
              </thead>
              <tbody>
                {result.shares.map((s) => (
                  <tr key={s.heir} className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                    <td className="py-1.5 font-semibold">{HEIR_LABELS_AR[s.heir]}</td>
                    <td className="py-1.5">{ar(s.count)}</td>
                    <td className="py-1.5">{fracAr(s.share)}</td>
                    <td className="py-1.5">{ar(s.each.n * (result.base / s.each.d))} من {ar(result.base)}</td>
                    {estate && <td className="py-1.5">{money(amountOf(s.each, estate))}</td>}
                    <td className={`py-1.5 ${muted}`}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.excluded.length > 0 && (
            <p className={`text-[12px] ${muted}`}>
              محجوبون: {result.excluded.map((e) => `${HEIR_LABELS_AR[e.heir]} (بـ${e.by})`).join("، ")}
            </p>
          )}
          {result.notes.map((note) => <p key={note} className={`text-[12px] ${muted}`}>{note}</p>)}
          <AiResultActions text={text} filename="حاسبة-المواريث" title="حاسبة المواريث — نتيجة استرشادية" showCollector={false} showSaveToCase={false} />
        </div>
      )}
    </div>
  );
}
