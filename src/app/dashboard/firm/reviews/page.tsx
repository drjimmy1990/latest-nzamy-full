"use client";

/**
 * «تقييمات المكتب» — /dashboard/firm/reviews.
 *
 * Owner decision ٢٠: «تقييمات المكاتب لا تُعرض علناً إلا بموافقة مدير المكتب
 * (Opt-in) للحفاظ على سمعة الشركاء أثناء فترة الإطلاق التجريبي.»
 *
 * WHAT WAS HERE: MOCK_REVIEWS, four invented reviews («شركة الأفق الحديثة»,
 * «أحمد عبدالله», «مؤسسة الرواد», «عميل غير معروف») with case references,
 * dates and a firm reply; an average and a rating distribution computed from
 * them; a reply box that wrote to component state; an «تصدير التقرير» button
 * with no handler.
 *
 * WHAT IT IS NOW:
 *   • the manager's switch — `firm_profiles.public_reviews` (20261017_31),
 *     default OFF, through /api/v1/firm/reviews-visibility. The database
 *     enforces it: a restrictive SELECT policy keeps a firm's reviews from
 *     guests and other accounts until it is on;
 *   • the firm's real reviews and its one-time replies — the same
 *     `ReviewsPanel` the lawyer's profile uses, over /api/v1/reviews/mine and
 *     /api/v1/reviews/[id]/response (both already admit a firm account).
 *
 * BETA_MONOPOLY_MODE parks the public directory, so «علني» today means «ready
 * for the public firm profile», which no visitor can open yet. The copy says so.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star, Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import ReviewsPanel from "@/app/dashboard/lawyer/_components/profile/ReviewsPanel";
import {
  getFirmReviewVisibility,
  setFirmReviewVisibility,
  type FirmReviewVisibility,
} from "@/lib/services/reviewsService";
import { isSupabaseMode } from "@/lib/services/api";

type VisibilityLoad =
  | { state: "loading" }
  | { state: "ok"; value: FirmReviewVisibility }
  | { state: "failed"; message: string };

function arabicOr(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  return /[؀-ۿ]/.test(msg) ? msg : fallback;
}

export default function FirmReviewsPage() {
  const { isDark } = useTheme();
  const [vis, setVis] = useState<VisibilityLoad>(() =>
    isSupabaseMode ? { state: "loading" } : { state: "failed", message: "إعداد ظهور التقييمات غير متاح في وضع العرض التجريبي." },
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    getFirmReviewVisibility()
      .then((value) => { if (!cancelled) setVis({ state: "ok", value }); })
      .catch((err) => { if (!cancelled) setVis({ state: "failed", message: arabicOr(err, "تعذّر قراءة إعداد ظهور التقييمات.") }); });
    return () => { cancelled = true; };
  }, []);

  const toggle = async (next: boolean) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const value = await setFirmReviewVisibility(next);
      setVis({ state: "ok", value });
    } catch (err) {
      setSaveError(arabicOr(err, "تعذّر حفظ إعداد ظهور التقييمات."));
    } finally {
      setSaving(false);
    }
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-white" : "text-slate-800";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${strong}`} style={{ fontFamily: "var(--font-brand)" }}>
          <Star className="text-amber-500" weight="fill" />
          تقييمات المكتب
        </h1>
        <p className={`text-[13px] ${muted}`}>
          تقييمات عملاء المكتب على طلباتهم المكتملة، والرد عليها، وقرار عرضها علناً.
        </p>
      </motion.div>

      {/* The opt-in */}
      <div className={`${card} p-5`}>
        {vis.state === "loading" && (
          <div className="py-4 text-center">
            <div className="inline-block w-6 h-6 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
          </div>
        )}
        {vis.state === "failed" && (
          <p className="flex items-center gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
            <Warning size={15} /> {vis.message}
          </p>
        )}
        {vis.state === "ok" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                vis.value.publicReviews ? "bg-emerald-500/10 text-emerald-600" : isDark ? "bg-white/[0.05] text-zinc-400" : "bg-slate-100 text-slate-500"
              }`}>
                {vis.value.publicReviews ? <Eye size={20} weight="duotone" /> : <EyeSlash size={20} weight="duotone" />}
              </div>
              <div>
                <p className={`text-[14px] font-bold ${strong}`}>
                  {vis.value.publicReviews ? "تقييمات المكتب معروضة علناً" : "تقييمات المكتب غير معروضة علناً"}
                </p>
                <p className={`text-[12px] mt-1 leading-6 ${muted}`}>
                  {vis.value.publicReviews
                    ? "سمحتَ بعرض تقييمات المكتب في ملفه العام. يمكنك إيقاف العرض في أي وقت، فتختفي التقييمات ومتوسطها عن الزوار فوراً."
                    : "لا يرى تقييمات المكتب إلا المكتب نفسه وكاتب كل تقييم. لا تُعرض في الملف العام إلا إذا وافقتَ على عرضها."}
                </p>
                <p className={`text-[11px] mt-1 ${muted}`}>
                  دليل المكاتب العام غير مفتوح للزوار خلال المرحلة التجريبية؛ هذا الإعداد يحدد ما يُعرض عند فتحه.
                </p>
              </div>
            </div>
            <button
              onClick={() => void toggle(!vis.value.publicReviews)}
              disabled={saving}
              className={`self-start sm:self-center shrink-0 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                vis.value.publicReviews
                  ? isDark ? "border border-white/[0.1] text-zinc-200 hover:bg-white/[0.05]" : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "bg-[#0B3D2E] text-white hover:bg-[#0d5238]"
              }`}
            >
              {saving ? "جاري الحفظ..." : vis.value.publicReviews ? "إيقاف العرض العلني" : "السماح بالعرض العلني"}
            </button>
          </div>
        )}
        {saveError && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-rose-500">
            <Warning size={13} /> {saveError}
          </p>
        )}
      </div>

      {/* The firm's real reviews and its replies */}
      <ReviewsPanel isDark={isDark} />
    </div>
  );
}
