"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WarningOctagon } from "@phosphor-icons/react";
import {
  ADMIN_MFA_OFF_BODY_AR,
  ADMIN_MFA_OFF_TITLE_AR,
  ADMIN_MFA_PAGE_HREF,
  adminMfaOffBannerShown,
} from "@/lib/auth/adminMfaBanner";

/**
 * Batch l14: a clear banner while two-step sign-in is not enforced for the
 * admin accounts (ADMIN_MFA_ENFORCE is not "required" on the server). Read
 * from GET /api/v1/auth/mfa/status; shows nothing while loading, on a failed
 * read, or once enforcement is on. The admin console is dark-only.
 */
export default function AdminMfaOffBanner({ showLink = true }: { showLink?: boolean }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/auth/mfa/status", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (alive) setShown(adminMfaOffBannerShown(b));
      })
      .catch(() => {
        if (alive) setShown(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!shown) return null;
  return (
    <div
      role="alert"
      dir="rtl"
      className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200"
    >
      <WarningOctagon size={22} weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
      <div className="space-y-1">
        <p className="text-[13px] font-bold text-amber-100">{ADMIN_MFA_OFF_TITLE_AR}</p>
        <p className="text-[12px] leading-6">{ADMIN_MFA_OFF_BODY_AR}</p>
        {showLink && (
          <Link href={ADMIN_MFA_PAGE_HREF} className="inline-block text-[12px] font-bold text-amber-100 underline underline-offset-4">
            التحقق بخطوتين لحسابك
          </Link>
        )}
      </div>
    </div>
  );
}
