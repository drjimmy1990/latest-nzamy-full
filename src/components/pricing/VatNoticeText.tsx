"use client";

import { useVatRegistered } from "@/hooks/useVatRegistered";
import { vatNoticeText } from "@/lib/pricing/vatNotice";

/**
 * VatNoticeText — the VAT sentence under a price (batch l16, A-01): «غير
 * شاملة لضريبة القيمة المضافة ١٥٪ …» once the platform's VAT number is
 * saved, «لا تُضاف ضريبة القيمة المضافة قبل إدخال الرقم الضريبي» before it,
 * and nothing until the server has answered.
 */
export function VatNoticeText({ lang = "ar", className }: { lang?: "ar" | "en"; className?: string }) {
  const notice = vatNoticeText(useVatRegistered());
  if (!notice) return null;
  return <span className={className}>{lang === "en" ? notice.en : notice.ar}</span>;
}
