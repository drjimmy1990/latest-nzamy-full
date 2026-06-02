"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MagnifyingGlass, Check, X, Warning, Shield,
  Clock, CheckCircle, Pencil, Trash, Crown, User,
  Buildings, Gavel, Robot, ArrowsDownUp, Plus, CaretDown,
  SealCheck, LockSimple, DotsThree, Eye,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Data ─────────────────────────────────────────────────────────────

type UserRole = "lawyer" | "firm" | "judge" | "admin";
type UserStatus = "active" | "suspended" | "pending" | "trial";
type Plan = "free" | "pro" | "max" | "enterprise";

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  plan: Plan;
  joined: string;
  lastActive: string;
  aiCredits: number;
  cases: number;
}

const USERS: PlatformUser[] = [
  { id: "U001", name: "أحمد القحطاني",     email: "ahmed@lawfirm.sa",      role: "lawyer",  status: "active",    plan: "pro",        joined: "١ يناير ٢٠٢٤",   lastActive: "منذ ٣ دقائق",   aiCredits: 340, cases: 18 },
  { id: "U002", name: "شركة الأفق القانونية", email: "info@ufq-law.sa",    role: "firm",    status: "active",    plan: "enterprise", joined: "١٥ يناير ٢٠٢٤",  lastActive: "منذ ساعة",     aiCredits: 2400, cases: 87 },
  { id: "U003", name: "نورة العتيبي",       email: "noura@legal.sa",        role: "lawyer",  status: "trial",     plan: "free",       joined: "١ أبريل ٢٠٢٤",   lastActive: "اليوم",         aiCredits: 20, cases: 2 },
  { id: "U004", name: "خالد الشمري",        email: "khalid@courts.sa",      role: "judge",   status: "active",    plan: "pro",        joined: "١٠ فبراير ٢٠٢٤",  lastActive: "أمس",           aiCredits: 150, cases: 0 },
  { id: "U005", name: "سعد المالكي",        email: "saad@mlaw.sa",          role: "lawyer",  status: "suspended", plan: "pro",        joined: "٢٠ مارس ٢٠٢٤",    lastActive: "منذ أسبوع",    aiCredits: 0, cases: 5 },
  { id: "U006", name: "ريم الدوسري",         email: "reem@lawyers.sa",       role: "lawyer",  status: "pending",   plan: "free",       joined: "٣ أبريل ٢٠٢٤",   lastActive: "لم يتم",        aiCredits: 0, cases: 0 },
  { id: "U007", name: "مجموعة رأس المال",  email: "admin@rasmal-law.sa",   role: "firm",    status: "active",    plan: "max",        joined: "١ مارس ٢٠٢٤",     lastActive: "منذ ٣٠ دقيقة", aiCredits: 800, cases: 34 },
  { id: "U008", name: "عبدالله العمري",     email: "aomari@justice.sa",     role: "lawyer",  status: "active",    plan: "max",        joined: "٥ فبراير ٢٠٢٤",   lastActive: "منذ يومين",    aiCredits: 420, cases: 22 },
];

const ROLE_CFG: Record<UserRole, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  lawyer:  { label: "محامي",          color: "text-blue-500",   bg: "bg-blue-500/10",   icon: Gavel },
  firm:    { label: "مكتب محاماة",  color: "text-violet-500", bg: "bg-violet-500/10", icon: Buildings },
  judge:   { label: "قاضٍ",           color: "text-amber-500",  bg: "bg-amber-500/10",  icon: Shield },
  admin:   { label: "مدير",           color: "text-red-500",    bg: "bg-red-500/10",    icon: Crown },
};

const STATUS_CFG: Record<UserStatus, { label: string; color: string; bg: string }> = {
  active:    { label: "نشط",          color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  suspended: { label: "موقوف",        color: "text-red-500",     bg: "bg-red-500/10 border-red-500/20" },
  pending:   { label: "بانتظار التحقق", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  trial:     { label: "تجربة مجانية", color: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/20" },
};

const PLAN_CFG: Record<Plan, { label: string; color: string }> = {
  free:       { label: "مجاني",      color: "text-slate-400" },
  pro:        { label: "Pro",        color: "text-blue-500" },
  max:        { label: "Max",        color: "text-violet-500" },
  enterprise: { label: "Enterprise", color: "text-amber-500" },
};

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({ user, isDark, card }: { user: PlatformUser; isDark: boolean; card: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const role   = ROLE_CFG[user.role];
  const status = STATUS_CFG[user.status];
  const plan   = PLAN_CFG[user.plan];
  const RoleIcon = role.icon;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all relative`}>

      {/* Avatar */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${role.bg}`}>
        <RoleIcon size={18} weight="duotone" className={role.color} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className={`text-[14px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{user.name}</p>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${status.bg} ${status.color}`}>
            {status.label}
          </span>
          <span className={`text-[9px] font-bold ${plan.color}`}>{plan.label}</span>
        </div>
        <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{user.email}</p>
        <div className={`flex items-center gap-3 mt-1 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          <span><Robot size={9} className="inline me-1" />{user.aiCredits.toLocaleString()} طلب AI</span>
          <span>⚖️ {user.cases} قضية</span>
          <span>آخر نشاط: {user.lastActive}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {user.status === "pending" && (
          <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[11px] font-bold border border-emerald-500/20 hover:bg-emerald-500/20">
            <Check size={11} weight="bold" /> تحقق
          </button>
        )}
        {user.status === "active" && (
          <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-[11px] font-bold border border-red-500/20 hover:bg-red-500/20">
            <LockSimple size={11} /> إيقاف
          </button>
        )}
        {user.status === "suspended" && (
          <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[11px] font-bold border border-emerald-500/20 hover:bg-emerald-500/20">
            <CheckCircle size={11} /> تفعيل
          </button>
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center border ${isDark ? "border-white/[0.06] text-zinc-500 hover:bg-zinc-800" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}>
            <DotsThree size={14} weight="bold" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className={`absolute left-0 top-9 z-10 min-w-[140px] rounded-xl border shadow-xl overflow-hidden ${isDark ? "bg-zinc-800 border-white/[0.08]" : "bg-white border-slate-200"}`}>
                {[
                  { label: "عرض الملف", icon: Eye },
                  { label: "تعديل الخطة", icon: Crown },
                  { label: "رسالة نظام", icon: Pencil },
                  { label: "حذف المستخدم", icon: Trash, danger: true },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2 w-full px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                        item.danger
                          ? "text-red-500 hover:bg-red-500/10"
                          : isDark ? "text-zinc-300 hover:bg-zinc-700" : "text-slate-600 hover:bg-slate-50"
                      }`}>
                      <Icon size={12} /> {item.label}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { isDark } = useTheme();
  const [search, setSearch]         = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<Plan | "all">("all");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = useMemo(() =>
    USERS.filter(u => {
      const ms = roleFilter === "all"   || u.role === roleFilter;
      const mt = statusFilter === "all" || u.status === statusFilter;
      const mp = planFilter === "all"   || u.plan === planFilter;
      const mq = !search || u.name.includes(search) || u.email.includes(search) || u.id.includes(search);
      return ms && mt && mp && mq;
    })
  , [search, roleFilter, statusFilter, planFilter]);

  const stats = {
    total:     USERS.length,
    active:    USERS.filter(u => u.status === "active").length,
    pending:   USERS.filter(u => u.status === "pending").length,
    suspended: USERS.filter(u => u.status === "suspended").length,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            إدارة المستخدمين
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {stats.total} مستخدم · {stats.active} نشط · {stats.pending} بانتظار التحقق
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={15} weight="bold" /> مستخدم جديد
        </button>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "إجمالي",       value: stats.total,     color: "text-royal",       bg: "bg-royal/8",        icon: Users },
          { label: "نشط",          value: stats.active,    color: "text-emerald-500", bg: "bg-emerald-500/8",  icon: CheckCircle },
          { label: "انتظار تحقق", value: stats.pending,   color: "text-amber-500",   bg: "bg-amber-500/8",    icon: Clock },
          { label: "موقوف",        value: stats.suspended, color: "text-red-500",     bg: "bg-red-500/8",      icon: Warning },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-4 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${k.bg}`}>
                <Icon size={17} weight="duotone" className={k.color} />
              </div>
              <div>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
                <p className={`text-[18px] font-bold font-mono ${k.color}`}>{k.value}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { label: "الكل", value: "all" as const },
            { label: "محامي", value: "lawyer" as const },
            { label: "مكتب", value: "firm" as const },
            { label: "قاضٍ", value: "judge" as const },
          ]).map(f => (
            <button key={f.value} onClick={() => setRoleFilter(f.value)}
              className={`px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${roleFilter === f.value ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
              {f.label}
            </button>
          ))}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as UserStatus | "all")}
            className={`px-3 py-2 rounded-xl border text-[11px] font-bold outline-none cursor-pointer ${isDark ? "bg-zinc-900 border-white/[0.06] text-zinc-400" : "bg-white border-slate-100 text-slate-500"}`}>
            <option value="all">الحالة: الكل</option>
            <option value="active">نشط</option>
            <option value="pending">انتظار تحقق</option>
            <option value="trial">تجربة</option>
            <option value="suspended">موقوف</option>
          </select>
        </div>
      </div>

      {/* Pending alerts */}
      {stats.pending > 0 && (
        <div className={`${card} p-4 flex items-center gap-3 border-amber-500/20 bg-amber-500/[0.03]`}>
          <Clock size={16} weight="duotone" className="text-amber-500 flex-shrink-0" />
          <p className={`flex-1 text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            يوجد <strong>{stats.pending} مستخدم</strong> ينتظر التحقق من هويته الوظيفية
          </p>
          <button onClick={() => setStatusFilter("pending")}
            className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 text-[11px] font-bold border border-amber-500/20 hover:bg-amber-500/20">
            عرضهم
          </button>
        </div>
      )}

      {/* Users list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <Users size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد نتائج مطابقة</p>
          </div>
        ) : (
          filtered.map((u, i) => (
            <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <UserRow user={u} isDark={isDark} card={card} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
