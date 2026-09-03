"use client";

/**
 * Firm team roster — rewritten 2026-09-04 (Phase 2, backend build
 * `members-api-and-team-page`).
 *
 * ── WHAT CHANGED ─────────────────────────────────────────────────────────
 * This page used to render `MOCK_TEAM` — seven invented lawyers with
 * fabricated ratings, active-case counts, specializations, phone numbers and
 * an "available/busy/leave" status nothing tracks — and `AddMemberModal`
 * wrote the new member into local state only, closing on a toast that said
 * so ("Backend-ready: هذا تأكيد واجهة فقط"). None of it reached a database.
 *
 * It now reads and writes `public.firm_members` through
 * `/api/v1/firm/members` (GET, POST) and `/api/v1/firm/members/[memberId]`
 * (PATCH) — see `@/lib/services/firmMembersService`. A member here is a real
 * account (`firm_members.user_id`), not a person the firm merely describes:
 * "add a member" looks up an EXISTING lawyer account by e-mail and links it.
 * Inviting someone with no platform account yet is a later step
 * (`team_invitations` exists in the schema, unused) — the add-member form
 * says so rather than pretending an e-mail alone is enough.
 *
 * ── WHAT WAS REMOVED, AND WHY IT HAS NO REPLACEMENT HERE ───────────────────
 * Nothing in `firm_members` (or anywhere else) backs these, so they are gone
 * rather than re-mocked:
 *   • rating, activeCases          — no case-assignment-to-member link exists.
 *   • specialization                — no such column; it was a free-typed
 *                                      string in the old add-member form.
 *   • availability (available/busy/leave) — no presence/availability table.
 *   • phone                         — `firm_members` has no phone column, and
 *                                      `profiles.phone` is not exposed by this
 *                                      route (only display_name/email are —
 *                                      see the route's own comment on why).
 *   • the "Backend-ready" toast      — replaced by real honest states
 *                                      (loading/unreadable/empty/ready) plus
 *                                      the route's own Arabic error banner.
 *
 * `ROLE_CONFIG` (labels/colours/icons for the 13 real `FirmRole` values) is
 * kept as-is — it already mapped real roles, nothing about it was mock.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, MagnifyingGlass, Gavel, Star, Envelope, CheckCircle,
  Warning, Key, Student, X, UserPlus, CaretDown, Crown, PauseCircle, PlayCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import EmptyState from "@/components/ui/EmptyState";
import {
  getFirmMembers, addFirmMember, updateFirmMember,
  type FirmMember, type FirmRole, type FirmMemberStatus,
} from "@/lib/services/firmMembersService";
import { type ListRead, listViewState, itemsOf } from "@/lib/services/listRead";
import { toArabicDigits, countPhraseAr } from "@/lib/services/arabicCount";

// ─── Role & status presentation ────────────────────────────────────────────

const ROLE_CONFIG: Record<FirmRole, { label: string; color: string; bg: string; icon: React.ElementType }> = {
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

const ROLE_OPTIONS: { value: FirmRole; label: string }[] = (Object.keys(ROLE_CONFIG) as FirmRole[])
  .map(value => ({ value, label: ROLE_CONFIG[value].label }));

const STATUS_STYLE: Record<FirmMemberStatus, { label: string; dot: string; text: string }> = {
  active: { label: "نشط", dot: "bg-emerald-400", text: "text-emerald-500" },
  invited: { label: "بانتظار القبول", dot: "bg-amber-400 animate-pulse", text: "text-amber-500" },
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

// ─── Add Member Modal ───────────────────────────────────────────────────────

interface AddMemberModalProps {
  isDark: boolean;
  onClose: () => void;
  onAdd: (input: { email: string; role: FirmRole }) => Promise<void>;
}

function AddMemberModal({ isDark, onClose, onAdd }: AddMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FirmRole>("lawyer");
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
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>إضافة عضو</h2>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>يجب أن يملك المحامي حسابًا على المنصّة بهذا البريد بالفعل</p>
            </div>
          </div>
          <button onClick={onClose}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}
          >
            <X size={15} />
          </button>
        </div>

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
            <p className={`font-bold text-[15px] ${isDark ? "text-white" : "text-zinc-800"}`}>تمت الإضافة</p>
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>أصبح العضو نشطًا في فريق المكتب.</p>
          </motion.div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className={labelCls}>البريد الإلكتروني <span className="text-red-400">*</span></label>
              <input
                type="email"
                dir="ltr"
                className={inputCls}
                placeholder="example@firm.sa"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div>
              <label className={labelCls}>الدور <span className="text-red-400">*</span></label>
              <div className="relative">
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as FirmRole)}
                  className={`${inputCls} appearance-none cursor-pointer`}
                  disabled={submitting}
                >
                  {ROLE_OPTIONS.map(o => (
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

interface MemberCardProps {
  m: FirmMember;
  isDark: boolean;
  card: string;
  onChangeRole: (memberId: string, role: FirmRole) => Promise<void>;
  onToggleStatus: (memberId: string, next: "active" | "suspended") => Promise<void>;
}

function MemberCard({ m, isDark, card, onChangeRole, onToggleStatus }: MemberCardProps) {
  const role = ROLE_CONFIG[m.role];
  const status = STATUS_STYLE[m.status];
  const RoleIcon = role?.icon ?? Users;
  const [busy, setBusy] = useState<"role" | "status" | null>(null);
  const [rowError, setRowError] = useState("");

  const handleRoleChange = async (next: FirmRole) => {
    if (next === m.role) return;
    setBusy("role");
    setRowError("");
    try {
      await onChangeRole(m.id, next);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "تعذّر تغيير الدور.");
    } finally {
      setBusy(null);
    }
  };

  const handleToggleStatus = async () => {
    setBusy("status");
    setRowError("");
    try {
      await onToggleStatus(m.id, m.status === "suspended" ? "active" : "suspended");
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "تعذّر تغيير الحالة.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`group ${card} p-5 hover:border-royal/20 transition-all`}>
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-sm ${m.role === "managing_partner" || m.role === "partner" ? "bg-gradient-to-br from-[#0B3D2E] to-[#1a5c45]" : "bg-royal"}`}>
              {m.displayName.charAt(0)}
            </div>
            <span className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 ${isDark ? "border-zinc-900" : "border-white"} ${status.dot}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className={`text-[14px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{m.displayName}</p>
              {m.isOwner && <Crown size={13} weight="fill" className="text-[#C8A762] flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${role?.bg ?? ""} ${role?.color ?? ""}`}>
                <RoleIcon size={9} />
                {role?.label ?? m.role}
              </span>
              <span className={`text-[10px] font-semibold ${status.text}`}>
                {m.isOwner ? "صاحب المكتب" : status.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className={`flex items-center gap-1 text-[11px] mb-3 pb-3 border-b truncate ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
        <Envelope size={10} className="flex-shrink-0" />
        <span dir="ltr" className="truncate">{m.email ?? "—"}</span>
      </div>

      {/* Joined date */}
      <p className={`text-[11px] mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        عضو منذ {formatDate(m.acceptedAt ?? m.createdAt)}
      </p>

      {rowError && (
        <p className="text-[11px] text-red-400 flex items-center gap-1 mb-2">
          <Warning size={11} /> {rowError}
        </p>
      )}

      {/* Actions — never on the owner's own row */}
      {!m.isOwner && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={m.role}
              onChange={e => handleRoleChange(e.target.value as FirmRole)}
              disabled={busy !== null}
              className={`w-full appearance-none cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold outline-none disabled:opacity-60 ${
                isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-700"
              }`}
            >
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <CaretDown size={11} className="absolute top-1/2 left-2 -translate-y-1/2 pointer-events-none text-zinc-400" />
          </div>
          {m.status !== "removed" && (
            <button
              onClick={handleToggleStatus}
              disabled={busy !== null}
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
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function FirmTeamPage() {
  const { isDark } = useTheme();
  const user = useUser();
  // This page is reached by the firm ACCOUNT itself (UserTypeGuard on
  // /dashboard/firm/layout.tsx), never by a lawyer with an `affiliation` to
  // one — and the API only lets the firm OWNER (`firm_profiles.owner_user_id`)
  // read or write this roster, an admin session always excepted. So management
  // controls follow the same two user types the route itself accepts.
  const canManage = user.userType === "firm" || user.userType === "admin";

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<FirmRole | "all">("all");
  const [showAddModal, setShowAddModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<ListRead<FirmMember> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFirmMembers();
      setRead(result);
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

  const filtered = useMemo(() => members.filter(m => {
    const matchRole = roleFilter === "all" || m.role === roleFilter;
    const q = search.trim();
    const matchSearch = !q || m.displayName.includes(q) || (m.email ?? "").toLowerCase().includes(q.toLowerCase());
    return matchRole && matchSearch;
  }), [members, roleFilter, search]);

  const activeCount = useMemo(() => members.filter(m => m.status === "active").length, [members]);

  const handleAdd = async (input: { email: string; role: FirmRole }) => {
    await addFirmMember(input);
    setReloadKey(k => k + 1);
  };

  const handleChangeRole = async (memberId: string, role: FirmRole) => {
    const updated = await updateFirmMember(memberId, { role });
    setRead(prev => prev && prev.ok
      ? { ...prev, items: prev.items.map(m => (m.id === memberId ? updated : m)) }
      : prev);
  };

  const handleToggleStatus = async (memberId: string, next: "active" | "suspended") => {
    const updated = await updateFirmMember(memberId, { status: next });
    setRead(prev => prev && prev.ok
      ? { ...prev, items: prev.items.map(m => (m.id === memberId ? updated : m)) }
      : prev);
  };

  const retryLoad = useCallback(() => setReloadKey(k => k + 1), []);

  const subtitle = viewState === "loading"
    ? "جاري تحميل الفريق…"
    : viewState === "unreadable"
      ? "تعذّر تحميل الفريق"
      : countPhraseAr(members.length, { zero: "لا يوجد أعضاء", one: "عضو واحد", two: "عضوان", few: "أعضاء", many: "عضواً" })
        + (members.length > 0 ? ` — ${toArabicDigits(activeCount)} ${activeCount === 1 ? "نشط" : "نشطون"}` : "");

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
          <p className={`text-sm ${viewState === "unreadable" ? "text-red-500 font-semibold" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/firm/team/roles" className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Key size={15} />
            الأدوار والصلاحيات
          </Link>
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
        </div>
      </motion.div>

      {/* Filters */}
      {viewState === "ready" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex flex-col sm:flex-row gap-3">
          <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
            <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد..."
              className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setRoleFilter("all")}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${roleFilter === "all"
                ? "bg-royal text-white border-royal"
                : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              الكل
            </button>
            {ROLE_OPTIONS.filter(o => members.some(m => m.role === o.value)).map(o => (
              <button key={o.value} onClick={() => setRoleFilter(o.value)}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${roleFilter === o.value
                  ? "bg-royal text-white border-royal"
                  : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Body — four states kept apart: loading, unreadable, empty, ready */}
      {viewState === "loading" ? (
        <div className={`${card} p-4 space-y-2`}>
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
          ))}
        </div>
      ) : viewState === "unreadable" ? (
        <div className={`${card} p-6 text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة فريق المكتب</p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم يستجب الخادم لطلب القائمة. هذه ليست قائمة فارغة — قد يكون للمكتب أعضاء لم تُقرأ بيانتهم بعد.
          </p>
          <button onClick={retryLoad}
            className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors cursor-pointer">
            إعادة المحاولة
          </button>
        </div>
      ) : filtered.length === 0 ? (
        members.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="لا يوجد أعضاء بعد"
            description="أضِف زملاءك المحامين المسجَّلين على المنصّة إلى فريق المكتب."
            action={canManage ? { label: "إضافة عضو", onClick: () => setShowAddModal(true) } : undefined}
          />
        ) : (
          <EmptyState
            icon={<Users />}
            title="لا توجد نتائج مطابقة"
            description="لم يُعثر على أعضاء يطابقون شروط البحث الحالية."
            action={{ label: "إعادة ضبط الفلاتر", onClick: () => { setSearch(""); setRoleFilter("all"); } }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m, i) => (
            <motion.div key={m.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <MemberCard
                m={m}
                isDark={isDark}
                card={card}
                onChangeRole={handleChangeRole}
                onToggleStatus={handleToggleStatus}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddModal && canManage && (
          <AddMemberModal
            isDark={isDark}
            onClose={() => setShowAddModal(false)}
            onAdd={handleAdd}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
