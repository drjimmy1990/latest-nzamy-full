"use client";

import Link from "next/link";
import { useAdminToolsView } from "@/hooks/useAdminToolsView";

/**
 * N2 (batch l12): the admin sees every AI tool's screen open, a switched-off
 * one included (useToolUsable, adminAiTools.ts). One line above every /ai page
 * tells him what that does not mean: a switched-off tool does not run, and
 * costs nothing, until it is switched on for staff or for everyone.
 */
export default function AdminToolsNotice() {
  if (!useAdminToolsView().showAll) return null;
  return (
    <p
      role="note"
      dir="rtl"
      className="mx-auto mt-3 max-w-4xl rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2 text-[11.5px] leading-relaxed text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
    >
      عرض الإدارة: تظهر لك أدوات الذكاء كلها مفتوحة. الأداة المتوقفة لا تعمل ولا تُحتسب لها تكلفة حتى تُجعل «للمشرفين فقط» أو «مفعّلة» من{" "}
      <Link href="/dashboard/admin/ai-usage" className="font-bold underline">
        إعدادات أدوات الذكاء
      </Link>
      .
    </p>
  );
}
