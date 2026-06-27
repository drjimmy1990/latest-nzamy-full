"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Users, MagnifyingGlass, Check, X, Warning, Shield,
  Clock, CheckCircle, Pencil, Trash, Crown, User,
  Buildings, Gavel, Robot, ArrowsDownUp, Plus, CaretDown,
  SealCheck, LockSimple, DotsThree, Eye, SpinnerGap, ShieldCheck
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Data ─────────────────────────────────────────────────────────────

type UserRole = "lawyer" | "firm" | "judge" | "admin";
type UserStatus = "active" | "suspended" | "pending" | "trial";
type Plan = "free" | "pro" | "max" | "enterprise";

interface PlatformUser {
  id: string;
  display_name: string;
  display_name_en: string;
  email: string;
  phone: string | null;
  user_type: string;
  avatar_url: string | null;
  verified_at: string | null;
  created_at: string;
  subscription: {
    id: string;
    tier: string;
    plan_id: string;
    status: string;
    billing_cycle: string;
    current_period_end: string | null;
  } | null;
  credit_balance: number;
}

interface UsersApiResponse {
  data: PlatformUser[];
  total: number;
  page: number;
  limit: number;
}

function formatArabicDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function mapRole(userType: string): UserRole {
  const map: Record<string, UserRole> = { lawyer: "lawyer", firm: "firm", judge: "judge", admin: "admin" };
  return map[userType] ?? "lawyer";
}

function mapPlan(tier?: string): Plan {
  const map: Record<string, Plan> = { free: "free", pro: "pro", max: "max", enterprise: "enterprise" };
  return map[tier ?? "free"] ?? "free";
}

function mapStatus(subStatus?: string, verifiedAt?: string | null): UserStatus {
  if (subStatus === "suspended") return "suspended";
  if (subStatus === "trialing" || subStatus === "trial") return "trial";
  if (!verifiedAt) return "pending";
  return "active";
}

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

function UserRow({
  user,
  isDark,
  card,
  onUpdate,
}: {
  user: PlatformUser;
  isDark: boolean;
  card: string;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const uRole   = mapRole(user.user_type);
  const uStatus = mapStatus(user.subscription?.status, user.verified_at);
  const uPlan   = mapPlan(user.subscription?.tier);
  const role    = ROLE_CFG[uRole];
  const status  = STATUS_CFG[uStatus];
  const plan    = PLAN_CFG[uPlan];
  const RoleIcon = role.icon;

  const handleVerify = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: true }),
      });
      if (!res.ok) throw new Error("فشل التحقق من المستخدم");
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm("هل أنت متأكد من تعليق/إيقاف هذا الحساب؟ سيتم إلغاء أي اشتراك نشط.")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });
      if (!res.ok) throw new Error("فشل إيقاف المستخدم");
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("⚠️ تحذير: هل أنت متأكد من حذف هذا المستخدم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("فشل حذف المستخدم");
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setActionLoading(false);
    }
  };

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
          <p className={`text-[14px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{user.display_name || user.email}</p>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${status.bg} ${status.color}`}>
            {status.label}
          </span>
          <span className={`text-[9px] font-bold ${plan.color}`}>{plan.label}</span>
        </div>
        <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{user.email}</p>
        <div className={`flex items-center gap-3 mt-1 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          <span><Robot size={9} className="inline me-1" />{user.credit_balance.toLocaleString()} طلب AI</span>
          <span>انضم: {formatArabicDate(user.created_at)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {actionLoading ? (
          <SpinnerGap size={14} className="animate-spin text-zinc-400" />
        ) : (
          <>
            {uStatus === "pending" && (
              <button onClick={handleVerify}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[11px] font-bold border border-emerald-500/20 hover:bg-emerald-500/20">
                <Check size={11} weight="bold" /> تحقق
              </button>
            )}
            {uStatus === "active" && (
              <button onClick={handleSuspend}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-[11px] font-bold border border-red-500/20 hover:bg-red-500/20">
                <LockSimple size={11} /> إيقاف
              </button>
            )}
            {uStatus === "suspended" && (
              <button onClick={handleVerify}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[11px] font-bold border border-emerald-500/20 hover:bg-emerald-500/20">
                <CheckCircle size={11} /> تفعيل
              </button>
            )}
          </>
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
                  { label: "عرض الملف", icon: Eye, onClick: () => router.push(`/dashboard/admin/users/${user.id}`) },
                  { label: "تعديل الخطة", icon: Crown, onClick: () => router.push(`/dashboard/admin/users/${user.id}?tab=subscription`) },
                  { label: "حذف المستخدم", icon: Trash, danger: true, onClick: handleDelete },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} onClick={() => { setMenuOpen(false); item.onClick(); }}
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

  const [users, setUsers]           = useState<PlatformUser[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const LIMIT = 20;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const fetchUsers = useCallback(async (pageNum: number, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(LIMIT));
      if (search) params.set("search", search);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (planFilter !== "all") params.set("tier", planFilter);

      const res = await fetch(`/api/v1/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error(`خطأ في تحميل البيانات (${res.status})`);
      const json: UsersApiResponse = await res.json();

      setUsers(prev => append ? [...prev, ...json.data] : json.data);
      setTotal(json.total);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, roleFilter, statusFilter, planFilter]);

  // Fetch on filter/search change — reset to page 1
  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchUsers(1);
    }, search ? 400 : 0);
    return () => clearTimeout(debounce);
  }, [fetchUsers]);

  const stats = {
    total:     total,
    active:    users.filter(u => mapStatus(u.subscription?.status, u.verified_at) === "active").length,
    pending:   users.filter(u => mapStatus(u.subscription?.status, u.verified_at) === "pending").length,
    suspended: users.filter(u => mapStatus(u.subscription?.status, u.verified_at) === "suspended").length,
  };

  const hasMore = users.length < total;

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
        {/* Error state */}
        {error && (
          <div className={`${card} p-6 text-center border-red-500/20`}>
            <Warning size={28} weight="duotone" className="mx-auto mb-2 text-red-500" />
            <p className={`text-[13px] text-red-500 mb-3`}>{error}</p>
            <button onClick={() => fetchUsers(1)}
              className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-[12px] font-bold border border-red-500/20 hover:bg-red-500/20">
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${card} p-4 flex items-center gap-4 animate-pulse`}>
              <div className={`w-10 h-10 rounded-xl flex-shrink-0 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-4 rounded-lg w-1/3 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`} />
                <div className={`h-3 rounded-lg w-1/2 ${isDark ? "bg-zinc-800/60" : "bg-slate-50"}`} />
                <div className={`h-2.5 rounded-lg w-2/5 ${isDark ? "bg-zinc-800/40" : "bg-slate-50"}`} />
              </div>
              <div className={`w-16 h-7 rounded-lg flex-shrink-0 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`} />
            </div>
          ))
        )}

        {/* Empty state */}
        {!loading && !error && users.length === 0 && (
          <div className={`${card} p-8 text-center`}>
            <Users size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد نتائج مطابقة</p>
          </div>
        )}

        {!loading && !error && users.map((u, i) => (
          <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <UserRow user={u} isDark={isDark} card={card} onUpdate={() => fetchUsers(1, false)} />
          </motion.div>
        ))}


        {/* Load more pagination */}
        {!loading && !error && hasMore && (
          <div className="flex justify-center pt-2">
            <button onClick={() => fetchUsers(page + 1, true)} disabled={loadingMore}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-[12px] font-bold transition-all ${
                isDark
                  ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              }`}>
              {loadingMore ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  جاري التحميل...
                </>
              ) : (
                <>
                  <ArrowsDownUp size={13} />
                  تحميل المزيد ({users.length} من {total})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
