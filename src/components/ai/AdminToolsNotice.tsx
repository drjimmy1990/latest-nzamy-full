"use client";

import Link from "next/link";
import { useAdminToolsView } from "@/hooks/useAdminToolsView";

/**
 * N2 (batch l12): the admin sees every AI tool's screen open, a switched-off
 * one included (useToolUsable, adminAiTools.ts). Owner ١٥٦ (أ), batch l13: it
 * also RUNS for him — no points are taken from his account, but each run calls
 * the model (a real provider cost) and is logged with its tokens on the AI
 * usage page. One line above every /ai page says so.
 */
export default function AdminToolsNotice() {
  if (!useAdminToolsView().showAll) return null;
  return (
    <p
      role="note"
      dir="rtl"
      className="mx-auto mt-3 max-w-4xl rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2 text-[11.5px] leading-relaxed text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
    >
      عرض الإدارة: أدوات الذكاء كلها تعمل لك فعلاً، حتى المتوقفة للمستخدمين، ولا تُخصم من حسابك نقاط. لكن كل تشغيل يستهلك تكلفة حقيقية لدى مزوّد الذكاء، ويُسجَّل مع تكلفته في{" "}
      <Link href="/dashboard/admin/ai-usage" className="font-bold underline">
        صفحة تشغيلات الذكاء
      </Link>
      .
    </p>
  );
}
