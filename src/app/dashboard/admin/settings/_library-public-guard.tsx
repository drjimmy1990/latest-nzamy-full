"use client";

import { useEffect, useState } from "react";
import {
  LIBRARY_PUBLIC_PROTECTION_FIELDS,
  parseFeqhFreePages,
  parseLibraryPublicProtection,
  parsePublicRulings,
  type LibraryPublicProtection,
  type PublicRulingsSetting,
} from "@/lib/library/publicGuard";

/**
 * «حماية المكتبة العامة» on the admin settings page (owner message 18 Nov,
 * items 2 and 7; batch l8-libguard). Three platform_settings keys, each saved
 * through PATCH /api/v1/admin/settings (validated there, audited there):
 *   library_public_protection, public_full_rulings_per_collection,
 *   library_feqh_free_pages.
 * The daily full-text limit (daily_full_read_limit, 50) lives on the
 * «نشاط المكتبة» page with the other reader caps — said here in one line.
 */
export function LibraryPublicGuardSettings({ isDark }: { isDark: boolean }) {
  const [protection, setProtection] = useState<LibraryPublicProtection>(parseLibraryPublicProtection(null));
  const [rulings, setRulings] = useState<PublicRulingsSetting>(parsePublicRulings(null));
  const [feqhPages, setFeqhPages] = useState<number>(parseFeqhFreePages(null));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const data = (body?.data ?? {}) as Record<string, unknown>;
        if (cancelled) return;
        setProtection(parseLibraryPublicProtection(data.library_public_protection));
        setRulings(parsePublicRulings(data.public_full_rulings_per_collection));
        setFeqhPages(parseFeqhFreePages(data.library_feqh_free_pages));
      })
      .catch(() => {
        /* the defaults stay on screen */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(key: string, value: unknown): Promise<string | null> {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ. حاول مرة أخرى.";
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const protectionJson: Record<string, number> = {};
      for (const f of LIBRARY_PUBLIC_PROTECTION_FIELDS) protectionJson[f.json] = protection[f.key];
      const errors = [
        await patch("library_public_protection", protectionJson),
        await patch("public_full_rulings_per_collection", { full: rulings.full, excerpt_chars: rulings.excerptChars }),
        await patch("library_feqh_free_pages", { pages: feqhPages }),
      ].filter((e): e is string => e !== null);
      setStatus(errors.length ? { ok: false, text: errors.join(" — ") } : { ok: true, text: "حُفظت إعدادات حماية المكتبة. تسري خلال دقيقة." });
    } catch {
      setStatus({ ok: false, text: "تعذّر الحفظ. حاول مرة أخرى." });
    } finally {
      setSaving(false);
    }
  }

  const label = `text-xs font-bold block mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`;
  const input = `w-full rounded-xl border px-3 py-2 text-sm font-mono ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

  return (
    <div dir="rtl">
      <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>حماية المكتبة العامة</h3>
      <p className={`text-xs mb-4 ${muted}`}>
        حدود التصفح للزائر والجلسة، والتحقق البشري (Turnstile) بعد العتبة، وعمق التصفح لغير المشترك، وما يُعرض مجاناً من الأحكام والفقه.
        حد القراءة اليومي للنص الكامل (daily_full_read_limit) في صفحة «نشاط المكتبة».
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {LIBRARY_PUBLIC_PROTECTION_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className={label}>{f.labelAr}</span>
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={Number.isFinite(protection[f.key]) ? protection[f.key] : ""}
              onChange={(e) => setProtection({ ...protection, [f.key]: num(e.target.value) })}
              className={input}
            />
          </label>
        ))}
        <label className="block">
          <span className={label}>الأحكام الكاملة المجانية لكل مجموعة (public_full_rulings_per_collection)</span>
          <input type="number" min={0} max={20} value={Number.isFinite(rulings.full) ? rulings.full : ""} onChange={(e) => setRulings({ ...rulings, full: num(e.target.value) })} className={input} />
        </label>
        <label className="block">
          <span className={label}>طول مقتطف الحكم لغير المشترك (حرفاً — نحو سطر ونصف)</span>
          <input type="number" min={60} max={600} value={Number.isFinite(rulings.excerptChars) ? rulings.excerptChars : ""} onChange={(e) => setRulings({ ...rulings, excerptChars: num(e.target.value) })} className={input} />
        </label>
        <label className="block">
          <span className={label}>صفحات الفقه المجانية لغير المشترك (٠ = للمشتركين فقط)</span>
          <input type="number" min={0} max={20} value={Number.isFinite(feqhPages) ? feqhPages : ""} onChange={(e) => setFeqhPages(num(e.target.value))} className={input} />
        </label>
      </div>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`mt-3 text-xs font-bold ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {status.text}
        </p>
      )}
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}
