"use client";

import Link from "next/link";
import { BookOpen, Star, Handshake, Storefront, LockSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { CONSULTANT_RESERVED_MESSAGE } from "@/lib/auth/practiceKind";

/**
 * The independent legal consultant's home (owner decision, 22–23 Nov 2026): the
 * library and what hangs off it, in place of the lawyer's dashboard. The lawyer's
 * working tools open to a consultant only through a lawyer or a firm that
 * delegates them (a later phase), hence the invitation to join one.
 */
export default function ConsultantHome() {
  const { isDark } = useTheme();
  const { name } = useUser();
  const card = isDark ? "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]" : "border-slate-200 bg-white hover:bg-slate-50";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const accent = isDark ? "text-[#C8A762]" : "text-[#0B3D2E]";

  const tiles = [
    { href: "/laws", title: "المكتبة القانونية", text: "الأنظمة واللوائح والمبادئ القضائية والأحكام، مع مساعد المكتبة.", Icon: BookOpen },
    { href: "/laws/my", title: "مكتبتي", text: "ما حفظته وعلّمت عليه من مواد وأحكام.", Icon: Star },
    { href: "/marketplace", title: "السوق", text: "تصفّح الخدمات واطلب خدمة قانونية بصفتك عميلاً.", Icon: Storefront },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      <header>
        <h1 className={`text-xl font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>
          {name ? `أهلاً ${name}` : "أهلاً بك"} — لوحة المستشار القانوني
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>حسابك مخصّص للمكتبة القانونية.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map(({ href, title, text, Icon }) => (
          <Link key={href} href={href} className={`rounded-2xl border p-4 transition-colors ${card}`}>
            <Icon size={26} weight="duotone" className={accent} />
            <h2 className={`mt-3 text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{title}</h2>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{text}</p>
          </Link>
        ))}
      </div>

      <section className={`rounded-2xl border p-5 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/[0.05]" : "border-[#0B3D2E]/15 bg-[#0B3D2E]/[0.04]"}`}>
        <div className="flex items-start gap-3">
          <Handshake size={28} weight="duotone" className={accent} />
          <div className="flex-1">
            <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>انضم إلى مكتب أو محامٍ سعودي لتفعيل أدوات أكثر</h2>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
              الصائغ القانوني ومحترف العقود والرأي القانوني وبقية أدوات العمل مقصورة على المحامي السعودي المرخّص،
              وتُفتح لك حين يفوّضك بها مكتب أو محامٍ تعمل معه.
            </p>
            <Link href="/dashboard/lawyer/join-office" className={`mt-3 inline-block rounded-xl px-4 py-2 text-xs font-bold ${isDark ? "bg-[#C8A762] text-black" : "bg-[#0B3D2E] text-white"}`}>
              كيف أنضم؟
            </Link>
          </div>
        </div>
      </section>

      <p role="note" className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${muted}`}>
        <LockSimple size={13} weight="duotone" className="mt-0.5 flex-shrink-0" />
        <span>{CONSULTANT_RESERVED_MESSAGE}</span>
      </p>
    </div>
  );
}
