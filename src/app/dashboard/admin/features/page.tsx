"use client";

/**
 * /dashboard/admin/features — «مفاتيح الميزات» (O22 / file 15 #53, batch
 * l11-misc).
 *
 * BEFORE: five invented switches kept in browser state and a browser-only
 * save form; nothing in the platform read them.
 *
 * NOW: the switches are platform_settings.feature_flags, the closed list in
 * src/lib/featureFlags/featureFlags.ts. The page reads it through GET
 * /api/v1/admin/settings and writes the whole object through PATCH (staff
 * settings.write, validated, audited); the server reads it with a one-minute
 * cache. The two beta gates are code constants and are shown read-only.
 */

import { useCallback, useEffect, useState } from "react";
import { Info, Lock, ToggleRight, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { BETA_MONOPOLY_MODE, BETA_REVIEW_MODE } from "@/lib/betaConfig";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS_SETTING,
  FIXED_FLAGS,
  parseFeatureFlags,
  type FeatureFlagKey,
  type FeatureFlagValues,
  type FixedFlag,
} from "@/lib/featureFlags/featureFlags";

/** The code value of each fixed beta gate (featureFlags.ts FIXED_FLAGS). */
const FIXED_FLAG_ON: Record<FixedFlag["id"], boolean> = {
  review: BETA_REVIEW_MODE,
  "single-provider": BETA_MONOPOLY_MODE,
};

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; flags: FeatureFlagValues };

export default function AdminFeatureFlagsPage() {
  const { isDark } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [saving, setSaving] = useState<FeatureFlagKey | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/v1/admin/settings", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown>; error?: string } | null;
      if (!res.ok || !body?.data) {
        setState({ kind: "error", message: body?.error ?? "تعذّر تحميل المفاتيح الآن — حاول بعد قليل." });
        return;
      }
      setState({ kind: "ready", flags: parseFeatureFlags(body.data[FEATURE_FLAGS_SETTING]) });
    } catch {
      setState({ kind: "error", message: "تعذّر تحميل المفاتيح الآن — حاول بعد قليل." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: FeatureFlagKey) {
    if (state.kind !== "ready" || saving) return;
    const next = { ...state.flags, [key]: !state.flags[key] };
    setSaving(key);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: FEATURE_FLAGS_SETTING, value: next }),
      });
      const body = (await res.json().catch(() => null)) as { data?: { value?: unknown }; error?: string } | null;
      if (!res.ok) {
        setNotice({ ok: false, text: body?.error ?? "لم يُحفظ التغيير — حاول مجدداً." });
        return;
      }
      setState({ kind: "ready", flags: parseFeatureFlags(body?.data?.value ?? next) });
      setNotice({
        ok: true,
        text: `حُفظ: ${FEATURE_FLAGS[key].nameAr} ${next[key] ? "مفعَّل" : "موقوف"}. يسري على الموقع خلال دقيقة، وسُجِّل التغيير في سجل الإدارة.`,
      });
    } catch {
      setNotice({ ok: false, text: "لم يُحفظ التغيير — تحقّق من الاتصال وحاول مجدداً." });
    } finally {
      setSaving(null);
    }
  }

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-gray-200 shadow-sm"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const strong = isDark ? "text-white" : "text-gray-900";

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1200px] mx-auto pb-32" dir="rtl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-xl ${isDark ? "bg-[#0B3D2E]/20 text-[#00E5FF]" : "bg-cyan-100 text-cyan-700"}`}>
            <ToggleRight size={24} weight="duotone" />
          </div>
          <h1 className={`text-3xl font-black ${strong}`}>مفاتيح الميزات</h1>
        </div>
        <p className={`text-sm ${muted}`}>
          تشغيل ميزات المنصة وإيقافها دون تحديث للموقع. كل تغيير يُحفظ على الخادم ويسري خلال دقيقة، ويُسجَّل في سجل الإدارة.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${
            notice.ok
              ? isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : "border-emerald-100 bg-emerald-50 text-emerald-800"
              : isDark ? "border-red-500/20 bg-red-500/10 text-red-100" : "border-red-100 bg-red-50 text-red-800"
          }`}
        >
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{notice.text}</span>
        </div>
      )}

      <section className="space-y-4" aria-label="ميزات قابلة للتشغيل والإيقاف">
        {state.kind === "loading" && <p className={`text-sm ${muted}`}>جارٍ تحميل المفاتيح…</p>}
        {state.kind === "error" && (
          <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-3`}>
            <p role="alert" className={`text-sm ${isDark ? "text-red-200" : "text-red-700"}`}>{state.message}</p>
            <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white">
              إعادة المحاولة
            </button>
          </div>
        )}
        {state.kind === "ready" &&
          FEATURE_FLAG_KEYS.map((key) => {
            const def = FEATURE_FLAGS[key];
            const on = state.flags[key];
            return (
              <div key={key} className={`${card} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="min-w-0">
                  <h2 className={`font-bold ${strong}`}>{def.nameAr}</h2>
                  <p className={`text-sm mt-1 leading-relaxed ${muted}`}>{def.descriptionAr}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${def.nameAr}: ${on ? "مفعَّل" : "موقوف"}`}
                  disabled={saving !== null}
                  onClick={() => void toggle(key)}
                  className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${
                    on ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-slate-300"
                  }`}
                >
                  <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? "start-[calc(100%-26px)]" : "start-0.5"}`} />
                </button>
              </div>
            );
          })}
      </section>

      <section className="space-y-3" aria-label="إعدادات ثابتة للمرحلة التجريبية">
        <div className="flex items-center gap-2">
          <Lock size={16} className={muted} />
          <h2 className={`text-base font-black ${strong}`}>إعدادات ثابتة للمرحلة التجريبية</h2>
        </div>
        <p className={`text-xs ${muted}`}>هذان الإعدادان لا يُغيَّران من هنا؛ يتغيّران مع الإطلاق الكامل للمنصة.</p>
        {FIXED_FLAGS.map((flag) => (
          <div key={flag.id} className={`${card} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div className="min-w-0">
              <h3 className={`font-bold ${strong}`}>{flag.nameAr}</h3>
              <p className={`text-sm mt-1 leading-relaxed ${muted}`}>{flag.descriptionAr}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                FIXED_FLAG_ON[flag.id]
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : isDark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"
              }`}
            >
              <Info size={14} />
              {FIXED_FLAG_ON[flag.id] ? "مفعَّل" : "موقوف"}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
