"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearTopUpReturn, readTopUpReturn } from "@/lib/payments/topUpDraft";

/**
 * TopUpReturnLink — l6-pay (TopUpModal): on a confirmed payment, «العودة إلى
 * الأداة» when the payment was started from a tool's in-place top-up modal
 * (TopUpModalHost kept the tool's path; readTopUpReturn accepts a relative
 * /ai/… path only). Renders nothing otherwise, or when storage is blocked.
 */
export default function TopUpReturnLink({ className }: { className?: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    setHref(readTopUpReturn(storage));
  }, []);

  if (!href) return null;
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        try {
          clearTopUpReturn(window.sessionStorage);
        } catch {
          // nothing kept
        }
      }}
    >
      العودة إلى الأداة — ما كتبته محفوظ
    </Link>
  );
}
