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
import { countPhraseAr, countTileAr, type ArabicCountForms } from "@/lib/services/arabicCount";

/** «مستخدم» — shot 07 printed «10 مستخدم», the singular for a count of ten. */
const USERS_COUNT: ArabicCountForms = {
  zero: "لا مستخدمين",
  one: "مستخدم واحد",
  two: "مستخدمان",
  few: "مستخدمين",
  many: "مستخدماً",
};
import { DB_USER_TYPES, isDbUserType, type DbUserType } from "@/lib/auth/userTypes";

// ─── Types & Data ─────────────────────────────────────────────────────────────

type UserStatus = "active" | "suspended" | "pending" | "trial";

/**
 * The five values `subscriptions.tier` can actually hold.
 *
 * From the CHECK constraint —
 * supabase/migrations/20260603_phase1_003_subscriptions_billing.sql:10 —
 * `check (tier in ('free', 'ai', 'pro', 'corp', 'max'))`, and the same five
 * are the only tiers the `subscription_plans` seed writes.
 *
 * What stood here was `"free" | "pro" | "max" | "enterprise"`, wrong in both
 * directions at once and in exactly the way `ROLE_CFG` below documents for
 * `user_type`:
 *
 *   - `ai` and `corp` had no entry. `mapPlan` ended in `?? "free"`, so a
 *     lawyer paying 99 ﷼/month on the الذكية plan and a firm paying 999 ﷼ on
 *     المؤسسية both rendered as «مجاني» — the two mid-tiers of the price list,
 *     shown to the admin as non-paying accounts.
 *
 *   - `enterprise` is not a subscription tier at all. It is a `UserTier` in
 *     the auth metadata (src/hooks/useUser.ts) and is absent from the CHECK
 *     constraint, so no subscription row can carry it and its «Enterprise»
 *     badge could never render.
 *
 * The labels are the plans' own `name_ar` from that seed, not re-worded, so
 * the badge an admin reads matches the plan name on the invoice.
 */
const PLAN_TIERS = ["free", "ai", "pro", "corp", "max"] as const;
type PlanTier = (typeof PLAN_TIERS)[number];

function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);
}

/** The filter value for a profile with no `subscriptions` row at all. */
const NO_PLAN = "none" as const;
type PlanFilter = "all" | PlanTier | typeof NO_PLAN;

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

/**
 * Which plan bucket a row belongs to, for both the badge and the filter.
 *
 * `NO_PLAN` — no `subscriptions` row — is deliberately its own value and NOT
 * folded into «المجانية». The two are different facts: one account was put on
 * the free plan, the other has never had a subscription row written for it,
 * and on this platform that is most accounts. The old `?? "free"` printed the
 * first sentence about the second case.
 *
 * `null` is a tier the CHECK constraint says cannot exist. It matches no
 * filter but «الكل», so a row carrying one can only ever be found by looking
 * at the whole list — which is correct: it is unclassifiable, and hiding it
 * under a plan chip would be a guess.
 */
function planKeyOf(user: PlatformUser): PlanTier | typeof NO_PLAN | null {
  const tier = user.subscription?.tier;
  if (tier === undefined || tier === null) return NO_PLAN;
  return isPlanTier(tier) ? tier : null;
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

/** Badge label and colour per real tier — `name_ar` from the plan seed. */
const PLAN_CFG: Record<PlanTier, { label: string; color: string }> = {
  free: { label: "المجانية",    color: "text-slate-400" },
  ai:   { label: "الذكية",      color: "text-sky-500" },
  pro:  { label: "الاحترافية",  color: "text-blue-500" },
  corp: { label: "المؤسسية",    color: "text-indigo-500" },
  max:  { label: "الحد الأقصى", color: "text-violet-500" },
};

/** Every value the plan control can hold, in the order it lists them. */
const PLAN_FILTERS: { value: PlanFilter; label: string }[] = [
  { value: "all", label: "الخطة: الكل" },
  ...PLAN_TIERS.map((t) => ({ value: t as PlanFilter, label: PLAN_CFG[t].label })),
  { value: NO_PLAN, label: "بدون اشتراك" },
];

/**
 * The plan badge on a row. Never a default, for the reason spelled out on
 * `UNKNOWN_ROLE_CFG` above: a bucket an account was silently swept into reads
 * exactly like a bucket it was put in, and only the admin looking at the row
 * can act on the difference. Zinc, not a gray-* token — globals.css redefines
 * gray-50/100/200 as dark SURFACES.
 */
function planBadgeFor(user: PlatformUser): { label: string; color: string; title?: string } {
  const key = planKeyOf(user);
  if (key === NO_PLAN) {
    return { label: "بدون اشتراك", color: "text-zinc-400", title: "لا يوجد سجل اشتراك لهذا الحساب" };
  }
  if (key === null) {
    return {
      label: "خطة غير معروفة",
      color: "text-zinc-400",
      title: `قيمة tier غير معروفة: ${String(user.subscription?.tier)}`,
    };
  }
  return PLAN_CFG[key];
}

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
  const role    = roleCfgFor(user.user_type);
  const status  = STATUS_CFG[uStatus];
  const plan    = planBadgeFor(user);
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
          <span title={plan.title} className={`text-[9px] font-bold ${plan.color}`}>{plan.label}</span>
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
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");

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
      // `status` and `tier` are deliberately NOT sent, and both used to be.
      //
      // The list route embeds the subscription as `subscriptions!left(...)`,
      // so its `.eq("subscriptions.tier", …)` / `.eq("subscriptions.status", …)`
      // filter the EMBEDDED rows, never the parent profiles — the route says so
      // itself, at length, under «NOT LOAD-BEARING». Sending either one did not
      // narrow the list by a single account. It did worse: a profile whose
      // subscription failed the predicate still came back, with an empty
      // `subscriptions` array, so every non-matching row lost its plan and
      // status and re-rendered as an unsubscribed account. Picking «الاحترافية»
      // would have returned the whole platform relabelled «بدون اشتراك».
      //
      // On top of that the status vocabulary never lined up: this screen's
      // «نشط»/«بانتظار التحقق» are `profiles.verified_at` predicates, while
      // `subscriptions.status` is CHECK-constrained to
      // ('active','past_due','cancelled','expired','trialing') — "pending",
      // "trial" and "suspended" are not values it can hold.
      //
      // Both are applied client-side below instead, off `mapStatus`/`planKeyOf`
      // — the same two functions that draw the badges, so a chip and a badge
      // cannot disagree. That narrows only the rows already loaded, which is
      // stated on screen rather than left to be discovered. Making either one
      // narrow server-side is a change to
      // src/app/api/v1/admin/users/route.ts, which this pass does not own.
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
    // `statusFilter` and `planFilter` are NOT dependencies: neither is sent to
    // the server any more (see the note at the params above), so re-fetching on
    // them would throw away every «تحميل المزيد» page the admin had loaded and
    // then filter the smaller set — the control would appear to lose rows.
  }, [search, roleFilter]);

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

  /**
   * The rows the plan and status controls leave on screen.
   *
   * Both narrow `users` — the pages already fetched — and nothing else. The
   * server cannot narrow on either (see the note at the request params), so
   * this is the only place the two filters can do real work, and it is real:
   * `mapStatus` and `planKeyOf` are the same functions that print the badges,
   * so a row is hidden by exactly the value shown on it.
   *
   * What it is not is a search of the platform. With rows still unloaded, a
   * plan chip that finds nothing means "none among the loaded accounts", not
   * "none exist" — which is why `scopeNotice` below is rendered rather than
   * left for an admin to infer, and why the empty state says which of the two
   * it is.
   */
  const visibleUsers = users.filter((u) => {
    if (statusFilter !== "all" && mapStatus(u.subscription?.status, u.verified_at) !== statusFilter) {
      return false;
    }
    if (planFilter !== "all" && planKeyOf(u) !== planFilter) return false;
    return true;
  });

  /**
   * Whether anything on this screen is computed from a partial list.
   *
   * `hasMore` alone, not "a filter is on": the two client-side filters are not
   * the only things scoped to the loaded rows. `stats.active`, `stats.pending`
   * and `stats.suspended` are counted over `users` too, so with 20 of 45 loaded
   * the header reads «45 مستخدم · 12 نشط» — a platform total beside a count of
   * one page, in the same sentence, with nothing to tell them apart. Only
   * «إجمالي» comes from the server's `count`, which is why it is the one number
   * the notice does not disclaim.
   *
   * Once everything is loaded all of it IS the whole matching set, so the
   * sentence would be false and is not rendered.
   */
  const scopeNotice = hasMore;

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            إدارة المستخدمين
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {/* Was `{stats.total} مستخدم · …` — «10 مستخدم» in Western digits
                beside Arabic-Indic join dates on the same rows (shot 07).
                Arabic takes the plural at 10, and this console writes ٠-٩. */}
            {countPhraseAr(stats.total, USERS_COUNT)} · {countTileAr(stats.active)} نشط · {countTileAr(stats.pending)} بانتظار التحقق
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={15} weight="bold" /> مستخدم جديد
        </button>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          // «إجمالي» was the wrong word for this number and the screen said so
          // out loud: the «الكل» chip read 17 while this tile, labelled
          // «إجمالي», read 10 (shot 07). Both are correct — the chip is the sum
          // across roles, this is the count for the request that was actually
          // made — but only one of them can be called the total. This one is
          // the result set, so it is named that.
          { label: "إجمالي النتائج", value: stats.total,     color: "text-royal",       bg: "bg-royal/8",        icon: Users },
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

      {/* Filters — search + status + plan on one line, the account-type chips
          on their own. Ten chips share a row with the search box far worse than
          four did; giving them a line stops the status control being shoved off
          the edge on a narrow screen. */}
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
          {/* Owner item ٣٤ — the plan filter. The screen had a `planFilter`
              state and shipped it to the server as `?tier=`; what it never had
              was a control, so the value was permanently "all" and no admin
              could answer «مين المشتركين في الاحترافية؟» from this list at all.
              The options are the five tiers the CHECK constraint allows plus
              «بدون اشتراك» — no «Enterprise», which the old badge map offered
              and no subscription row can hold. */}
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value as PlanFilter)}
            className={`px-3 py-2 rounded-xl border text-[11px] font-bold outline-none cursor-pointer ${isDark ? "bg-zinc-900 border-white/[0.06] text-zinc-400" : "bg-white border-slate-100 text-slate-500"}`}>
            {PLAN_FILTERS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
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

        {/* What this screen actually measured.
            The plan and status controls cannot be pushed to the server (see the
            request params), so they narrow the pages already loaded — and the
            three status counters above are summed over the same partial list.
            Saying so is the difference between a filter and a false negative:
            without this line, «الاحترافية» over 20 of 45 loaded accounts
            returns four rows that read as the platform's entire Pro cohort.
            Amber, not zinc: this qualifies numbers an admin is about to act
            on, so it has to be noticed rather than blend into the chrome. */}
        {scopeNotice && (
          <p className={`text-[11px] leading-6 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
            تصفية الخطة والحالة — وعدادات «نشط» و«انتظار تحقق» و«موقوف» أعلاه —
            تُحتسب على الحسابات المحمّلة فقط ({users.length} من {total}).
            اضغط «تحميل المزيد» لتشمل بقية الحسابات.
          </p>
        )}

        {/* «موقوف» is a state this platform cannot hold, and until the status
            control actually filtered, nothing revealed that: the chip returned
            the unfiltered list, so it never looked empty. Now that it really
            narrows, selecting it returns nothing — and an empty result reads as
            «no account is suspended», which is a stronger and false claim.
            The chain, end to end:
              • `profiles` has no status column at all — only `verified_at`
                (20260603_phase1_001_profiles.sql:30-53).
              • `subscriptions.status` is CHECK-constrained to
                ('active','past_due','cancelled','expired','trialing') — no
                'suspended' (…003_subscriptions_billing.sql:38), and no later
                migration adds one.
              • PATCH /api/v1/admin/users/[id] never persists `body.status`. Its
                suspension branch (:210-226) cancels active subscriptions and
                downgrades the auth-metadata tier to free, and writes no mark
                anywhere. `mapStatus('cancelled', verified_at)` then returns
                "active", so a just-«إيقاف»ed account re-renders as نشط.
              • Nothing in src/ gates sign-in on any of this.
            So the button is not a no-op — it really does cancel the
            subscription — but «إيقاف» promises more than it does, and the
            «موقوف» counter can only ever read 0. Stated here rather than left
            for an admin to conclude from an empty list. Making suspension real
            needs a column and a route this pass does not own. */}
        {statusFilter === "suspended" && (
          <p className={`text-[11px] leading-6 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
            لا تُسجَّل حالة «موقوف» في المنصة: زر «إيقاف» يُلغي الاشتراك النشط
            ويُنزل الباقة إلى المجانية، ولا يكتب أي وسم إيقاف على الحساب ولا يمنع
            الدخول. لذلك لا يمكن لهذه التصفية — ولا لعدّاد «موقوف» أعلاه — أن
            تُظهر أي حساب، مهما كان عدد الحسابات الموقوفة فعلياً.
          </p>
        )}
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

        {/* Empty state — two different facts, never the same sentence.
            «لا توجد نتائج مطابقة» is a statement about the platform and is only
            true when the SERVER returned nothing for this search and account
            type. When the server returned rows and the plan/status controls hid
            them all, the honest sentence is about the loaded page, and it says
            what to do about it. Printing the first for the second case is how
            an admin concludes nobody is on a plan that has subscribers. */}
        {!loading && !error && users.length === 0 && (
          <div className={`${card} p-8 text-center`}>
            <Users size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد نتائج مطابقة</p>
          </div>
        )}

        {!loading && !error && users.length > 0 && visibleUsers.length === 0 && (
          <div className={`${card} p-8 text-center`}>
            <Users size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              لا يطابق هذه التصفية أي حساب من الحسابات المحمّلة
              ({users.length} من {total})
            </p>
            {hasMore && (
              <button onClick={() => fetchUsers(page + 1, true)} disabled={loadingMore}
                className="mt-3 px-4 py-2 rounded-xl bg-royal/10 text-royal text-[12px] font-bold border border-royal/20 hover:bg-royal/20 disabled:opacity-40">
                {loadingMore ? "جاري التحميل..." : "تحميل المزيد والبحث فيه"}
              </button>
            )}
          </div>
        )}

        {!loading && !error && visibleUsers.map((u, i) => (
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
