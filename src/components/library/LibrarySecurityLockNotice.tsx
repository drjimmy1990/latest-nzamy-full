"use client";

import { motion } from "framer-motion";
import { ShieldWarning, ArrowRight, ChatCircleText, Info } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import type { LibrarySecurityLock, LibraryReadQuota } from "@/hooks/useLibraryStatus";

/**
 * LibrarySecurityLockNotice — owner note ١٣ C09. Shown by LibraryGuard across
 * the legal library when THIS user's library reading is locked
 * (public.library_security_locks, 20261030_80): after a clear overshoot of
 * the daily document quota, or by an admin.
 *
 * Honest by design: it says reading is stopped, that the account and the rest
 * of the platform are untouched (this is not the account freeze of
 * /account-frozen), gives the SEC- reference and the way to support. It never
 * accuses the reader of anything and never promises when it will be lifted.
 */
export default function LibrarySecurityLockNotice({ lock }: { lock: LibrarySecurityLock }) {
  const { isDark } = useTheme();
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";
  const until = formatRiyadh(lock.lockedUntil);

  return (
    <div className="max-w-2xl mx-auto py-20 px-4 text-center" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-[#C8A762]/10">
          <ShieldWarning size={40} weight="duotone" className="text-[#C8A762]" />
        </div>

        <h1 className={`text-2xl font-bold mb-3 ${tp}`}>القراءة في المكتبة موقوفة لحسابك</h1>
        <p className={`text-sm leading-relaxed ${ts}`}>{lock.message}</p>

        {lock.reference && (
          <p className={`mt-5 text-sm ${tp}`}>
            رقم المرجع:{" "}
            <span dir="ltr" className="font-mono font-bold select-all">
              #{lock.reference}
            </span>
          </p>
        )}
        {until && <p className={`mt-2 text-xs ${ts}`}>ينتهي الإيقاف تلقائياً في {until} (بتوقيت الرياض).</p>}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={lock.support}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C8A762] px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-[#d8b873]"
          >
            <ChatCircleText size={16} weight="bold" />
            تواصل مع الدعم
          </Link>
          <Link
            href="/"
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              isDark ? "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <ArrowRight size={16} weight="bold" />
            العودة للرئيسية
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * The daily cap (owner note ١٣ C07): a banner above the library page, not a
 * block — the documents opened today keep opening.
 */
export function LibraryDailyLimitBanner({ quota }: { quota: LibraryReadQuota }) {
  const { isDark } = useTheme();
  return (
    <div
      dir="rtl"
      role="status"
      className={`mx-auto mt-3 flex max-w-5xl items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <Info size={18} weight="bold" className="mt-0.5 shrink-0" />
      <p className="leading-relaxed">
        بلغت الحد اليومي لفتح الوثائق ({quota.dailyLimit} وثيقة مختلفة في اليوم). الوثائق التي فتحتها اليوم تبقى
        متاحة لك، ويتجدد الحد عند منتصف الليل بتوقيت الرياض. إن كان عملك يحتاج أكثر من ذلك فتواصل مع{" "}
        <Link href="/contact" className="font-bold underline">
          الدعم
        </Link>
        .
      </p>
    </div>
  );
}

function formatRiyadh(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return at.toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Riyadh",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}
