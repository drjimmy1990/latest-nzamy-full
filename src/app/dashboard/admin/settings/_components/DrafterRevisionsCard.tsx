"use client";

/**
 * DrafterRevisionsCard — owner ١٦٦ (batch l13): how many section edits
 * («عدّل هذا القسم», the revisions) a legal-drafter memo includes in its price.
 * One platform_settings row, drafter_revisions_per_memo = {"included": n},
 * written through PATCH /api/v1/admin/settings (validated + audited there).
 * 5 until a value is saved; the edit after the last included one is refused
 * (src/lib/ai/sectionEdits.ts). Same shape as SimpleContractPriceCard.
 */

import { useEffect, useState } from "react";
import { FloppyDisk, PencilSimpleLine, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  SECTION_EDITS_INCLUDED_DEFAULT,
  SECTION_EDITS_SETTING_KEY,
  SECTION_EDIT_MAX_PER_MEMO,
  sectionEditsIncludedFrom,
} from "@/lib/ai/sectionEdits";

type Status = { ok: boolean; text: string } | null;

export function DrafterRevisionsCard() {
  const { isDark } = useTheme();
  const [count, setCount] = useState(String(SECTION_EDITS_INCLUDED_DEFAULT));
  const [stored, setStored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/admin/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: Record<string, unknown> } | null) => {
        if (!alive) return;
        const raw = body?.data?.[SECTION_EDITS_SETTING_KEY];
        const isSet = raw !== undefined && raw !== null;
        if (isSet) setCount(String(sectionEditsIncludedFrom(raw)));
        setStored(isSet);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    const raw = count.trim();
    const n = /^\d+$/.test(raw) ? Number(raw) : -1;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: SECTION_EDITS_SETTING_KEY, value: { included: n } }),
      });
      if (res.ok) {
        setStored(true);
        setStatus({ ok: true, text: "حُفظ، ويسري على الطلبات الجديدة فوراً." });
      } else {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setStatus({ ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ، حاول مرة أخرى." });
      }
    } catch {
      setStatus({ ok: false, text: "تعذّر الحفظ، حاول مرة أخرى." });
    }
    setSaving(false);
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  return (
    <div className={`rounded-2xl border p-6 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`} id="drafter-revisions">
      <div className="mb-4 flex items-start gap-3">
        <PencilSimpleLine size={22} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <div>
          <p className={`text-sm font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            التعديلات المشمولة في سعر مذكرة الصائغ القانوني
            {loaded && !stored && <span className={`ms-2 text-[11px] font-normal ${muted}`}>(القيمة الافتراضية — لم تُحفظ بعد)</span>}
          </p>
          <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
            عدد مرات «عدّل هذا القسم» في المذكرة الواحدة دون نقاط إضافية (السؤال ١٦٦: حتى ٥). وبعد آخر تعديل مشمول لا يُقبل تعديل آخر على المذكرة نفسها. عدد صحيح من ٠ إلى{" "}
            {SECTION_EDIT_MAX_PER_MEMO.toLocaleString("ar-SA")}، والقيمة ٥ حتى يُحفظ غيرها.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          className={`w-28 rounded-xl border px-3 py-2 font-mono text-sm outline-none ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`}
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          aria-label="عدد التعديلات المشمولة في سعر المذكرة"
        />
        <button
          type="button"
          disabled={!loaded || saving}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] disabled:opacity-60"
        >
          {saving ? <SpinnerGap size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
          حفظ
        </button>
      </div>
      {status && (
        <p className={`mt-2 text-xs font-bold ${status.ok ? (isDark ? "text-emerald-400" : "text-emerald-700") : isDark ? "text-rose-400" : "text-rose-700"}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
