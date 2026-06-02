"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, MagnifyingGlass, Gavel, CalendarBlank,
  Star, Phone, Envelope, DotsThree, CheckCircle,
  Clock, Warning, Key, Student, X, UserPlus, CaretDown,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import type { FirmRole } from "@/types/firmBackendReady";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

type MemberRole = FirmRole;

interface TeamMember {
  id: string;
  name: string;
  role: MemberRole;
  specialization: string;
  activeCases: number;
  rating: number;
  phone: string;
  email: string;
  joinDate: string;
  status: "available" | "busy" | "leave";
}

const MOCK_TEAM: TeamMember[] = [
  { id: "1", name: "سارة المنصور",  role: "managing_partner", specialization: "التجاري والعقاري", activeCases: 8,  rating: 4.9, phone: "٠٥٠‑١١١‑٢٢٢٢", email: "sara@firm.sa",   joinDate: "٢٠١٩", status: "available" },
  { id: "2", name: "تركي العمر",    role: "senior_lawyer",     specialization: "العمالي والمدني",  activeCases: 6,  rating: 4.7, phone: "٠٥٥‑٣٣٣‑٤٤٤٤", email: "turki@firm.sa",  joinDate: "٢٠٢١", status: "busy" },
  { id: "3", name: "نورة الشمري",   role: "lawyer",            specialization: "الأحوال الشخصية", activeCases: 7,  rating: 4.8, phone: "٠٥٦‑٥٥٥‑٦٦٦٦", email: "noura@firm.sa",  joinDate: "٢٠٢٢", status: "available" },
  { id: "4", name: "خالد الحربي",   role: "lawyer",            specialization: "الإداري",          activeCases: 5,  rating: 4.6, phone: "٠٥٩‑٧٧٧‑٨٨٨٨", email: "khalid@firm.sa", joinDate: "٢٠٢٣", status: "available" },
  { id: "5", name: "موضي القرشي",   role: "trainee",    specialization: "متدربة — عام",     activeCases: 2,  rating: 4.4, phone: "٠٥١‑٩٩٩‑٠٠٠٠", email: "mawdi@firm.sa",  joinDate: "٢٠٢٤", status: "busy" },
  { id: "6", name: "ليلى الزهراني", role: "office_admin", specialization: "إدارة المكتب",     activeCases: 0,  rating: 4.9, phone: "٠٥٣‑٢٢٢‑٣٣٣٣", email: "layla@firm.sa",  joinDate: "٢٠٢٠", status: "available" },
  { id: "7", name: "فيصل الدوسري",  role: "trainee",    specialization: "متدرب — التجاري",  activeCases: 1,  rating: 4.3, phone: "٠٥٤‑٤٤٤‑٥٥٥٥", email: "faisal@firm.sa", joinDate: "٢٠٢٤", status: "leave" },
];

const ROLE_CONFIG: Record<MemberRole, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  managing_partner: { label: "الشريك المدير", color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", icon: Star },
  partner: { label: "شريك", color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", icon: Star },
  senior_lawyer: { label: "محام أول", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Gavel },
  lawyer: { label: "محام", color: "text-royal", bg: "bg-royal/10", icon: Gavel },
  trainee: { label: "متدرب", color: "text-blue-500", bg: "bg-blue-500/10", icon: Student },
  legal_secretary: { label: "سكرتير قانوني", color: "text-pink-500", bg: "bg-pink-500/10", icon: Key },
  office_admin: { label: "مدير مكتب", color: "text-purple-500", bg: "bg-purple-500/10", icon: Key },
  finance_manager: { label: "مدير مالي", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Key },
  hr_manager: { label: "HR", color: "text-cyan-500", bg: "bg-cyan-500/10", icon: Users },
  compliance_manager: { label: "امتثال", color: "text-red-500", bg: "bg-red-500/10", icon: Warning },
  external_of_counsel: { label: "Of Counsel", color: "text-orange-500", bg: "bg-orange-500/10", icon: Gavel },
  legal_consultant: { label: "مستشار قانوني", color: "text-teal-500", bg: "bg-teal-500/10", icon: Users },
  in_house_counsel: { label: "مستشار قانوني داخلي", color: "text-sky-500", bg: "bg-sky-500/10", icon: Users },
};

const STATUS_STYLE: Record<TeamMember["status"], { label: string; dot: string }> = {
  available: { label: "متاح",   dot: "bg-emerald-400" },
  busy:      { label: "مشغول",  dot: "bg-amber-400 animate-pulse" },
  leave:     { label: "إجازة",  dot: "bg-blue-400" },
};

// ─── Add Member Modal ────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "managing_partner", label: "الشريك المدير" },
  { value: "partner", label: "شريك" },
  { value: "senior_lawyer", label: "محام أول" },
  { value: "lawyer", label: "محام" },
  { value: "trainee", label: "متدرب" },
  { value: "legal_secretary", label: "سكرتير قانوني" },
  { value: "office_admin", label: "مدير مكتب" },
  { value: "finance_manager", label: "مدير مالي" },
  { value: "hr_manager", label: "HR" },
  { value: "compliance_manager", label: "امتثال" },
  { value: "external_of_counsel", label: "Of Counsel" },
  { value: "legal_consultant", label: "مستشار قانوني" },
  { value: "in_house_counsel", label: "مستشار قانوني داخلي" },
];

const SPEC_OPTIONS = [
  "التجاري والعقاري",
  "العمالي والمدني",
  "الأحوال الشخصية",
  "الإداري",
  "الجنائي",
  "تجاري دولي",
  "إدارة المكتب",
  "عام",
];

interface AddMemberModalProps {
  isDark: boolean;
  onClose: () => void;
  onAdd: (member: TeamMember) => void;
  roleOptions: { value: MemberRole; label: string }[];
}

function AddMemberModal({ isDark, onClose, onAdd, roleOptions }: AddMemberModalProps) {
  const [form, setForm] = useState({
    name: "",
    role: (roleOptions[0]?.value ?? "lawyer") as MemberRole,
    specialization: "",
    email: "",
    phone: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${
    isDark
      ? "bg-zinc-800 border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 focus:border-royal/50"
      : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/60"
  }`;

  const labelCls = `block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`;

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim() || !form.specialization) {
      setError("يرجى ملء الحقول المطلوبة: الاسم والتخصص والبريد الإلكتروني");
      return;
    }
    const newMember: TeamMember = {
      id: `m-${Date.now()}`,
      name: form.name.trim(),
      role: form.role,
      specialization: form.specialization,
      email: form.email.trim(),
      phone: form.phone.trim() || "—",
      activeCases: 0,
      rating: 0,
      joinDate: "٢٠٢٦",
      status: "available",
    };
    setSubmitted(true);
    setTimeout(() => {
      onAdd(newMember);
      onClose();
    }, 1200);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-100"}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-5 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center">
              <UserPlus size={17} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
            </div>
            <div>
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>إضافة عضو جديد</h2>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>سيتلقى دعوة بريد إلكتروني فور الإضافة</p>
            </div>
          </div>
          <button onClick={onClose}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="p-10 text-center"
          >
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3"
            >
              <CheckCircle size={32} weight="fill" className="text-emerald-500" />
            </motion.div>
            <p className={`font-bold text-[15px] ${isDark ? "text-white" : "text-zinc-800"}`}>تمت الإضافة بنجاح</p>
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تم إرسال دعوة البريد لـ {form.email}</p>
            <p className={`text-[11px] mt-2 ${isDark ? "text-amber-300" : "text-amber-600"}`}>Backend-ready: هذا تأكيد واجهة فقط، ولا يوجد إرسال بريد إنتاجي قبل الربط.</p>
          </motion.div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className={labelCls}>الاسم الكامل <span className="text-red-400">*</span></label>
              <input
                className={inputCls}
                placeholder="مثال: محمد الزهراني"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Role */}
            <div>
              <label className={labelCls}>الدور <span className="text-red-400">*</span></label>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as MemberRole }))}
                  className={`${inputCls} appearance-none cursor-pointer`}
                >
                  {roleOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <CaretDown size={13} className="absolute top-1/2 left-3 -translate-y-1/2 pointer-events-none text-zinc-400" />
              </div>
            </div>

            {/* Specialization */}
            <div>
              <label className={labelCls}>التخصص <span className="text-red-400">*</span></label>
              <div className="relative">
                <select
                  value={form.specialization}
                  onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
                  className={`${inputCls} appearance-none cursor-pointer`}
                >
                  <option value="">اختر التخصص</option>
                  {SPEC_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <CaretDown size={13} className="absolute top-1/2 left-3 -translate-y-1/2 pointer-events-none text-zinc-400" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>البريد الإلكتروني <span className="text-red-400">*</span></label>
              <input
                type="email"
                dir="ltr"
                className={inputCls}
                placeholder="example@firm.sa"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={labelCls}>رقم الجوال (اختياري)</label>
              <input
                dir="ltr"
                className={inputCls}
                placeholder="05X-XXX-XXXX"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-[12px] text-red-400 flex items-center gap-1">
                <Warning size={12} /> {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] hover:bg-[#0d5238] transition-colors cursor-pointer shadow-md"
              >
                <UserPlus size={15} /> إضافة العضو
              </motion.button>
              <button
                onClick={onClose}
                className={`px-4 py-3 rounded-xl font-bold text-[13px] cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FirmTeamPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const currentRole = user.affiliation?.entityType === "firm" ? user.affiliation.role : "managing_partner";
  const canManageRoles = user.userType === "admin" || ["managing_partner", "office_admin"].includes(currentRole);
  const canInviteMembers = user.userType === "admin" || ["managing_partner", "office_admin", "hr_manager"].includes(currentRole);
  const inviteRoleOptions = ROLE_OPTIONS.filter((option) => {
    if (user.userType === "admin" || currentRole === "managing_partner") return true;
    if (currentRole === "office_admin") return !["managing_partner", "partner"].includes(option.value);
    if (currentRole === "hr_manager") return ["trainee", "legal_secretary", "hr_manager"].includes(option.value);
    return false;
  });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<MemberRole | "all">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>(MOCK_TEAM);
  const [toast, setToast] = useState("فريق شركة المحاماة Backend-ready: الإضافات والخيارات هنا محلية فقط حتى ربط Team/RBAC API.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = team.filter(m => {
    const matchRole = roleFilter === "all"
      || (roleFilter === "partner" && ["managing_partner", "partner"].includes(m.role))
      || (roleFilter === "office_admin" && ["office_admin", "finance_manager", "hr_manager", "compliance_manager"].includes(m.role))
      || m.role === roleFilter;
    const matchSearch = !search || m.name.includes(search) || m.specialization.includes(search);
    return matchRole && matchSearch;
  });

  const handleAddMember = (member: TeamMember) => {
    setTeam(prev => [member, ...prev]);
    setToast(`تمت إضافة ${member.name} محليا فقط. إرسال الدعوة الحقيقي ينتظر Team API وخدمة البريد وسجل التدقيق.`);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            فريق المكتب
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {team.length} أعضاء — {team.filter(m => m.status === "available").length} متاحون الآن
          </p>
        </div>
        <div className="flex gap-2">
          {canManageRoles && (
            <Link href="/dashboard/firm/team/roles" className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Key size={15} />
              الأدوار والصلاحيات
            </Link>
          )}
          {canInviteMembers && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors cursor-pointer shadow-md"
            >
              <Plus size={15} weight="bold" />
              إضافة عضو
            </motion.button>
          )}
        </div>
      </motion.div>

      <div className={`rounded-2xl border px-4 py-3 text-[12px] ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        {toast}
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو التخصص..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5">
          {([
            { key: "all",       label: "الكل",    count: team.length },
            { key: "partner",   label: "شركاء",   count: team.filter(m => m.role === "partner" || m.role === "managing_partner").length },
            { key: "senior_lawyer", label: "محامون أول",  count: team.filter(m => m.role === "senior_lawyer").length },
            { key: "lawyer", label: "محامون",  count: team.filter(m => m.role === "lawyer").length },
            { key: "trainee",   label: "متدربون", count: team.filter(m => m.role === "trainee").length },
            { key: "office_admin", label: "إدارة", count: team.filter(m => ["office_admin", "finance_manager", "hr_manager", "compliance_manager"].includes(m.role)).length },
          ] as { key: MemberRole | "all"; label: string; count: number }[]).map(f => (
            <button key={f.key} onClick={() => setRoleFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${roleFilter === f.key
                ? "bg-royal text-white border-royal"
                : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {f.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${roleFilter === f.key ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Team grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className={`md:col-span-3 ${card} p-12 text-center`}>
            <Users size={36} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد نتائج مطابقة</p>
          </div>
        ) : filtered.map((m, i) => {
          const role   = ROLE_CONFIG[m.role];
          const status = STATUS_STYLE[m.status];
          const RoleIcon = role.icon;
          return (
            <motion.div key={m.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`group ${card} p-5 hover:border-royal/20 transition-all`}>

              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-sm ${m.role === "partner" ? "bg-gradient-to-br from-[#0B3D2E] to-[#1a5c45]" : "bg-royal"}`}>
                      {m.name.charAt(0)}
                    </div>
                    <span className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 ${isDark ? "border-zinc-900" : "border-white"} ${status.dot}`} />
                  </div>
                  <div>
                    <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{m.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${role.bg} ${role.color}`}>
                        <RoleIcon size={9} />
                        {role.label}
                      </span>
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{status.label}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setToast(`خيارات ${m.name} جاهزة للباك إند فقط. تغيير الدور/التعطيل/إعادة الدعوة تحتاج Team API وAuditEvent.`)}
                  className={`p-1.5 rounded-lg cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"}`}
                >
                  <DotsThree size={16} weight="bold" />
                </button>
              </div>

              {/* Specialization */}
              <p className={`text-[12px] mb-3 pb-3 border-b ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                {m.specialization}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div>
                  <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{m.activeCases}</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>قضية نشطة</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${isDark ? "text-amber-400" : "text-amber-500"}`}>
                    {m.rating > 0 ? m.rating : "—"} {m.rating > 0 && <span className="text-[10px]">★</span>}
                  </p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>التقييم</p>
                </div>
                <div>
                  <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{m.joinDate}</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>منذ</p>
                </div>
              </div>

              {/* Contact */}
              <div className={`flex items-center gap-3 text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                <div className="flex items-center gap-1">
                  <Phone size={10} />
                  <span dir="ltr" className={isDark ? "text-zinc-500" : "text-slate-400"}>{m.phone}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Envelope size={10} />
                  <span dir="ltr" className={isDark ? "text-zinc-500" : "text-slate-400"}>{m.email}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddModal && canInviteMembers && (
          <AddMemberModal
            isDark={isDark}
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddMember}
            roleOptions={inviteRoleOptions}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
