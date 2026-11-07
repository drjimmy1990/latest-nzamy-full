"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "framer-motion";
import { ShieldWarning, ArrowRight, WhatsappLogo, Info } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { buildWhatsAppHref } from "@/components/floating/whatsappWorkflow";
import { LOCK_DIALOG_TITLE_AR, libraryLockDialogTextAr, type ReaderLock } from "@/lib/library/readerRefusal";
import type { LibraryReadQuota } from "@/hooks/useLibraryStatus";

/**
 * LibrarySecurityLockNotice — owner note ١٣ C09, worded by the owner's
 * decision of 2026-11-07 («نافذة إيقاف التصفح السريع للمكتبة»). Shown by
 * LibraryGuard across the legal library when THIS user's library reading is
 * locked (public.library_security_locks, 20261030_80), and by the law reader
 * when a document fetch answers 423 (a lock that started while reading).
 *
 * The text is the owner's: «تم تعليق التصفح مؤقتاً لتجاوز معدل القراءة السريع —
 * ينتهي التعليق تلقائياً خلال [X] ساعة، أو يمكنك التواصل الفوري مع الدعم الفني
 * للمراجعة الفورية». X is computed on the client from `lockedUntil`
 * (readerRefusal.ts) and refreshed every minute; a lock with no end (an admin
 * lock until lifted) drops the «ينتهي تلقائياً» clause rather than promise one.
 * The Riyadh end time stays as a secondary line, and the account is still said
 * to be untouched (this is not the account freeze of /account-frozen).
 *
 * «تواصل مع الدعم الفني» opens WhatsApp — the platform's one instant channel
 * (NZAMY_WHATSAPP_NUMBER) — with the SEC- reference only; the contact page
 * stays as a second way.
 */
export default function LibrarySecurityLockNotice({ lock }: { lock: ReaderLock }) {
  const { isDark } = useTheme();
  const titleId = useId();
  const bodyId = useId();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";
  const until = formatRiyadh(lock.lockedUntil);
  const whatsappHref = buildWhatsAppHref(
    lock.reference
      ? `مرحباً فريق نظامي، تم تعليق تصفحي للمكتبة القانونية (رقم المرجع: ${lock.reference}). أرجو المراجعة.`
      : "مرحباً فريق نظامي، تم تعليق تصفحي للمكتبة القانونية. أرجو المراجعة.",
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16" dir="rtl">
      <motion.div
        role="alertdialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className={`w-full max-w-lg rounded-3xl p-6 text-center shadow-2xl ${
          isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"
        }`}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-[#C8A762]/10">
          <ShieldWarning size={34} weight="duotone" className="text-[#C8A762]" />
        </div>

        <h1 id={titleId} className={`text-xl font-bold mb-3 ${tp}`}>{LOCK_DIALOG_TITLE_AR}</h1>
        <p id={bodyId} className={`text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {libraryLockDialogTextAr(lock.lockedUntil, now)}
        </p>

        {until && <p className={`mt-3 text-xs ${ts}`}>موعد انتهاء التعليق: {until} (بتوقيت الرياض).</p>}
        {lock.reference && (
          <p className={`mt-2 text-xs ${ts}`}>
            رقم المرجع:{" "}
            <span dir="ltr" className={`font-mono font-bold select-all ${tp}`}>
              #{lock.reference}
            </span>
          </p>
        )}
        <p className={`mt-2 text-xs ${ts}`}>حسابك وبقية خدمات المنصة تعمل كالمعتاد.</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#C8A762] px-5 py-2.5 text-sm font-bold text-zinc-950 transition-all hover:bg-[#d8b873]"
          >
            <WhatsappLogo size={16} weight="bold" />
            تواصل مع الدعم الفني
          </a>
          <Link
            href="/"
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              isDark ? "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <ArrowRight size={16} weight="bold" />
            العودة للرئيسية
          </Link>
        </div>
        <p className={`mt-4 text-xs ${ts}`}>
          أو راسلنا من صفحة{" "}
          <Link href={lock.support} className="font-bold underline">
            «تواصل معنا»
          </Link>
          {lock.reference ? " واذكر رقم المرجع." : "."}
        </p>
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
