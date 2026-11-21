"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { logout } from "@/hooks/useUser";
import { BACKEND_MODE } from "@/lib/runtimeMode";
import { isTermsGateExemptPath } from "@/lib/legal/termsGatePaths";
import { fetchTermsStatus, recordTermsAcceptance } from "@/lib/legal/termsAcceptanceClient";
import TermsConsentCheckbox from "@/components/legal/TermsConsentCheckbox";

/**
 * The re-ask after a terms change (R7, owner package 2026-11-17, file 11
 * part «ب»: «عند تعديل الشروط: يُطلب إقرار جديد عند أول دخول»).
 *
 * Mounted once per signed-in shell (dashboard/layout.tsx, settings/layout.tsx,
 * ai/layout.tsx). On mount it asks GET /api/v1/legal/terms-acceptance; only a
 * definite `acceptedCurrent: false` opens the modal. Anything else — signed
 * out, frozen account, demo mode, the migration not run yet, a server error —
 * shows nothing: the gate fails open rather than lock everyone out.
 *
 * Never opens on /terms, /privacy, /onboarding or the auth screens
 * (termsGatePaths.ts). The links inside open in a new tab, and «تسجيل الخروج»
 * is in the modal itself, so the person is never trapped behind it.
 * An account with no row at all (every account created before this shipped)
 * is asked once, the same way.
 */
export default function TermsReacceptGate() {
  const pathname = usePathname();
  const { lang } = useTheme();
  const isAr = lang !== "en";
  const exempt = BACKEND_MODE !== "supabase" || isTermsGateExemptPath(pathname);

  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exempt) return;
    let cancelled = false;
    fetchTermsStatus().then((status) => {
      if (!cancelled && status.kind === "needs_acceptance") setOpen(true);
    });
    return () => { cancelled = true; };
  }, [exempt]);

  if (exempt || !open) return null;

  const accept = async () => {
    if (!ticked || saving) return;
    setSaving(true);
    setError(null);
    const result = await recordTermsAcceptance("relogin");
    setSaving(false);
    if (result.ok) {
      setOpen(false);
      return;
    }
    setError(
      result.error ??
        (isAr ? "تعذّر حفظ موافقتك الآن. أعد المحاولة بعد قليل." : "Could not save your acceptance. Please try again shortly."),
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-reaccept-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-dark-card"
      >
        <h2 id="terms-reaccept-title" className="font-brand text-xl font-bold text-ink dark:text-white">
          {isAr ? "الشروط والأحكام المحدَّثة" : "Updated Terms & Conditions"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted dark:text-gray-300">
          {isAr
            ? "حُدِّثت الشروط والأحكام: النقطة = ريال سعودي واحد قبل ضريبة القيمة المضافة، وأقل شحنة للفرد ١٠٠ نقطة ولغيره ٥٠٠ نقطة، وشحنة النقاط تُسترد خلال ١٤ يوماً ما دام لم يُصرف شيء من نقاطها، ولا يجتمع خصم المؤسس مع النقاط الإضافية على الشحنة نفسها، والمنصة في سوق الطلبات وسيط لا ضامن ولا أمين على الأتعاب. للمتابعة في استخدام المنصة، اقرأها ثم أقرّ بها."
            : "The Terms & Conditions have been updated: one point equals one Saudi riyal before VAT; the smallest top-up is 100 points for individuals and 500 points for every other account; a top-up is refundable within 14 days while none of its points has been spent; the founder discount does not stack with a top-up's bonus points; and in the requests market the platform is an intermediary, not a guarantor or trustee of fees. To keep using the platform, please read them and confirm."}
        </p>

        <div className="mt-5">
          <TermsConsentCheckbox
            id="terms-reaccept-consent"
            checked={ticked}
            onChange={setTicked}
            isAr={isAr}
            disabled={saving}
          />
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={accept}
            disabled={!ticked || saving}
            className="flex-1 rounded-xl bg-royal py-3 text-sm font-semibold text-white transition-all hover:bg-royal-light disabled:opacity-40"
          >
            {saving ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "موافق" : "I agree"}
          </button>
          <button
            type="button"
            onClick={() => logout("/")}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:border-white/10 dark:text-rose-400 dark:hover:bg-rose-500/[0.08]"
          >
            {isAr ? "تسجيل الخروج" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
