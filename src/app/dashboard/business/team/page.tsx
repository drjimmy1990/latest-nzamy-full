"use client";

/**
 * Company team roster — rewritten for WP-6 B-5/B-6 (plan §5 Q7 = yes).
 *
 * ── WHAT THIS PAGE WAS ───────────────────────────────────────────────────
 * 651 lines of client-side fiction, and unreachable on top of that:
 *   • MEMBERS — four invented people (نورة الزهراني / فهد السبيعي / ريم
 *     القحطاني / سلمى الدوسري) with fabricated e-mails, +966 5x phone
 *     numbers, case counts and join dates, identical for every company.
 *   • INITIAL_INVITES — two pending invitations with «daysLeft» counters.
 *   • InviteModal — «إرسال الدعوة» called `setSent(true)` and printed a
 *     hardcoded invite URL `https://nezamy.sa/invite/x7k2m9p`. No network
 *     call of any kind.
 *   • «إزالة العضو», «تعديل البيانات» and the PowerModal's «تأكيد وتفعيل»
 *     were buttons with no `onClick` at all.
 *   • a stats row summing the fabricated `cases` / `completedCases`.
 *
 * ── WHAT IT IS NOW ───────────────────────────────────────────────────────
 * The real roster: `public.business_members` through
 * `/api/v1/business/members` (GET, POST) and
 * `/api/v1/business/members/[memberId]` (PATCH) — see
 * `@/lib/services/businessMembersService`. A member is a real account
 * (`business_members.user_id`), not a person the company merely describes.
 *
 * Deliberately minimal. Everything the old page showed that nothing backs is
 * gone rather than re-mocked, and has no replacement here:
 *   • case counts / completed cases — nothing links a case to a member.
 *   • phone — `business_members` has no phone column and this roster does not
 *     read `profiles.phone`.
 *   • «تفعيل صلاحيات محامي» (the PowerModal) — there is no lawyer-powers
 *     grant anywhere in the schema. This is also where
 *     `can("team-legal-department")` used to be read; the company's real
 *     `has_legal_dept` column is now set from «إعدادات الكيان» (WP-6 B-4)
 *     and no control on this page depends on it.
 *   • pending invitations — there is no invite e-mail and no acceptance
 *     screen, so an added member is `active` immediately (exactly what
 *     /api/v1/firm/members does) and there is no «بانتظار القبول» list to
 *     show. `team_invitations` exists in the schema, unused.
 *   • a seat counter — nothing counts seats; see `seatPolicy` in
 *     src/constants/settingsReadiness.ts.
 *
 * ── NAMES AND E-MAILS MAY BE ABSENT, AND THE PAGE SAYS SO ────────────────
 * The route resolves the other members' names through a server-only
 * projection of `profiles` taken AFTER RLS has proved the caller belongs to
 * this company — `/api/v1/firm/members`'s long-standing pattern, see the
 * route's header. So a name normally arrives. `displayName: null` still
 * happens when that projection itself fails, and it still renders as
 * «الاسم غير متاح» — «we could not read this» — never as a dash that would
 * pass for an empty name.
 *
 * ── WHO CAN DO WHAT ──────────────────────────────────────────────────────
 * `canManage` comes from the SERVER (`GET …/members` → `canManage`), which
 * sets it only for the company owner. The write controls are hidden rather
 * than shown-and-then-403'd, and the API + RLS refuse regardless.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, MagnifyingGlass, Envelope, CheckCircle, Warning,
  X, UserPlus, CaretDown, Crown, PauseCircle, PlayCircle, Trash,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import {
  getBusinessMembers, addBusinessMember, updateBusinessMember,
  type BusinessMember, type BusinessRole, type BusinessMemberStatus,
} from "@/lib/services/businessMembersService";
import { BUSINESS_ROLE_LABEL } from "@/lib/auth/businessMembershipAccess";
import { CORPORATE_INVITE_ROLES } from "@/constants/settingsReadiness";
import { type ListRead, listViewState, itemsOf } from "@/lib/services/listRead";

// The eight invitable roles, straight from the settings policy so the tab and
// this page can never offer different ones. `owner` is not among them: that
// row is derived from business_profiles.owner_user_id by the
// ensure_business_owner_membership trigger.
const ROLE_OPTIONS: { value: BusinessRole; label: string }[] = CORPORATE_INVITE_ROLES.map((r) => ({
  value: r.value as BusinessRole,
  label: r.label,
}));

const STATUS_STYLE: Record<BusinessMemberStatus, { label: string; dot: string; text: string }> = {
  active: { label: "نشط", dot: "bg-emerald-400", text: "text-emerald-500" },
  invited: { label: "بانتظار القبول", dot: "bg-amber-400", text: "text-amber-500" },
  suspended: { label: "معلَّق", dot: "bg-orange-400", text: "text-orange-500" },
  removed: { label: "مُزال", dot: "bg-zinc-400", text: "text-zinc-500" },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(iso);
  }
}

// ─── Add member ─────────────────────────────────────────────────────────────

function AddMemberModal({
  isDark,
  onClose,
  onAdd,
}: {
  isDark: boolean;
  onClose: () => void;
  onAdd: (input: { email: string; role: BusinessRole }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BusinessRole>(ROLE_OPTIONS[0]?.value ?? "employee");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${
    isDark
      ? "bg-zinc-800 border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 focus:border-royal/50"
      : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/60"
  }`;
  const labelCls = `block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`;

  const handleSubmit = async () => {
    setError("");
    if (!email.trim()) {
      setError("يرجى إدخال البريد الإلكتروني.");
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({ email: email.trim(), role });
      setSubmitted(true);
      setTimeout(onClose, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّرت إضافة العضو.");
    } finally {
      setSubmitting(false);
    }
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
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-zinc-100"}`}
      >
        <div className={`flex items-center justify-between px-6 py-5 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center">
              <UserPlus size={17} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
            </div>
            <div>
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>إضافة عضو</h2>
              {/* Not «دعوة»: no e-mail is sent and there is nothing to accept. */}
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                يجب أن يملك الشخص حساباً على المنصّة بهذا البريد بالفعل
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}
          >
            <X size={15} />
          </button>
        </div>

        {submitted ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={32} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[15px] ${isDark ? "text-white" : "text-zinc-800"}`}>تمت الإضافة</p>
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>أصبح العضو نشطاً في فريق الشركة.</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className={labelCls}>البريد الإلكتروني <span className="text-red-400">*</span></label>
              <input
                type="email"
                dir="ltr"
                className={inputCls}
                placeholder="example@company.sa"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div>
              <label className={labelCls}>الدور <span className="text-red-400">*</span></label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as BusinessRole)}
                  className={`${inputCls} appearance-none cursor-pointer`}
                  disabled={submitting}
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <CaretDown size={13} className="absolute top-1/2 left-3 -translate-y-1/2 pointer-events-none text-zinc-400" />
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-red-400 flex items-center gap-1">
                <Warning size={12} /> {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <motion.button
                whileHover={{ scale: submitting ? 1 : 1.02 }} whileTap={{ scale: submitting ? 1 : 0.97 }}
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] hover:bg-[#0d5238] transition-colors cursor-pointer shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <UserPlus size={15} /> {submitting ? "جارٍ الإضافة…" : "إضافة العضو"}
              </motion.button>
              <button
                onClick={onClose}
                disabled={submitting}
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

// ─── Member card ────────────────────────────────────────────────────────────

function MemberCard({
  m,
  isDark,
  card,
  canManage,
  onChangeRole,
  onSetStatus,
}: {
  m: BusinessMember;
  isDark: boolean;
  card: string;
  canManage: boolean;
  onChangeRole: (memberId: string, role: BusinessRole) => Promise<void>;
  onSetStatus: (memberId: string, next: "active" | "suspended" | "removed") => Promise<void>;
}) {
  const status = STATUS_STYLE[m.status] ?? STATUS_STYLE.active;
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setRowError("");
    try {
      await fn();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-sm bg-royal">
            {(m.displayName ?? "").charAt(0) || "؟"}
          </div>
          <span className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 ${isDark ? "border-zinc-900" : "border-white"} ${status.dot}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* null = the joined profiles row was not readable, which is not
                the same as an empty name. See the file header. */}
            <p className={`text-[14px] font-bold truncate ${m.displayName ? (isDark ? "text-zinc-100" : "text-slate-800") : "text-zinc-400"}`}>
              {m.displayName ?? "الاسم غير متاح"}
            </p>
            {m.isOwner && <Crown size={13} weight="fill" className="text-[#C8A762] flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-royal/10 text-royal">
              {BUSINESS_ROLE_LABEL[m.role] ?? m.role}
            </span>
            <span className={`text-[10px] font-semibold ${status.text}`}>
              {m.isOwner ? "مالك الحساب" : status.label}
            </span>
          </div>
        </div>
      </div>

      <div className={`flex items-center gap-1 text-[11px] mb-3 pb-3 border-b truncate ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
        <Envelope size={10} className="flex-shrink-0" />
        <span dir="ltr" className="truncate">{m.email ?? "البريد غير متاح"}</span>
      </div>

      <p className={`text-[11px] mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        عضو منذ {formatDate(m.acceptedAt ?? m.createdAt)}
      </p>

      {rowError && (
        <p className="text-[11px] text-red-400 flex items-center gap-1 mb-2">
          <Warning size={11} /> {rowError}
        </p>
      )}

      {/* Never on the owner's own row — the API refuses it too (403). */}
      {canManage && !m.isOwner && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={m.role}
                onChange={(e) => {
                  const next = e.target.value as BusinessRole;
                  if (next === m.role) return;
                  run(() => onChangeRole(m.id, next), "تعذّر تغيير الدور.");
                }}
                disabled={busy}
                className={`w-full appearance-none cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold outline-none disabled:opacity-60 ${
                  isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                }`}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <CaretDown size={11} className="absolute top-1/2 left-2 -translate-y-1/2 pointer-events-none text-zinc-400" />
            </div>
            {m.status !== "removed" && (
              <button
                onClick={() => run(
                  () => onSetStatus(m.id, m.status === "suspended" ? "active" : "suspended"),
                  "تعذّر تغيير الحالة.",
                )}
                disabled={busy}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  m.status === "suspended"
                    ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                    : "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
                }`}
              >
                {m.status === "suspended" ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                {m.status === "suspended" ? "تفعيل" : "تعليق"}
              </button>
            )}
          </div>

          {m.status !== "removed" && (
            confirmRemove ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => run(() => onSetStatus(m.id, "removed"), "تعذّرت إزالة العضو.")}
                  disabled={busy}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer disabled:opacity-60"
                >
                  تأكيد الإزالة
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  disabled={busy}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}
                >
                  تراجع
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${isDark ? "text-zinc-500 hover:text-red-400" : "text-zinc-400 hover:text-red-500"}`}
              >
                <Trash size={12} /> إزالة من الفريق
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BusinessTeamPage() {
  const { isDark } = useTheme();

  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<ListRead<BusinessMember> | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getBusinessMembers();
      setRead(result.list);
      setCanManage(result.canManage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers, reloadKey]);

  const viewState = listViewState(loading, read);
  const members = itemsOf(read);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => (m.displayName ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q),
    );
  }, [members, search]);

  const handleAdd = async (input: { email: string; role: BusinessRole }) => {
    await addBusinessMember(input);
    setReloadKey((k) => k + 1);
  };

  const patchRow = (memberId: string, updated: BusinessMember) =>
    setRead((prev) =>
      prev && prev.ok ? { ...prev, items: prev.items.map((m) => (m.id === memberId ? updated : m)) } : prev,
    );

  const handleChangeRole = async (memberId: string, role: BusinessRole) => {
    patchRow(memberId, await updateBusinessMember(memberId, { role }));
  };

  const handleSetStatus = async (memberId: string, next: "active" | "suspended" | "removed") => {
    patchRow(memberId, await updateBusinessMember(memberId, { status: next }));
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            فريق الشركة
          </h1>
          {/* No counter until the list is actually readable — an «٠ أعضاء»
              printed over a failed read is the defect listRead.ts exists for. */}
          <p className={`text-sm ${viewState === "unreadable" ? "text-red-500 font-semibold" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {viewState === "loading"
              ? "جاري تحميل الفريق…"
              : viewState === "unreadable"
                ? "تعذّر تحميل الفريق"
                : canManage
                  ? "أعضاء شركتك المسجّلون على المنصّة."
                  : "أعضاء شركتك المسجّلون على المنصّة — الإدارة متاحة لمالك الحساب فقط."}
          </p>
        </div>
        {canManage && (
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors cursor-pointer shadow-md"
          >
            <Plus size={15} weight="bold" />
            إضافة عضو
          </motion.button>
        )}
      </motion.div>

      {viewState === "ready" && members.length > 0 && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
          />
        </div>
      )}

      {/* Four states kept apart: loading, unreadable, empty, ready. */}
      {viewState === "loading" ? (
        <div className={`${card} p-4 space-y-2`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
          ))}
        </div>
      ) : viewState === "unreadable" ? (
        <div className={`${card} p-6 text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة فريق الشركة</p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم يستجب الخادم لطلب القائمة. هذه ليست قائمة فارغة — قد يكون للشركة أعضاء لم تُقرأ بياناتهم بعد.
          </p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : filtered.length === 0 ? (
        members.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="لا يوجد أعضاء بعد"
            description="أضِف زملاءك المسجَّلين على المنصّة إلى فريق الشركة."
            action={canManage ? { label: "إضافة عضو", onClick: () => setShowAddModal(true) } : undefined}
          />
        ) : (
          <EmptyState
            icon={<Users />}
            title="لا توجد نتائج مطابقة"
            description="لم يُعثر على أعضاء يطابقون البحث الحالي."
            action={{ label: "إعادة ضبط البحث", onClick: () => setSearch("") }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <MemberCard
                m={m}
                isDark={isDark}
                card={card}
                canManage={canManage}
                onChangeRole={handleChangeRole}
                onSetStatus={handleSetStatus}
              />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAddModal && canManage && (
          <AddMemberModal isDark={isDark} onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
        )}
      </AnimatePresence>
    </div>
  );
}
