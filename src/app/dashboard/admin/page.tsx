"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Users, CreditCard, Buildings, CheckCircle, Ticket, Database, ShieldCheck,
  Money, Star, Gear, ChartBar, ArrowClockwise, Tray,
  BookOpen, ChatTeardrop, Storefront, UsersThree, ArrowsLeftRight,
} from "@phosphor-icons/react";
import LibraryTab     from "./tabs/LibraryTab";
import CommunityTab   from "./tabs/CommunityTab";
import MarketplaceTab from "./tabs/MarketplaceTab";
import ERPTab         from "./tabs/ERPTab";
import TeamTab        from "./tabs/TeamTab";
import CorporateTab   from "./tabs/CorporateTab";
import Link           from "next/link";

// ─── Shortcuts ────────────────────────────────────────────────────────────────
// The overview, «المستخدمون», «الإيرادات» and «مدير AI» tabs were literals
// presented as live readings: an MRR of 981,000 ر.س with a twelve-month chart,
// ARR/ARPU/churn, a ten-row users table of invented accounts with trash
// buttons, a plan distribution, four «مباشر» system alerts and per-tool AI
// usage with growth badges. Nothing read any of it from anywhere, and the
// «تصدير» button and the quick actions under it did nothing. The real numbers
// live in the console's own pages, which read the database; the overview links
// to them instead of inventing a summary.
const ADMIN_SHORTCUTS: { href: string; label: string; icon: React.ElementType; color: string }[] = [
  { href: "/dashboard/admin/revenue",               label: "الإيرادات",       icon: Money,       color: "text-emerald-400" },
  { href: "/dashboard/admin/users",                 label: "جميع المستخدمين", icon: Users,       color: "text-blue-400" },
  { href: "/dashboard/admin/subscriptions",         label: "الاشتراكات",      icon: CreditCard,  color: "text-[#C8A762]" },
  { href: "/dashboard/admin/entitlements/requests", label: "طلبات الترقية",   icon: Tray,        color: "text-purple-400" },
  { href: "/dashboard/admin/entitlements",          label: "منح الصلاحيات",   icon: ShieldCheck, color: "text-rose-400" },
  { href: "/dashboard/admin/subscriptions/coupons", label: "الكوبونات",       icon: Star,        color: "text-[#C8A762]" },
  { href: "/dashboard/admin/tickets",               label: "تذاكر الدعم",     icon: Ticket,      color: "text-orange-400" },
  { href: "/dashboard/admin/settings",              label: "إعدادات المنصة",  icon: Gear,        color: "text-emerald-400" },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────
type ActiveTab = "overview"|"system"|"library"|"community"|"marketplace"|"erp"|"team"|"corporates";

export default function AdminDashboard() {
  const card = "relative overflow-hidden bg-[#111418]/80 backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] rounded-[2rem]";
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const TABS: {id:ActiveTab;label:string;icon:React.ElementType}[] = [
    {id:"overview",    label:"نظرة عامة",     icon:ChartBar},
    {id:"library",     label:"المكتبة القانونية", icon:BookOpen},
    {id:"community",   label:"المجتمع",        icon:ChatTeardrop},
    {id:"marketplace", label:"سوق المهنيين",   icon:Storefront},
    {id:"erp",         label:"بوابة ERP",      icon:Buildings},
    {id:"corporates",  label:"إدارة الشركات",    icon:Buildings},
    {id:"team",        label:"فريق نظامي",     icon:UsersThree},
    {id:"system",      label:"صحة النظام",     icon:ShieldCheck},
  ];

  return (
    <div className="p-5 md:p-7 space-y-5 min-h-screen text-zinc-100" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
            <h1 className="text-[22px] font-black text-white">لوحة تحكم المنصة</h1>
            <span className="text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 rounded-full px-2 py-0.5">أدمن</span>
          </div>
          <p className="text-[13px] text-zinc-500">
            {new Date().toLocaleDateString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode switch button */}
          <Link href="/dashboard/lawyer"
            className={`${card} flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold text-purple-400 hover:bg-white/[0.06] transition-all hover:scale-105 active:scale-95`}>
            <ArrowsLeftRight size={14}/> وضع المحامي
          </Link>
          {/* «النظام يعمل بشكل طبيعي» stood here with a pulsing globe: a
              literal, not a reading — nothing on this page probes any service.
              See «صحة النظام» below. The «تصدير» button beside it exported
              nothing. */}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 pb-2 overflow-x-auto no-scrollbar mask-fade-right">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-[12px] font-bold rounded-2xl transition-all duration-300 whitespace-nowrap ${
              activeTab===t.id?"bg-white/10 text-white shadow-[0_4px_20px_rgba(0,0,0,0.2)] border border-white/10":"text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`}>
            <t.icon size={16} weight={activeTab===t.id ? "fill" : "regular"} />{t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {activeTab==="overview" && <motion.div key="ov" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">

        <div className={`${card} p-6`}>
          <p className="text-[14px] font-bold text-white tracking-tight mb-1">الأرقام في صفحاتها</p>
          <p className="text-[12px] leading-relaxed text-zinc-500">
            لا تعرض هذه الصفحة ملخصاً محسوباً للمنصة. الإيرادات والمستخدمون
            والاشتراكات والطلبات تُقرأ من قاعدة البيانات في صفحاتها:
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {ADMIN_SHORTCUTS.map((a)=>(
            <Link key={a.href} href={a.href}
              className={`${card} h-32 flex flex-col items-center justify-center gap-3 hover:border-white/30 transition-all group`}>
              <div className={`flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-white/5 group-hover:bg-white/10 transition-colors shadow-inner ${a.color}`}>
                <a.icon size={24} weight="duotone"/>
              </div>
              <p className="text-[12px] font-bold text-zinc-400 group-hover:text-white transition-colors text-center">{a.label}</p>
            </Link>
          ))}
        </div>
      </motion.div>}

      {/* ═══════════════ SYSTEM TAB ═══════════════ */}
      {activeTab==="system" && <motion.div key="sys" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">
        
        {/* Core Infrastructure Bento
            Every figure that stood here was a literal presented as a live
            reading: «UPTIME 99.99%», «جميع الأنظمة تعمل بكفاءة (Operational)»,
            and six service tiles with invented availability — API 99.98%,
            PostgreSQL 99.7%, CDN 100%, Resend 97.2%, WhatsApp 94.1% and
            Moyasar 99.8% (the payment gateway is not even live) — each with an
            «SLA» no contract backs. No health check, status page or uptime
            monitor feeds this page. The services are still listed, so an admin
            knows what to check, but each says «غير متاح» instead of a number. */}
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-[1.25rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
              <Database size={22} className="text-zinc-400"/>
            </div>
            <div>
              <p className="text-[16px] font-black text-white tracking-tight mb-0.5">البنية التحتية والخوادم</p>
              <p className="text-[11px] font-medium text-zinc-500">لا يوجد رصد حيّ متصل بهذه اللوحة</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              "خوادم الـ API",
              "قاعدة البيانات (PostgreSQL)",
              "شبكة الملفات (CDN)",
              "مزود البريد (Resend)",
              "بوابة واتساب (WhatsApp)",
              "بوابة الدفع (Moyasar)",
            ].map((label)=>(
              <div key={label} className="rounded-[1.25rem] p-5 border bg-white/5 border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-zinc-300">{label}</p>
                  <span className="text-[11px] font-bold text-zinc-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">غير متاح</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
            هذه اللوحة لا تستقصي أي خدمة، فلا تعرض نسب توفر ولا حالة تشغيل.
            للتحقق من حالة خدمة، راجع لوحة المزوّد المعني مباشرة.
          </p>
        </div>

        {/* Security & Audit Logs Bento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={`${card} p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <ShieldCheck size={20} className="text-blue-400"/>
              </div>
              <p className="text-[15px] font-bold text-white tracking-tight">بروتوكولات الأمان</p>
            </div>
            {/* Every value in this panel used to be a literal presented as live
                status, and every one of them was invented:
                  • SSL «تنتهي في مارس ٢٠٢٦» — no certificate is read here, and
                    the date had already passed (today is 2026-09).
                  • 2FA «مفعلة إجبارياً» — there is no MFA in this codebase at
                    all; grep for mfa/enroll returns nothing.
                  • IDS «لم يتم رصد هجمات» — there is no intrusion detection
                    system, so "no attacks detected" is an absence of a sensor,
                    not an absence of attacks.
                  • Backup «آخر نسخة: منذ ٣ ساعات» — nothing queries backup
                    state. An admin who reads this and skips a restore check is
                    the concrete harm.
                What remains is architecture that is actually true and does not
                pretend to be a live reading. Backup/2FA/IDS rows are deleted
                rather than shown as "unknown", because the renderer stamps an
                emerald check on every row it is given. */}
            <div className="space-y-3">
              {[
                {label:"نقل مشفّر (TLS/HTTPS)",       val:"مفعّل",  desc:"على جميع طلبات المنصة"},
                {label:"التشفير عند التخزين",          val:"مُدار",  desc:"على مستوى الأقراص لدى مزوّد قاعدة البيانات"},
                {label:"عزل الصفوف (RLS)",            val:"مفعّل",  desc:"سياسات على مستوى الصف تفصل بيانات الحسابات"},
              ].map((r,i)=>(
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <div>
                    <p className="text-[12px] font-bold text-zinc-200 mb-0.5">{r.label}</p>
                    <p className="text-[10px] text-zinc-500">{r.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                    <CheckCircle size={14} weight="fill" className="text-emerald-400"/>
                    <span className="text-[11px] font-bold text-emerald-400">{r.val}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
              ما سبق وصف لبنية المنصة وليس قراءة حيّة — هذه اللوحة لا تستقصي أي
              خدمة لمعرفة الحالة الفعلية. للتحقق من صلاحية الشهادات أو من آخر
              نسخة احتياطية، راجع لوحة مزوّد الاستضافة وقاعدة البيانات مباشرة.
            </p>
          </div>

          <div className={`${card} p-6`}>
             <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <ArrowClockwise size={20} className="text-purple-400"/>
              </div>
              <p className="text-[15px] font-bold text-white tracking-tight">سجل العمليات الآلية</p>
            </div>
            {/* The four timeline entries that stood here were literals, not a
                log: a database backup «منذ ٣ ساعات», an SSL auto-renewal by
                Cloudflare, an "AI algorithm update", and a Redis cache flush.
                No ops-log table or job runner exists to produce any of them,
                and no LLM is wired for the third one to have updated. Shown in
                an admin console with green success dots, they read as a
                verified maintenance history — which is exactly what makes them
                dangerous. Replaced with the honest state rather than a
                plausible-looking one. */}
            <div className="rounded-2xl bg-white/5 border border-white/5 p-5 text-center">
              <p className="text-[12px] font-bold text-zinc-300 mb-1">غير متاح حالياً</p>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                لا يوجد سجل عمليات آلية متصل بهذه اللوحة بعد. سجلات النسخ
                الاحتياطي وتجديد الشهادات والمهام المجدولة متاحة في لوحات
                المزوّدين المعنيين.
              </p>
            </div>
          </div>
        </div>
      </motion.div>}

      {activeTab==="library"     && <LibraryTab/>}
      {activeTab==="community"   && <CommunityTab/>}
      {activeTab==="marketplace" && <MarketplaceTab/>}
      {activeTab==="erp"         && <ERPTab/>}
      {activeTab==="corporates"  && <CorporateTab/>}
      {activeTab==="team"        && <TeamTab/>}

      </AnimatePresence>
    </div>
  );
}
