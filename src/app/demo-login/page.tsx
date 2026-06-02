"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Gavel, Shield, Star, User, Buildings, Storefront,
  Stamp, UserCircleGear, HandHeart, ArrowLeft,
  CheckCircle, Lock, Scales, Crown, ClipboardText,
  MapTrifold, Briefcase, ChartBar, UsersThree,
  IdentificationBadge, Factory, TreeStructure,
  Eye, EyeSlash, Globe, PlayCircle, GraduationCap,
  ShoppingBag,
} from "@phosphor-icons/react";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { setDemoSession } from "@/hooks/useUser";
import { getDashboardRoute } from "@/constants/navigation";
import { TEST_PASSWORD } from "@/lib/test-credentials";
import type { UserSession } from "@/hooks/useUser";

// ── Safe import of bypass keys ────────────────────────────────────────────────
let DEMO_BYPASS_KEYS: string[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require("@/lib/betaConfig");
  DEMO_BYPASS_KEYS = cfg.DEMO_BYPASS_KEYS ?? [];
} catch { /* no bypass if config deleted */ }

// ── Icon map ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  lawyer: Gavel, lawyer_bypass: Gavel, lawyer_lite: Gavel,
  firm: Buildings, firm_enterprise: Buildings, firm_small: Buildings,
  firm_lawyer: Gavel, firm_secretary: IdentificationBadge, firm_finance: ChartBar,
  firm_hr: UsersThree, firm_compliance: Shield,
  notary: Stamp,
  gov_reviewer: ClipboardText, lawyer_notary: Stamp, lawyer_reviewer: MapTrifold,
  lawyer_arbitrator: Scales, lawyer_all: Crown, standalone_arbitrator: Scales,
  individual: User, individual_free: User, individual_premium: IdentificationBadge,
  corporate: Buildings, corporate_counsel: Briefcase, corporate_hr: UsersThree,
  corporate_cfo: ChartBar, corporate_employee: User, corporate_service: TreeStructure,
  corporate_small: Buildings, micro: Storefront, micro_smart: Factory,
  ngo: HandHeart, government_judge: Gavel, government_prosecutor: Shield,
  government_officer: Star, government_counsel: UserCircleGear,
  admin: Shield, guest: User,
};

// ── User groups ───────────────────────────────────────────────────────────────
const GROUPS = [
  {
    label: "المحامون ومكاتب المحاماة", labelEn: "Lawyers & Law Firms",
    keys: ["lawyer", "lawyer_bypass", "lawyer_lite",
           "firm", "firm_enterprise", "firm_small",
           "firm_lawyer", "firm_secretary", "firm_finance", "firm_hr", "firm_compliance",
           "lawyer_all", "lawyer_notary", "lawyer_reviewer", "lawyer_arbitrator"],
  },
  {
    label: "مقدمو الخدمات", labelEn: "Service Providers",
    keys: ["notary", "gov_reviewer", "standalone_arbitrator"],
  },
  {
    label: "الأفراد", labelEn: "Individual Clients",
    keys: ["individual", "individual_free", "individual_premium"],
  },
  {
    label: "الشركات التجارية", labelEn: "Corporate",
    keys: ["corporate", "corporate_counsel", "corporate_hr", "corporate_cfo",
           "corporate_employee", "corporate_service", "corporate_small"],
  },
  {
    label: "المنشآت والجمعيات والحكومة", labelEn: "Micro, NGO & Government",
    keys: ["micro", "micro_smart", "ngo", "government_judge", "government_prosecutor", "government_officer", "government_counsel"],
  },
];

// ── Gated public pages ────────────────────────────────────────────────────────
const GATED_PAGES = [
  { label: "السوق",            href: "/marketplace",                       icon: ShoppingBag,   note: "مخفي في البيتا" },
  { label: "بحث عن محامٍ",     href: "/dashboard/client/find-lawyer",      icon: Gavel,         note: "مخفي في البيتا" },
  { label: "الميديا",           href: "/media",                             icon: PlayCircle,    note: "مخفي في البيتا" },
  { label: "أكاديمية نظامي",   href: "/academy",                           icon: GraduationCap, note: "مخفي في البيتا" },
  { label: "صفحة خدمات المحامين", href: "/services/lawyers",              icon: Globe,         note: "نصوص multi-vendor" },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function DemoLoginPage() {
  const router  = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  function handleSelect(key: string, session: UserSession) {
    setActiveKey(key);
    setLoading(true);
    setDemoSession(session, key);
    setTimeout(() => {
      const dest = session.isLoggedIn && session.userType
        ? getDashboardRoute(session.userType) : "/login";
      router.push(dest);
    }, 600);
  }

  const adminAccount = DEMO_ACCOUNTS.find(a => a.key === "admin");

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white flex flex-col items-center px-4 py-12" dir="rtl">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/25 px-4 py-1.5 text-[11px] font-bold text-amber-400 mb-4">
          <Lock size={12} weight="bold" /> وضع التطوير فقط — للحذف قبل الإنتاج
        </div>
        <h1 className="text-3xl font-black text-white mb-2">تسجيل دخول تجريبي</h1>
        <p className="text-sm text-zinc-500 max-w-sm mx-auto">
          اختر أي دور لمعاينة تجربة المستخدم بدون بيانات حقيقية
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-[11px] text-zinc-400">
          <span className="text-zinc-600">كلمة المرور الموحدة:</span>
          <span dir="ltr" className="font-mono font-bold text-amber-400">{TEST_PASSWORD}</span>
        </div>
      </motion.div>

      {/* ── Legend ── */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="flex items-center gap-6 mb-10 text-[11px] rounded-2xl bg-white/[0.03] border border-white/[0.06] px-6 py-3"
      >
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-emerald-400" />
          <span className="text-emerald-400 font-bold">ورك فلو كامل</span>
          <span className="text-zinc-600">— بدون أي غطاء، السوق + AI بيظهر فوراً</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-2">
          <EyeSlash size={14} className="text-red-400" />
          <span className="text-red-400 font-bold">مع طبقة البيتا</span>
          <span className="text-zinc-600">— السوق مخفي + AI بيتغطى بقيد المراجعة</span>
        </div>
      </motion.div>

      <div className="w-full max-w-5xl space-y-12">

        {/* ── Admin — special always-bypass card ── */}
        {adminAccount && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <SectionHeader icon={<Shield size={13} className="text-amber-400" />} label="مدير النظام" labelEn="System Admin" note="يشوف كل شيء دايماً بصلاحيات كاملة" noteColor="text-amber-400" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
              <AccountCard account={adminAccount} activeKey={activeKey} loading={loading} onSelect={handleSelect} isBypass={true} />
            </div>
          </motion.div>
        )}

        {/* ── Per-group split ── */}
        {GROUPS.map((group, gi) => {
          const all     = DEMO_ACCOUNTS.filter(a => group.keys.includes(a.key));
          const bypass  = all.filter(a => DEMO_BYPASS_KEYS.includes(a.key));
          const gated   = all.filter(a => !DEMO_BYPASS_KEYS.includes(a.key));

          return (
            <motion.div key={group.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.07 }}>
              {/* Group divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[14px] font-black text-white tracking-tight">{group.label}</span>
                <span className="text-[11px] text-zinc-600 uppercase tracking-widest">{group.labelEn}</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              <div className="space-y-5">
                {/* Full bypass sub-group */}
                {bypass.length > 0 && (
                  <div>
                    <SectionHeader
                      icon={<Eye size={11} className="text-emerald-400" />}
                      label={`${group.label} — ورك فلو كامل بدون أي غطاء`}
                      noteColor="text-emerald-400"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
                      {bypass.map(acc => (
                        <AccountCard key={acc.key} account={acc} activeKey={activeKey} loading={loading} onSelect={handleSelect} isBypass={true} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Gated sub-group */}
                {gated.length > 0 && (
                  <div>
                    <SectionHeader
                      icon={<EyeSlash size={11} className="text-red-400" />}
                      label={`${group.label} — مع طبقة التغطية (البيتا)`}
                      noteColor="text-red-400"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
                      {gated.map(acc => (
                        <AccountCard key={acc.key} account={acc} activeKey={activeKey} loading={loading} onSelect={handleSelect} isBypass={false} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* ── Gated public pages (Hidden in Beta) ── */}
        {/*
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-red-500/20" />
            <EyeSlash size={14} className="text-red-400" />
            <span className="text-[14px] font-black text-red-400">صفحات وخدمات مخفية في البيتا</span>
            <div className="flex-1 h-px bg-red-500/20" />
          </div>
          <p className="text-[11px] text-zinc-600 mb-4 text-center">
            الصفحات دي مخفية عن المستخدمين العاديين في وضع البيتا — تقدر تفتحها مباشرة من هنا للاختبار
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {GATED_PAGES.map(page => {
              const Icon = page.icon;
              return (
                <motion.button
                  key={page.href}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push(page.href)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/35 px-4 py-5 text-center transition-all"
                >
                  <Icon size={22} className="text-red-400" />
                  <span className="text-[12px] font-bold text-zinc-300">{page.label}</span>
                  <span className="text-[9px] text-red-400/70">{page.note}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
        */}

      </div>

      {/* ── Footer ── */}
      <div className="mt-14 text-center text-[11px] text-zinc-700 space-y-1">
        <p>هذه الصفحة للاختبار فقط — لا يوجد backend حقيقي</p>
        <p>للتنقل بين الحسابات: اختر حساباً جديداً في أي وقت من هذه الصفحة</p>
        <button
          onClick={() => router.push("/")}
          className="mt-3 inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 transition-colors text-[11px]"
        >
          <ArrowLeft size={11} /> الرئيسية
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon, label, note, noteColor = "text-zinc-400", labelEn,
}: {
  icon: React.ReactNode;
  label: string;
  note?: string;
  noteColor?: string;
  labelEn?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 pr-1">
      {icon}
      <span className={`text-[10px] font-bold uppercase tracking-widest ${noteColor}`}>{label}</span>
      {labelEn && <span className="text-[10px] text-zinc-600 ml-1">| {labelEn}</span>}
      {note  && <span className="text-[10px] text-zinc-600 mr-auto">{note}</span>}
    </div>
  );
}

function AccountCard({
  account, activeKey, loading, onSelect, isBypass,
}: {
  account: (typeof DEMO_ACCOUNTS)[0];
  activeKey: string | null;
  loading: boolean;
  onSelect: (key: string, session: UserSession) => void;
  isBypass: boolean;
}) {
  const IconComp = ICON_MAP[account.key] ?? User;
  const isActive = activeKey === account.key;

  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(account.key, account.session)}
      disabled={loading}
      className={`relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-right transition-all duration-200 disabled:opacity-60 ${
        isActive
          ? "border-[#C8A762]/60 bg-[#C8A762]/10 shadow-lg shadow-[#C8A762]/10"
          : isBypass
          ? "border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10"
          : "border-red-500/15 bg-red-500/5 hover:border-red-500/30 hover:bg-red-500/10"
      }`}
    >
      {/* Tier badge */}
      {account.badge && (
        <span className="absolute top-3 left-3 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black text-zinc-400">
          {account.badge}
        </span>
      )}

      {/* Bypass dot indicator */}
      <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${isBypass ? "bg-emerald-500" : "bg-red-500/60"}`} />

      {/* Icon */}
      <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${account.color} flex items-center justify-center shadow-md`}>
        {isActive && loading
          ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
          : isActive
          ? <CheckCircle size={20} weight="fill" className="text-white" />
          : <IconComp size={20} weight="fill" className="text-white" />
        }
      </div>

      {/* Label */}
      <div>
        <div className="text-[13px] font-bold text-white leading-tight">{account.label}</div>
        <div className="text-[10px] text-zinc-500 mt-0.5">{account.labelEn}</div>
      </div>

      {/* Name */}
      <div className="text-[10px] text-zinc-600 border-t border-white/[0.06] pt-2 w-full truncate">
        {account.session.name || "زائر"}
      </div>
    </motion.button>
  );
}
