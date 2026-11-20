"use client";

/**
 * SessionIdleGuard — T5 (batch l11-sec): the warning before an idle sign-out.
 * Mounted once in the root layout; it does nothing for a guest, in demo mode,
 * or when the user has not chosen a session timeout (src/lib/auth/idleSignOut.ts).
 */
import { useUser } from "@/hooks/useUser";
import { useSessionIdleGuard } from "@/hooks/useSessionIdleGuard";
import { useTheme } from "@/components/ThemeProvider";

function arabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

export default function SessionIdleGuard() {
  const user = useUser();
  const { lang } = useTheme();
  const isAr = lang !== "en";
  const signedIn = !user.loading && user.isLoggedIn && !user.isDemoBypass;
  const { warning, secondsLeft, stayActive, signOutNow } = useSessionIdleGuard(signedIn);

  if (!warning) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/30 p-4 sm:items-center" dir={isAr ? "rtl" : "ltr"}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-guard-title"
        aria-describedby="idle-guard-body"
        className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-white/[0.08] dark:bg-dark-card"
      >
        <h2 id="idle-guard-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          {isAr ? "هل ما زلت هنا؟" : "Are you still there?"}
        </h2>
        <p id="idle-guard-body" className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {isAr
            ? `لم نرصد نشاطًا منذ مدة، وسنُخرجك من حسابك بعد ${arabicDigits(secondsLeft)} ثانية حمايةً له، وفق مهلة الجلسة التي اخترتها في الإعدادات.`
            : `We have not seen any activity for a while. You will be signed out in ${secondsLeft} seconds, as set in your session timeout.`}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={stayActive}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {isAr ? "متابعة الجلسة" : "Stay signed in"}
          </button>
          <button
            type="button"
            onClick={signOutNow}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-zinc-700 hover:bg-gray-50 dark:border-white/[0.1] dark:text-zinc-200 dark:hover:bg-white/[0.04]"
          >
            {isAr ? "تسجيل الخروج الآن" : "Sign out now"}
          </button>
        </div>
      </div>
    </div>
  );
}
