"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UsersThree, Plus, ArrowLeft, MagnifyingGlass,
  DotsThree, Pencil, Trash, SealCheck,
  EnvelopeSimple, Phone,
  Scales, ChartBar, Crown,
  X, Check, Briefcase, IdentificationCard, ShieldCheck, ArrowRight, Buildings
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useUser } from "@/hooks/useUser";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserType = "corporate" | "lawyer";
type MemberRole = "owner" | "legal_manager" | "legal_staff" | "department_head" | "hr_manager" | "finance_manager" | "seconded" | "employee" | "compliance_officer";
type MemberStatus = "active" | "busy" | "offline";

interface TeamMember {
  id: string;
  nameAr: string;
  role: MemberRole;
  dept: string;
  status: MemberStatus;
  cases: number;
  completedCases: number;
  joinDate: string;
  email: string;
  phone: string;
  initials: string;
  gradient: string;
  verified: boolean;
  hasLawyerPowers?: boolean; // For Corporate internal counsel
}

// ─── Context-Aware Configuration ───────────────────────────────────────────────

const FIRM_ROLES: Record<MemberRole, { ar: string; color: string }> = {
  owner:              { ar: "مدير الشركة",                color: "text-[#C8A762] bg-[#C8A762]/15 border-[#C8A762]/30" },
  legal_manager:      { ar: "رئيس الشؤون القانونية",   color: "text-[#0B3D2E] bg-[#0B3D2E]/10 border-[#0B3D2E]/25 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-700/30" },
  legal_staff:        { ar: "أخصائي قانوني",           color: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-700/30" },
  department_head:    { ar: "رئيس قسم",                  color: "text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-700/30" },
  hr_manager:         { ar: "مدير موارد بشرية",        color: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200 dark:text-fuchsia-400 dark:bg-fuchsia-900/20 dark:border-fuchsia-700/30" },
  finance_manager:    { ar: "مدير مالي",               color: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-700/30" },
  compliance_officer: { ar: "مسؤول الامتثال",          color: "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-700/30" },
  seconded:           { ar: "مستشار منتدب",             color: "text-sky-600 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-900/20 dark:border-sky-700/30" },
  employee:           { ar: "موظف عام",                 color: "text-zinc-600 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700" },
};

const CORP_ROLES: Record<MemberRole, { ar: string; color: string }> = {
  owner:              { ar: "مدير الشركة",                color: "text-[#C8A762] bg-[#C8A762]/15 border-[#C8A762]/30" },
  legal_manager:      { ar: "رئيس الشؤون القانونية",   color: "text-[#0B3D2E] bg-[#0B3D2E]/10 border-[#0B3D2E]/25 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-700/30" },
  legal_staff:        { ar: "أخصائي قانوني",           color: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-700/30" },
  department_head:    { ar: "رئيس قسم",                  color: "text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-700/30" },
  hr_manager:         { ar: "مدير موارد بشرية",        color: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200 dark:text-fuchsia-400 dark:bg-fuchsia-900/20 dark:border-fuchsia-700/30" },
  finance_manager:    { ar: "مدير مالي",               color: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-700/30" },
  compliance_officer: { ar: "مسؤول الامتثال",          color: "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-700/30" },
  seconded:           { ar: "مستشار منتدب",             color: "text-sky-600 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-900/20 dark:border-sky-700/30" },
  employee:           { ar: "موظف عام",                 color: "text-zinc-600 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700" },
};

const STATUS_STYLE: Record<MemberStatus, { dot: string; label: string }> = {
  active:  { dot: "bg-emerald-500", label: "نشط" },
  busy:    { dot: "bg-amber-500",   label: "مشغول" },
  offline: { dot: "bg-zinc-400",   label: "غائب" },
};

const MEMBERS: TeamMember[] = [
  {
    id: "1", nameAr: "نورة الزهراني", role: "legal_manager", dept: "الشؤون القانونية",
    status: "active", cases: 7, completedCases: 39, joinDate: "يناير ٢٠٢٤",
    email: "n.zahrani@example.sa", phone: "+966 50 847 1928",
    initials: "نز", gradient: "from-[#0B3D2E] to-[#1a6b50]", verified: true, hasLawyerPowers: true
  },
  {
    id: "2", nameAr: "فهد السبيعي", role: "legal_staff", dept: "المشتريات",
    status: "busy", cases: 5, completedCases: 28, joinDate: "مارس ٢٠٢٤",
    email: "f.subaie@example.sa", phone: "+966 55 312 7491",
    initials: "فس", gradient: "from-blue-700 to-blue-500", verified: true, hasLawyerPowers: false
  },
  {
    id: "3", nameAr: "ريم القحطاني", role: "hr_manager", dept: "الموارد البشرية",
    status: "active", cases: 2, completedCases: 11, joinDate: "نوفمبر ٢٠٢٥",
    email: "r.qahtani@example.sa", phone: "+966 56 204 8837",
    initials: "رق", gradient: "from-fuchsia-600 to-fuchsia-400", verified: false,
  },
  {
    id: "4", nameAr: "سلمى الدوسري", role: "finance_manager", dept: "المالية",
    status: "offline", cases: 0, completedCases: 15, joinDate: "يونيو ٢٠٢٤",
    email: "s.dosari@example.sa", phone: "+966 50 091 5362",
    initials: "سد", gradient: "from-amber-600 to-amber-400", verified: true, hasLawyerPowers: false
  },
];

// ─── Pending Invites mock ─────────────────────────────────────────────────────
const INITIAL_INVITES = [
  { id: "inv-1", name: "عبدالله الشريف", email: "a.sharif@arabian-co.sa",  role: "أخصائي قانوني",  daysLeft: 5 },
  { id: "inv-2", name: "لينا المطيري",   email: "l.mutairi@arabian-co.sa", role: "مستشار داخلي", daysLeft: 1 },
];

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, isDark, userType }: { onClose: () => void; isDark: boolean; userType: UserType }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [sent, setSent] = useState(false);
  const activeRoles = userType === "corporate" ? CORP_ROLES : FIRM_ROLES;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[4px]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-200"}`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>دعوة عضو جديد</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <X size={14} />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <Check size={24} weight="bold" className="text-emerald-600" />
            </div>
            <p className={`font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>تم إرسال الدعوة!</p>
            <p className={`text-sm mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>سيتلقى {name || email} رابط تفعيل الحساب</p>
            <div className={`mt-3 mx-auto w-fit flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
              <span className="font-mono font-bold select-all">https://nezamy.online/invite/x7k2m9p</span>
            </div>
            <button onClick={onClose} className="mt-4 text-[13px] text-[#C8A762] hover:underline">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الاسم</label>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${isDark ? "border-white/[0.08] bg-zinc-800" : "border-zinc-200 bg-zinc-50"}`}>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="اسم الموظف"
                  className={`flex-1 bg-transparent text-[14px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
                />
              </div>
            </div>
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>البريد الإلكتروني</label>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${isDark ? "border-white/[0.08] bg-zinc-800" : "border-zinc-200 bg-zinc-50"}`}>
                <EnvelopeSimple size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="employee@company.sa"
                  className={`flex-1 bg-transparent text-[14px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
                />
              </div>
            </div>
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الدور المقترح</label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2.5 text-[14px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}
              >
                <option value="">— اختر الدور —</option>
                {Object.entries(activeRoles).map(([k, r]) => (
                  <option key={k} value={k}>{r.ar}</option>
                ))}
              </select>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { if (email && role) setSent(true); }}
              disabled={!email || !role}
              className="w-full rounded-xl bg-[#0B3D2E] py-2.5 text-[14px] font-bold text-white shadow-md hover:bg-[#0d4c38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              إرسال الدعوة
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Power Activation Modal (Corporate Only) ───────────────────────────────────

function PowerModal({ onClose, isDark, memberName }: { onClose: () => void; isDark: boolean; memberName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
        className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border ${isDark ? "bg-zinc-900 border-[#C8A762]/30" : "bg-white border-[#C8A762]"}`}
      >
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#111111] to-[#222222] border-2 border-[#C8A762] flex items-center justify-center shadow-lg">
            <ShieldCheck size={26} weight="fill" className="text-[#C8A762]" />
          </div>
        </div>
        <h3 className={`text-center text-lg font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>تفعيل صلاحيات المحامي</h3>
        <p className={`text-center text-[12px] leading-relaxed mb-6 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          تمنح هذه الخاصية للمستشار الداخلي ({memberName}) صلاحيات المحامين الكاملة على منصة نظامي مثل الوصول للمجتمع المغلق، وجراف القضايا المتقدم.
        </p>

        <div className="space-y-3 mb-6">
          <div>
            <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>رقم الترخيص المهني</label>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-800" : "border-zinc-200 bg-zinc-50"}`}>
              <IdentificationCard size={14} className="text-[#C8A762]" />
              <input type="text" placeholder="مثال: ٤٤/١٢٣" className="bg-transparent text-sm w-full outline-none" />
            </div>
          </div>
          
          <div className={`rounded-xl p-3 border text-[11px] flex items-start gap-2 ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-500" : "border-amber-200 bg-amber-50 text-amber-600"}`}>
            <Crown size={14} className="flex-shrink-0 mt-0.5" />
            <p><strong>تنبيه:</strong> تفعيل هذا الخيار يتطلب وجود اشتراك Pro/Max فعّال لحساب شركتكم.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-[#C8A762] py-2 text-sm font-bold text-white hover:bg-[#b09153] transition-colors">
            تأكيد وتفعيل
          </button>
          <button onClick={onClose} className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${isDark ? "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            إلغاء
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

import { RoleGuard } from "@/components/dashboard/RoleGuard";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

export default function BusinessTeamPage() {
  const { isDark } = useTheme();
  const session = useUser();
  const businessRole = session.businessRole ?? "employee";
  const { currentCompanyFeatures, mounted, updateCompanyFeatures } = useAdminSettings();
  
  // States
  const [userType, setUserType] = useState<UserType>("corporate");
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState(INITIAL_INVITES);

  // Power activation setup
  const [powerTarget, setPowerTarget] = useState<string | null>(null);

  // K2/K3: Dynamic External Legal Dept state
  const [hasInternalLegal, setHasInternalLegal] = useState(true);

  useEffect(() => {
    if (mounted) setHasInternalLegal(currentCompanyFeatures.hasInternalLegal);
  }, [mounted, currentCompanyFeatures.hasInternalLegal]);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const currentMembers = hasInternalLegal
    ? MEMBERS
    : MEMBERS.filter(m => m.role !== "legal_manager" && m.role !== "legal_staff");

  const filtered = currentMembers.filter(m =>
    m.nameAr.includes(search) || m.dept.includes(search)
  );

  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35, ease: "easeOut" as const } }),
  };

  const activeRolesMap = userType === "corporate" ? CORP_ROLES : FIRM_ROLES;
  const canConfigureStructure = session.userType === "admin" || businessRole === "owner" || businessRole === "legal_manager";
  const canInviteMembers = session.userType === "admin" || ["owner", "legal_manager", "hr_manager"].includes(businessRole);
  const canActivateLawyerPowers = session.userType === "admin" || ["owner", "legal_manager"].includes(businessRole);
  const canManageMember = (member: TeamMember) => {
    if (session.userType === "admin" || businessRole === "owner") return true;
    if (businessRole === "legal_manager") return ["legal_staff", "seconded", "department_head", "employee", "compliance_officer"].includes(member.role);
    if (businessRole === "hr_manager") return ["employee", "department_head", "hr_manager"].includes(member.role);
    return false;
  };

  return (
    <RoleGuard allowedRoles={["owner", "legal_manager", "hr_manager"]}>
    <SubscriptionGuard featureKey="team-manage">
    <div className={`p-5 md:p-8 space-y-6 max-w-7xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Link href="/dashboard/business" className={`text-[13px] ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
              لوحة التحكم
            </Link>
            <ArrowLeft size={12} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
          </div>
          <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
            {userType === "corporate" ? "إدارة الفريق" : "إدارة فريق المكتب"}
            
            {canConfigureStructure && (
            <div className="flex gap-2">
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value as UserType)}
                className={`text-[11px] font-bold rounded-lg px-2 py-1 outline-none border ${isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"}`}
              >
                <option value="corporate">وضع الشركات</option>
                <option value="lawyer">وضع مكتب المحاماة</option>
              </select>

              {userType === "corporate" && (
                <select
                  value={hasInternalLegal ? "internal" : "external"}
                  onChange={(e) => {
                    const next = e.target.value === "internal";
                    setHasInternalLegal(next);
                    updateCompanyFeatures(currentCompanyFeatures.companyId, { hasInternalLegal: next });
                  }}
                  className={`text-[11px] font-bold rounded-lg px-2 py-1 outline-none border ${isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"}`}
                >
                  <option value="internal">قانونية داخلية</option>
                  <option value="external">قانونية خارجية</option>
                </select>
              )}
            </div>
            )}
          </h1>
          <p className={`text-sm mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            {currentMembers.length} أعضاء · يتم تكييف المسميات تلقائياً حسب نوع حسابك
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Search */}
          <div className={`hidden sm:flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-800/60" : "border-zinc-200 bg-zinc-50"}`}>
            <MagnifyingGlass size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث عن عضو..."
              className={`bg-transparent text-[13px] outline-none w-40 ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-700 placeholder:text-zinc-400"}`}
            />
          </div>
          {canInviteMembers && (
            <motion.button
              whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[13px] font-bold text-white shadow-md relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <Plus size={15} weight="bold" className="relative z-10" />
              <span className="relative z-10">دعوة عضو</span>
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Stats row (Context Aware) ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: UsersThree, label: "إجمالي الفريق", value: currentMembers.length, color: "text-[#0B3D2E]" },
          { icon: Scales, label: userType === "corporate" ? "طلبات وإجراءات نشطة" : "قضايا نشطة", value: currentMembers.reduce((a, m) => a + m.cases, 0), color: "text-blue-600" },
          { icon: ChartBar, label: userType === "corporate" ? "عقود وطلبات منجزة" : "قضايا منجزة", value: currentMembers.reduce((a, m) => a + m.completedCases, 0), color: "text-emerald-600" },
          { icon: Crown, label: userType === "corporate" ? "مدراء إدارات" : "شركاء مسجلون", value: currentMembers.filter(m => m.role === "department_head" || m.role === "legal_manager").length, color: "text-[#C8A762]" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
              className={`${card} flex items-center gap-3 px-4 py-4 shadow-sm group hover:-translate-y-0.5 transition-transform`}>
              <div className={`p-2 rounded-xl transition-colors ${isDark ? "bg-white/[0.04] group-hover:bg-white/[0.08]" : "bg-zinc-50 group-hover:bg-zinc-100"}`}>
                <Icon size={20} className={s.color} weight="duotone" />
              </div>
              <div>
                <p className={`font-mono text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{s.value.toString().padStart(2, "٠")}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── K2/K3: External Legal Dept Alert / Marketplace Pipeline ───────────── */}
      {!hasInternalLegal && userType === "corporate" && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1.5}
          className={`relative overflow-hidden rounded-2xl border p-6 ${isDark ? "border-[#C8A762]/30 bg-gradient-to-l from-[#C8A762]/10 to-transparent" : "border-[#C8A762] bg-gradient-to-l from-[#C8A762]/10 to-white shadow-sm"}`}
        >
          <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none">
            <Buildings size={120} weight="fill" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex gap-4 items-start">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b4e] flex items-center justify-center shrink-0 shadow-md">
                <Briefcase size={24} className="text-[#C8A762]" weight="duotone" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الإدارة القانونية مفوضة خارجياً</h3>
                <p className={`text-sm mt-1 max-w-xl ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  الهيكل التنظيمي يعكس عدم وجود إدارة قانونية داخلية. جميع طلبات الأقسام (الموارد البشرية، المشتريات، الخ) يتم توجيهها تلقائياً إلى المستشار المنتدب أو مكتب المحاماة الخارجي.
                </p>
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              <Link href="/dashboard/business/marketplace">
                <button className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${isDark ? "bg-white/[0.05] hover:bg-white/[0.1] text-white" : "bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700"}`}>
                  استكشف المكاتب
                </button>
              </Link>
              <Link href="/dashboard/business/seconded-counsel">
                <button className="px-4 py-2 text-sm font-bold rounded-xl bg-[#0B3D2E] text-white shadow-md hover:bg-[#0a3328] transition-colors">
                  إدارة المستشار المنتدب
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Pending Invites Section ───────────────────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}
          className={`rounded-2xl border overflow-hidden ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50/60"}`}
        >
          <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? "border-amber-500/10" : "border-amber-100"}`}>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                دعوات معلقة ({pendingInvites.length})
              </span>
            </div>
            <span className={`text-[10px] ${isDark ? "text-amber-600" : "text-amber-500"}`}>
              صالحة لـ ٧ أيام
            </span>
          </div>
          <div className={`divide-y ${isDark ? "divide-amber-500/10" : "divide-amber-100"}`}>
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{inv.name}</p>
                  <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{inv.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-white/[0.05] text-zinc-400" : "bg-white text-zinc-500"} border ${isDark ? "border-white/[0.06]" : "border-zinc-200"}`}>
                  {inv.role}
                </span>
                <span className={`text-[10px] font-bold font-mono ${inv.daysLeft <= 1 ? "text-red-500" : "text-amber-500"}`}>
                  {inv.daysLeft}د
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    title="إعادة إرسال"
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] transition-colors ${isDark ? "bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400" : "bg-white hover:bg-zinc-50 text-zinc-500 border border-zinc-200"}`}
                  >
                    <EnvelopeSimple size={13} />
                  </button>
                  <button
                    title="إلغاء الدعوة"
                    onClick={() => setPendingInvites(p => p.filter(x => x.id !== inv.id))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors text-red-400 hover:bg-red-500/10"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Member cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((member, i) => {
            const roleStyle = activeRolesMap[member.role];
            const statusStyle = STATUS_STYLE[member.status];
            const completionRate = Math.round((member.completedCases / (member.completedCases + member.cases + 1)) * 100);

            return (
              <motion.div
                key={member.id}
                layout
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={`${card} shadow-sm relative overflow-hidden`}
              >
                {/* Gradient accent top */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${member.gradient}`} />

                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${member.gradient} flex items-center justify-center shadow-md`}>
                        <span className="text-white font-bold text-[15px]">{member.initials}</span>
                      </div>
                      <span className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 ${isDark ? "border-zinc-900" : "border-white"} ${statusStyle.dot}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/dashboard/business/team/${member.id}`} className={`text-[14px] font-bold truncate hover:underline underline-offset-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                          {member.nameAr}
                        </Link>
                        {member.verified && <span title="موثق"><SealCheck size={14} weight="fill" className="text-[#C8A762] flex-shrink-0" /></span>}
                        {member.hasLawyerPowers && <span title="صلاحيات محامي مفعلة"><ShieldCheck size={14} weight="fill" className="text-blue-500 flex-shrink-0" /></span>}
                      </div>
                      <span className={`inline-flex mt-1 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${roleStyle.color}`}>
                        {roleStyle.ar}
                      </span>
                    </div>

                    {/* Actions menu */}
                    <div className="relative flex-shrink-0">
                      {canManageMember(member) && (
                        <button
                          onClick={() => setActiveMenu(activeMenu === member.id ? null : member.id)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}
                        >
                          <DotsThree size={16} weight="bold" />
                        </button>
                      )}
                      <AnimatePresence>
                        {activeMenu === member.id && canManageMember(member) && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -4 }}
                            className={`absolute start-0 top-9 z-10 w-48 rounded-xl shadow-xl py-1 text-[13px] border ${isDark ? "bg-zinc-800 border-white/[0.08]" : "bg-white border-zinc-200"}`}
                          >
                            <Link href={`/dashboard/business/team/${member.id}`} className={`flex w-full items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-white/[0.05] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                              <ArrowRight size={13} /> عرض الملف التفصيلي
                            </Link>
                            <button className={`flex w-full items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-white/[0.05] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                              <Pencil size={13} /> تعديل البيانات
                            </button>
                            
                            {/* Corporate Lawyer Power Toggle — for legal_staff/seconded with lawyer credentials */}
                            {canActivateLawyerPowers && userType === "corporate" && (member.role === "legal_staff" || member.role === "seconded") && !member.hasLawyerPowers && (
                              <button onClick={() => { setActiveMenu(null); setPowerTarget(member.nameAr); }} className={`flex w-full items-center gap-2.5 px-3 py-2 text-[#C8A762] hover:bg-[#C8A762]/10`}>
                                <ShieldCheck size={13} /> تفعيل صلاحيات محامي
                              </button>
                            )}

                            <button className="flex w-full items-center gap-2.5 px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                              <Trash size={13} /> إزالة العضو
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Info */}
                  <div className={`space-y-1.5 mb-4 text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <div className="flex items-center gap-1.5">
                      <Briefcase size={13} />
                      <span>{member.dept}</span>
                      <span className={`ms-auto flex items-center gap-1 ${statusStyle.dot === "bg-emerald-500" ? "text-emerald-500" : statusStyle.dot === "bg-amber-500" ? "text-amber-500" : isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <EnvelopeSimple size={13} />
                      <span className="truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone size={13} />
                      <span>{member.phone}</span>
                    </div>
                  </div>

                  {/* Context Aware Stats Footer */}
                  <div className={`flex items-center gap-3 text-[11px] border-t pt-3 ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                    <div className="flex-1">
                      <p className={`mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{userType === "corporate" ? "في الانتظار" : "قضايا نشطة"}</p>
                      <p className={`font-mono font-bold text-[15px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{member.cases}</p>
                    </div>
                    <div className="flex-1">
                      <p className={`mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{userType === "corporate" ? "تم المعالجة" : "منجزة"}</p>
                      <p className={`font-mono font-bold text-[15px] text-emerald-500`}>{member.completedCases}</p>
                    </div>
                    <div className="flex-1">
                      <p className={`mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الكفاءة</p>
                      <div className="flex items-center gap-1.5">
                        <div className={`h-1 flex-1 rounded-full ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${completionRate}%` }}
                            transition={{ delay: 0.4, duration: 0.7 }}
                            className={`h-full rounded-full bg-gradient-to-r ${member.gradient}`}
                          />
                        </div>
                        <span className={`font-mono font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{completionRate}٪</span>
                      </div>
                    </div>
                  </div>

                  {/* View Profile CTA */}
                  <Link
                    href={`/dashboard/business/team/${member.id}`}
                    className={`mt-3 flex items-center justify-center gap-1.5 w-full rounded-xl py-2 text-[12px] font-bold transition-colors border ${
                      isDark
                        ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04] hover:text-emerald-300"
                        : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-[#0B3D2E]"
                    }`}
                  >
                    عرض الملف التفصيلي <ArrowRight size={12} />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showInvite && canInviteMembers && <InviteModal onClose={() => setShowInvite(false)} isDark={isDark} userType={userType} />}
        {powerTarget && <PowerModal onClose={() => setPowerTarget(null)} isDark={isDark} memberName={powerTarget} />}
      </AnimatePresence>
    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
