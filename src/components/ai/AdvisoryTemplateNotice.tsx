"use client";

import Link from "next/link";
import { Info, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { resolveAdvisoryHandoff } from "./advisoryHandoff";

/**
 * Owner item ١٨ / س٣ — how the instant tools describe themselves.
 *
 * His ruling, verbatim: «تصنيفها للمستخدم كـ «نماذج وقوالب استرشادية فورية»،
 * مع إبراز زر المسار البشري المباشر: «طلب التدقيق والاعتماد من محامي المكتب»».
 *
 * Rendered at the TOP of the tool rather than under its output. The point of
 * the relabelling is that the reader knows what they are getting BEFORE they
 * act on it; a note that only appears after the document is generated arrives
 * after the decision it was meant to inform. It also cannot then be missed by
 * a reader who copies the output and leaves.
 *
 * Deliberately NOT amber/red. This is not a warning that something is broken
 * — the templates are useful and the office stands behind them as templates.
 * A red banner over every instant tool would teach users to scroll past the
 * one place the human path is offered.
 */
export default function AdvisoryTemplateNotice({
  handoffServiceId,
  className = "",
}: {
  /** A `serviceId` from CLIENT_SERVICE_CATALOG — the human service this tool hands off to. */
  handoffServiceId: string;
  className?: string;
}) {
  const { isDark } = useTheme();
  const handoff = resolveAdvisoryHandoff(handoffServiceId);

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
        isDark
          ? "border-white/[0.08] bg-white/[0.03]"
          : "border-zinc-200 bg-zinc-50"
      } ${className}`}
      dir="rtl"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Info
          size={18}
          weight="fill"
          className={`mt-0.5 shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
        />
        <div className="min-w-0">
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
            نماذج وقوالب استرشادية فورية
          </p>
          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            المخرج هنا نموذج استرشادي يُنتج فوراً ولم يراجعه محامٍ بعد. لاعتماده
            للاستخدام الرسمي اطلب تدقيق محامي المكتب.
          </p>
        </div>
      </div>

      <Link
        href={handoff.href}
        className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#155e41]"
      >
        طلب التدقيق والاعتماد من محامي المكتب
        <ArrowLeft size={13} weight="bold" />
      </Link>
    </div>
  );
}
