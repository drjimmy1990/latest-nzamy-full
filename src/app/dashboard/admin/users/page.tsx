"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Users, MagnifyingGlass, Check, X, Warning, Question,
  Clock, CheckCircle, Pencil, Trash, Crown, User,
  Buildings, Gavel, Robot, ArrowsDownUp, Plus, CaretDown,
  SealCheck, LockSimple, DotsThree, Eye, SpinnerGap, ShieldCheck,
  Scales, Storefront, Bank, Handshake, Stamp
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { DB_USER_TYPES, isDbUserType, type DbUserType } from "@/lib/auth/userTypes";

// ─── Types & Data ─────────────────────────────────────────────────────────────

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
  /**
   * How many profiles carry each `user_type`, narrowed by the search box alone.
   *
   * Optional because the route only computes it when asked with
   * `include_counts=1` (this page asks; the entitlements screen, the other
   * caller of that route, does not). Absent is not zero — see `roleCounts`.
   */
  counts?: Partial<Record<DbUserType, number>>;
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

type RoleCfg = { label: string; color: string; bg: string; icon: React.ElementType };

/**
 * Badge, colour and icon for every `profiles.user_type`.
 *
 * Typed as a total `Record<DbUserType, RoleCfg>` — the whole point of the type.
 * What stood here was a four-key map over a hand-written
 * `"lawyer" | "firm" | "judge" | "admin"`, and it was wrong in both directions
 * at once:
 *
 *   - Six real account types had no entry. Because the `mapRole` that fed it
 *     ended in `?? "lawyer"`, a `corporate`, `individual`, `micro`, `provider`,
 *     `government` or `ngo` account did not render as unlabelled — it rendered
 *     as «محامي» with a gavel in a blue tile. Silently mislabelled, which is
 *     worse than blank, and it is why this was reported as a bug rather than
 *     as a gap.
 *
 *   - `judge` was not an account type at all. It is a `government_profiles.role`
 *     (supabase/migrations/20260603_phase1_002_entities.sql:408) and is absent
 *     from the `profiles.user_type` CHECK constraint, so no profile can carry
 *     it and its filter chip could only ever return an empty list.
 *
 * Keying off `DbUserType` closes both: a tenth value added to `DB_USER_TYPES`
 * is a compile error here, and a value that is not one of the nine cannot be
 * written in. `userTypes.test.ts` already pins that list against the CHECK
 * constraint, so the badge vocabulary now inherits that guarantee.
 *
 * The labels are those of the account detail page
 * (src/app/dashboard/admin/users/[id]/page.tsx `ROLE_MAP`), copied word for
 * word and not re-worded. That page is one click from every row of this list,
 * and a badge that reads «شركة» over a header that reads «شركة/مؤسسة» would
 * leave an admin wondering whether they had opened the right account. They
 * cannot be imported from each other — both are `"use client"` page modules —
 * so this is a deliberate copy, and the two must be edited together.
 */
const ROLE_CFG: Record<DbUserType, RoleCfg> = {
  individual: { label: "عميل فرد",        color: "text-sky-500",    bg: "bg-sky-500/10",    icon: User },
  lawyer:     { label: "محامي",           color: "text-blue-500",   bg: "bg-blue-500/10",   icon: Gavel },
  firm:       { label: "مكتب محاماة",   color: "text-violet-500", bg: "bg-violet-500/10", icon: Scales },
  corporate:  { label: "شركة",            color: "text-indigo-500", bg: "bg-indigo-500/10", icon: Buildings },
  micro:      { label: "منشأة صغيرة",    color: "text-orange-500", bg: "bg-orange-500/10", icon: Storefront },
  provider:   { label: "مزود خدمة",      color: "text-teal-500",   bg: "bg-teal-500/10",   icon: Stamp },
  government: { label: "جهة حكومية",     color: "text-amber-500",  bg: "bg-amber-500/10",  icon: Bank },
  ngo:        { label: "منظمة غير ربحية", color: "text-pink-500",   bg: "bg-pink-500/10",   icon: Handshake },
  admin:      { label: "مسؤول",           color: "text-red-500",    bg: "bg-red-500/10",    icon: Crown },
};

/**
 * What a row renders when `user_type` is none of the nine.
 *
 * The CHECK constraint says this cannot happen, and that is exactly why it gets
 * an honest badge instead of a guess: if it ever does happen — a constraint
 * dropped in a migration, a row written by a service-role script that bypasses
 * it — the admin looking at the row is the only person who can act on it, and
 * they can only act if the screen says so. The previous `?? "lawyer"` chose the
 * opposite and made such a row indistinguishable from a real lawyer.
 *
 * Zinc rather than a gray-* token on purpose: globals.css redefines
 * gray-50/100/200 as dark SURFACES, so `text-gray-100` on a badge is invisible
 * in dark mode. `text-zinc-400` reads in both themes.
 */
const UNKNOWN_ROLE_CFG: RoleCfg = {
  label: "نوع غير معروف",
  color: "text-zinc-400",
  bg: "bg-zinc-500/10",
  icon: Question,
};

/** The badge for a stored `user_type`, never `undefined`, never a guess. */
function roleCfgFor(userType: string): RoleCfg {
  return isDbUserType(userType) ? ROLE_CFG[userType] : UNKNOWN_ROLE_CFG;
}

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

  const uStatus = mapStatus(user.subscription?.status, user.verified_at);
  const uPlan   = mapPlan(user.subscription?.tier);
  const role    = roleCfgFor(user.user_type);
  const status  = STATUS_CFG[uStatus];
  const plan    = PLAN_CFG[uPlan];
  const RoleIcon = role.icon;
  const roleKnown = isDbUserType(user.user_type);

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

      {/* Avatar — the account-type tile. `title` carries the raw stored value so
          an unknown type is not just flagged but identifiable. */}
      <div title={roleKnown ? role.label : `${role.label}: ${user.user_type}`}
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${role.bg}`}>
        <RoleIcon size={18} weight="duotone" className={role.color} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className={`text-[14px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{user.display_name || user.email}</p>
          {/* The account type in words. The tile above carried it as an icon
              alone, which was already a guess to read with four types and is
              unreadable with nine — a bank and a handshake at 18px do not tell
              a جهة حكومية from a جمعية. */}
          <span title={roleKnown ? undefined : user.user_type}
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${role.bg} ${role.color}`}>
            {role.label}
          </span>
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
  const [roleFilter, setRoleFilter] = useState<DbUserType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<Plan | "all">("all");

  const [users, setUsers]           = useState<PlatformUser[]>([]);
  /**
   * Per-type totals for the chip bar, or `null` before the first response.
   *
   * `null` and `0` are kept apart on purpose: a chip shows no number until the
   * server has actually counted, rather than flashing «٠» for every type while
   * the first request is in flight and then correcting itself.
   */
  const [roleCounts, setRoleCounts] = useState<Partial<Record<DbUserType, number>> | null>(null);
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
      // Counts are for the chip bar, which is not paginated — asking for them
      // again on "load more" would be nine redundant COUNT(*)s for numbers that
      // have not moved.
      if (!append) params.set("include_counts", "1");

      const res = await fetch(`/api/v1/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error(`خطأ في تحميل البيانات (${res.status})`);
      const json: UsersApiResponse = await res.json();

      setUsers(prev => append ? [...prev, ...json.data] : json.data);
      setTotal(json.total);
      if (json.counts) setRoleCounts(json.counts);
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

  /**
   * The number on the «الكل» chip: the sum of the nine per-type counts, and
   * deliberately NOT `total`.
   *
   * `total` is the count for the request that was actually made, so the moment
   * a type chip is selected it becomes that type's count — an «الكل» chip
   * wearing it would appear to say the platform had shrunk to the size of
   * whatever you just clicked. The per-type counts come back narrowed by the
   * search box alone and do not move when a chip is selected, so their sum
   * stays put while an admin clicks between types. It is the whole matching
   * set: `profiles.user_type` is NOT NULL and CHECK-constrained to these nine,
   * so no row can be outside the sum.
   */
  const totalAcrossRoles = roleCounts
    ? Object.values(roleCounts).reduce<number>((sum, n) => sum + (n ?? 0), 0)
    : null;

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

      {/* Filters — search + status on one line, the account-type chips on their
          own. Ten chips share a row with the search box far worse than four
          did; giving them a line stops the status control being shoved off the
          edge on a narrow screen. */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
            <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..."
              className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as UserStatus | "all")}
            className={`px-3 py-2 rounded-xl border text-[11px] font-bold outline-none cursor-pointer ${isDark ? "bg-zinc-900 border-white/[0.06] text-zinc-400" : "bg-white border-slate-100 text-slate-500"}`}>
            <option value="all">الحالة: الكل</option>
            <option value="active">نشط</option>
            <option value="pending">انتظار تحقق</option>
            <option value="trial">تجربة</option>
            <option value="suspended">موقوف</option>
          </select>
        </div>

        {/* Account-type chips: one per `profiles.user_type`, plus «الكل».
            Driven off `DB_USER_TYPES` rather than a hand-written list, so a type
            added to the CHECK constraint appears here without anyone
            remembering to add it — the four-item list this replaced is what let
            six real types go unfilterable and a seventh, `judge`, exist here
            and nowhere else.

            Scrolls sideways below `sm` and wraps above it: nine chips plus
            «الكل» is two or three rows on a phone, which pushes the whole list
            below the fold. `flex-shrink-0` keeps each chip its natural width
            inside the scroller instead of being squeezed to an unreadable
            sliver. The container is inside the page's `dir="rtl"`, so the
            scroller starts at the right — «الكل» and «عميل فرد» are what a
            phone shows without scrolling. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-x-visible sm:pb-0">
          {([{ value: "all" as const, label: "الكل" }, ...DB_USER_TYPES.map(t => ({ value: t, label: ROLE_CFG[t].label }))]).map(f => {
            const active = roleFilter === f.value;
            // `undefined` until the first response has carried counts, which is
            // why the badge is conditional rather than defaulting to 0.
            const n = f.value === "all" ? totalAcrossRoles : roleCounts?.[f.value];
            return (
              <button key={f.value} onClick={() => setRoleFilter(f.value)}
                className={`flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                  active
                    ? "bg-royal text-white border-royal"
                    : isDark
                      ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800/60"
                      : "border-slate-100 text-slate-500 hover:bg-slate-50"
                }`}>
                {f.label}
                {/* zinc-500 in dark, not the zinc-600 the row-meta line below
                    uses: this is a number an admin reads off the chip, not
                    decoration. No gray-* token anywhere on this bar —
                    globals.css redefines gray-50/100/200 as dark SURFACES, so
                    text in those goes invisible in dark mode. */}
                {n !== undefined && n !== null && (
                  <span className={`text-[10px] font-mono ${active ? "text-white/70" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
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
