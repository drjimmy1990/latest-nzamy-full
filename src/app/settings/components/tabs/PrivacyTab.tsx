"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, WarningCircle, ArrowSquareOut, Headset } from "@phosphor-icons/react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { SectionTitle, ToggleRow, LocalActionStatus, EmptyPanel } from "./_shared";
import {
  getPrivacyToggles,
  readPrivacyStates,
  PRIVACY_DEFAULT_STATES,
  type PrivacyToggleKey,
} from "./_privacyFields";

// ── Persistence ───────────────────────────────────────────────────────
//
// The 200 body of GET/PUT /api/v1/settings, in the four columns this tab
// reads and writes. Every toggle this tab shows maps 1:1 to one of these —
// there is no per-role toggle (show_profile, pdpl_consent as its own key,
// strict_data, …) left rendering from a literal `defaultOn` with nothing
// behind it. See _privacyFields.ts.
type PrivacySettingsEnvelope = {
  settings: {
    data_sharing_consent?: boolean | null;
    analytics_consent?: boolean | null;
    marketing_emails?: boolean | null;
    newsletter?: boolean | null;
  } | null;
};

const GENERIC_SETTINGS_ERROR = "تعذّر حفظ إعدادات الخصوصية. تحقق من اتصالك وحاول مرة أخرى.";

function arabicSettingsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] privacy settings request failed:", raw);
  return /[؀-ۿ]/.test(raw) ? raw : GENERIC_SETTINGS_ERROR;
}

// ── Component ─────────────────────────────────────────────────────────
export function PrivacyTab() {
  const { userType, loading } = useUser();
  const toggleDefs = getPrivacyToggles(userType);

  const [states, setStates] = useState<Record<PrivacyToggleKey, boolean>>(PRIVACY_DEFAULT_STATES);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load the saved consents once. Every toggle starts `false` (see
   * PRIVACY_DEFAULT_STATES) and stays that way until the server answers —
   * the corporate/ngo PDPL switch in particular must never read as consented
   * before it has actually loaded.
   */
  useEffect(() => {
    if (loading) return;

    if (!isSupabaseMode) {
      setStates(PRIVACY_DEFAULT_STATES);
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<PrivacySettingsEnvelope>("/api/v1/settings");
        if (cancelled) return;
        setStates(readPrivacyStates(res.settings));
      } catch (err) {
        if (cancelled) return;
        // A failed load must block saving, not just show defaults — saving
        // from an unknown state would write `false` over a stored `true`
        // consent.
        setLoadError(true);
        setError(arabicSettingsError(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading]);

  const toggle = (key: PrivacyToggleKey) => setStates((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    if (!isSupabaseMode) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return;
    }
    if (loadError) {
      setError("تعذّر تحميل الإعدادات الحالية — أعد تحميل الصفحة قبل الحفظ.");
      return;
    }

    setSaving(true);
    try {
      await apiMutate<PrivacySettingsEnvelope>("/api/v1/settings", "PUT", { ...states });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(arabicSettingsError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Privacy toggles */}
      <div>
        <SectionTitle>إعدادات الخصوصية والمشاركة</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] px-5 divide-y divide-gray-100 dark:divide-white/[0.04]">
          {toggleDefs.map((t) => (
            <ToggleRow
              key={t.key}
              label={t.label}
              description={t.description}
              checked={states[t.key]}
              onChange={() => toggle(t.key)}
            />
          ))}
        </div>
      </div>

      {/* PDPL rights — only what this page can actually do. There is no data
          export or deletion-request endpoint on the platform yet, so those
          two actions point at support instead of pretending to run. */}
      <div>
        <SectionTitle>حقوق البيانات (نظام PDPL)</SectionTitle>
        <EmptyPanel
          title="تحميل البيانات وطلب الحذف يحتاجان تواصلاً مع الدعم"
          description="لا تتوفر أداة ذاتية لتصدير بياناتك أو حذفها من هذه الصفحة حالياً. لأي طلب من هذا النوع تواصل مع فريق الدعم."
        />
        <div className="mt-3 flex flex-wrap gap-4">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-xs font-semibold text-royal dark:text-emerald-400 hover:underline"
          >
            <Headset size={14} />
            التواصل مع الدعم
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 text-xs font-semibold text-royal dark:text-emerald-400 hover:underline"
          >
            <ArrowSquareOut size={14} className="rtl:rotate-180" />
            سياسة الخصوصية
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <WarningCircle size={15} weight="fill" />
          {error}
        </div>
      )}
      <LocalActionStatus
        show={saved && !isSupabaseMode}
        message="تم تطبيق التفضيلات في هذا المتصفح فقط — لا يوجد حساب محفوظ في وضع العرض."
      />

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        disabled={saving || !ready}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)] disabled:opacity-70"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : saved ? (
          <CheckCircle size={18} weight="fill" />
        ) : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ إعدادات الخصوصية"}
      </motion.button>
    </div>
  );
}
