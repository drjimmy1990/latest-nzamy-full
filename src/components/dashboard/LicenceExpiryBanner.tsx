"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { licenceBannerFromReply, type LicenceExpiryBannerReply } from "@/lib/licence/licenceExpiry";

/**
 * Owner ٢٤١ (batch l19): «تنبيه: رخصتك المهنية تنتهي خلال X يومًا / انتهت —
 * يرجى رفع تجديد الرخصة حتى تستطيع الاستمرار في استخدام المنصة», on the
 * lawyer, firm and provider dashboards and in Settings. Read from
 * GET /api/v1/me/licence-expiry; shows nothing while loading, after a failed
 * read, or when the caller's licence is more than 30 days away. It never
 * blocks anything: the account pays and works normally (licenceGate.ts).
 */
export default function LicenceExpiryBanner({ className = "" }: { className?: string }) {
  const [alert, setAlert] = useState<LicenceExpiryBannerReply["alert"]>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/me/licence-expiry", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (alive) setAlert(licenceBannerFromReply(b));
      })
      .catch(() => {
        if (alive) setAlert(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!alert) return null;
  const past = alert.stage === "0d";
  const tone = past
    ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200"
    : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  return (
    <div role="alert" dir="rtl" className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 ${tone} ${className}`}>
      <WarningCircle size={22} weight="fill" className={`mt-0.5 shrink-0 ${past ? "text-rose-500" : "text-amber-500"}`} />
      <div className="space-y-1">
        <p className="text-[13px] font-bold">{alert.title}</p>
        <p className="text-[12px] leading-6">{alert.body}</p>
        <Link href={alert.href} className="inline-block text-[12px] font-bold underline underline-offset-4">
          {alert.hrefLabel}
        </Link>
      </div>
    </div>
  );
}
