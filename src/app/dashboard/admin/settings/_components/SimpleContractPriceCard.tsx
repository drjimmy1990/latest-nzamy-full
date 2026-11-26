"use client";

/**
 * SimpleContractPriceCard — the price in points of «صائغ العقود المبسّط»
 * (owner ١٢٣; batch l12 simpledraft). One platform_settings row,
 * simple_contract_price = {"points": n}, written through PATCH
 * /api/v1/admin/settings (validated + audited there). The owner has not fixed
 * 100 or 150 yet, so until a value is saved the tool charges the code default
 * (100). Switching the tool itself on is done in the AI tools settings
 * (ai_tools), after its n8n workflow is imported.
 */

import { useEffect, useState } from "react";
import { FloppyDisk, PencilSimpleLine, SpinnerGap } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  SIMPLE_CONTRACT_DEFAULT_PRICE,
  SIMPLE_CONTRACT_PRICE_KEY,
  SIMPLE_CONTRACT_PRICE_MAX,
  simpleContractPriceFrom,
} from "@/lib/ai/simpleContract";

type Status = { ok: boolean; text: string } | null;

export function SimpleContractPriceCard() {
  const { isDark } = useTheme();
  const [points, setPoints] = useState(String(SIMPLE_CONTRACT_DEFAULT_PRICE));
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
        const value = simpleContractPriceFrom(body?.data?.[SIMPLE_CONTRACT_PRICE_KEY]);
        if (value !== null) setPoints(String(value));
        setStored(value !== null);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    const raw = points.trim();
    const n = /^\d+$/.test(raw) ? Number(raw) : -1;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: SIMPLE_CONTRACT_PRICE_KEY, value: { points: n } }),
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
    <div className={`rounded-2xl border p-6 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`} id="simple-contract-price">
      <div className="mb-4 flex items-start gap-3">
        <PencilSimpleLine size={22} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <div>
          <p className={`text-sm font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            سعر صائغ العقود المبسّط (نقاط)
            {loaded && !stored && <span className={`ms-2 text-[11px] font-normal ${muted}`}>(القيمة الافتراضية — لم تُحفظ بعد)</span>}
          </p>
          <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
            أداة للأفراد والمنشآت. السعر ١٠٠ نقطة حتى يُحفظ غيره. عدد صحيح من ١ إلى{" "}
            {SIMPLE_CONTRACT_PRICE_MAX.toLocaleString("ar-SA")}. تشغيل الأداة نفسها من إعدادات أدوات الذكاء الاصطناعي بعد تجهيز مسارها التقني.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          className={`w-28 rounded-xl border px-3 py-2 font-mono text-sm outline-none ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`}
          inputMode="numeric"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          aria-label="سعر صائغ العقود المبسّط بالنقاط"
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
