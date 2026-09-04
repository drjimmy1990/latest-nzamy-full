"use client";

/**
 * Firm team workload — rebuilt 2026-09-04 (owner review item 4: "both pages
 * still read MOCK_TEAM").
 *
 * ── WHAT CHANGED ─────────────────────────────────────────────────────────
 * This page used to render a hardcoded `TEAM` array of six invented lawyers
 * with a gamified "load points" system (`TASK_WEIGHTS` — litigation=8,
 * memos=5, …, nothing in the schema backs any of it), `utilizationRate`/
 * `deadlineAdherence` percentages nothing measures, an `overloaded`/`busy`/
 * `normal`/`light` classification computed from those invented points, an
 * invented `trend` (up/down/stable) per member, and a "rebalance suggestion"
 * banner asserting a recommendation with no algorithm behind it. None of it
 * came from a query.
 *
 * It now reads the real `firm_members` roster
 * (`@/lib/services/firmMembersService`, same read `team/page.tsx` uses) and
 * three real per-member counts computed from RLS-visible rows
 * (`@/lib/services/firmMemberWorkloadService` →
 * `GET /api/v1/firm/members/workload`) — see
 * `@/lib/services/firmMemberWorkload` for exactly what each count means and
 * the documented gap in "طلبات مسندة".
 *
 * ── WHAT WAS REMOVED, AND WHY IT HAS NO REPLACEMENT HERE ───────────────────
 *   • the points system, MAX_POINTS, the load bar percentage
 *                                    — no weighting rule exists anywhere;
 *                                      inventing weights (why is a hearing
 *                                      worth 8 and a memo 5?) is exactly the
 *                                      kind of number this rebuild removes.
 *   • overloaded/busy/normal/light   — thresholds over the invented points;
 *                                      gone with the points. This page now
 *                                      shows the three raw counts and lets
 *                                      the reader judge, rather than
 *                                      asserting a status this product
 *                                      cannot back.
 *   • utilizationRate, deadlineAdherence, trend (up/down/stable)
 *                                    — no such measurement exists.
 *   • the grid/list view toggle      — a display preference, not a data
 *                                      concern; dropped to keep this rebuild
 *                                      focused on real numbers. One list
 *                                      layout remains.
 *   • the "rebalance suggestion" banner («عرض الاقتراح» led nowhere)
 *                                    — a recommendation with no algorithm
 *                                      behind it; a dead affordance, not a
 *                                      deferred feature.
 *
 * What IS real and shown: member count, and per member — assigned service
 * requests, open tasks, upcoming hearings — each a straight count over an
 * RLS-visible table, sortable, searchable by name.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  UsersThree, Warning, MagnifyingGlass, SortAscending, ArrowLeft,
  Scroll, ListChecks, Gavel,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { getFirmMembers, type FirmMember } from "@/lib/services/firmMembersService";
import { getFirmMemberWorkload, type FirmMemberWorkloadCounts } from "@/lib/services/firmMemberWorkloadService";
import { type ListRead, listViewState, itemsOf } from "@/lib/services/listRead";
import { countTileAr, countPhraseAr, toArabicDigits } from "@/lib/services/arabicCount";
import { FIRM_ROLE_CONFIG, FIRM_STATUS_STYLE } from "@/constants/firmMemberDisplay";

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

type SortKey = "total" | "assignedRequests" | "openTasks" | "upcomingHearings";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "total", label: "الإجمالي" },
  { key: "assignedRequests", label: "الطلبات" },
  { key: "openTasks", label: "المهام" },
  { key: "upcomingHearings", label: "الجلسات" },
];

/** «—» for an unknown/unreadable count, the Arabic-Indic digit otherwise. */
function cell(value: number | undefined, unreadable: boolean): string {
  if (unreadable || value === undefined) return "—";
  return countTileAr(value);
}

export default function FirmWorkloadPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("total");

  const [membersLoading, setMembersLoading] = useState(true);
  const [membersRead, setMembersRead] = useState<ListRead<FirmMember> | null>(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadRead, setWorkloadRead] = useState<ListRead<FirmMemberWorkloadCounts> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setMembersLoading(true);
    setWorkloadLoading(true);
    const [m, w] = await Promise.all([getFirmMembers(), getFirmMemberWorkload()]);
    setMembersRead(m);
    setMembersLoading(false);
    setWorkloadRead(w);
    setWorkloadLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const membersViewState = listViewState(membersLoading, membersRead);
  const members = itemsOf(membersRead);

  const workloadViewState = listViewState(workloadLoading, workloadRead);
  const workloadUnreadable = workloadViewState === "unreadable";
  const workloadByMemberId = useMemo(() => {
    const map = new Map<string, FirmMemberWorkloadCounts>();
    for (const w of itemsOf(workloadRead)) map.set(w.memberId, w);
    return map;
  }, [workloadRead]);

  const rows = useMemo(
    () => members.map((m) => ({ member: m, counts: workloadByMemberId.get(m.id) })),
    [members, workloadByMemberId],
  );

  // Team-wide totals — over every member, not the filtered/searched view.
  const totals = useMemo(() => {
    if (workloadUnreadable) return null;
    return rows.reduce(
      (acc, r) => ({
        assignedRequests: acc.assignedRequests + (r.counts?.assignedRequests ?? 0),
        openTasks: acc.openTasks + (r.counts?.openTasks ?? 0),
        upcomingHearings: acc.upcomingHearings + (r.counts?.upcomingHearings ?? 0),
      }),
      { assignedRequests: 0, openTasks: 0, upcomingHearings: 0 },
    );
  }, [rows, workloadUnreadable]);

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = q
      ? rows.filter((r) => r.member.displayName.includes(q) || (r.member.email ?? "").toLowerCase().includes(q.toLowerCase()))
      : rows;
    // Unknown counts sink to the bottom rather than looking like a real
    // zero — a member whose workload we couldn't read is not "the lightest".
    const valueOf = (r: (typeof rows)[number]) => {
      if (!r.counts) return -1;
      if (sortBy === "total") return r.counts.assignedRequests + r.counts.openTasks + r.counts.upcomingHearings;
      return r.counts[sortBy];
    };
    return [...list].sort((a, b) => valueOf(b) - valueOf(a));
  }, [rows, search, sortBy]);

  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const card = `rounded-2xl border p-5 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`;

  const subtitle = membersViewState === "loading"
    ? "جاري التحميل…"
    : membersViewState === "unreadable"
      ? "تعذّر تحميل الفريق"
      : countPhraseAr(members.length, { zero: "لا يوجد أعضاء", one: "عضو واحد", two: "عضوان", few: "أعضاء", many: "عضواً" }) ?? "";

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>توزيع عبء العمل</h1>
          <p className={`text-sm ${membersViewState === "unreadable" ? "text-red-500 font-semibold" : muted}`}>{subtitle}</p>
        </div>
        <Link href="/dashboard/firm/team" className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          <UsersThree size={15} /> إدارة الفريق
        </Link>
      </motion.div>

      {membersViewState === "loading" ? (
        <div className={`${card} space-y-2`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
          ))}
        </div>
      ) : membersViewState === "unreadable" ? (
        <div className={`${card} text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة فريق المكتب</p>
          <p className={`text-[12px] ${muted}`}>لم يستجب الخادم لطلب الفريق. هذه ليست قائمة فارغة — قد يكون للمكتب أعضاء لم تُقرأ بياناتهم بعد.</p>
          <button onClick={retry} className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors cursor-pointer">
            إعادة المحاولة
          </button>
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<UsersThree />}
          title="لا يوجد أعضاء بعد"
          description="أضِف زملاءك المحامين إلى فريق المكتب من صفحة إدارة الفريق."
          action={{ label: "إدارة الفريق", href: "/dashboard/firm/team" }}
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "الأعضاء", value: toArabicDigits(members.length), icon: UsersThree, unreadable: false },
              { label: "طلبات مسندة", value: totals ? toArabicDigits(totals.assignedRequests) : "—", icon: Scroll, unreadable: workloadUnreadable },
              { label: "مهام مفتوحة", value: totals ? toArabicDigits(totals.openTasks) : "—", icon: ListChecks, unreadable: workloadUnreadable },
              { label: "جلسات قادمة", value: totals ? toArabicDigits(totals.upcomingHearings) : "—", icon: Gavel, unreadable: workloadUnreadable },
            ].map((kpi, i) => {
              const Icon = kpi.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }} className={card}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${isDark ? "bg-[#0B3D2E]/20" : "bg-[#0B3D2E]/8"}`}>
                    <Icon size={16} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
                  </div>
                  <p className={`text-[24px] font-black font-mono leading-none ${isDark ? "text-white" : "text-slate-900"}`}>{kpi.value}</p>
                  <p className={`text-[11px] mt-1 ${muted}`}>{kpi.label}{kpi.unreadable ? " · تعذّر التحميل" : ""}</p>
                </motion.div>
              );
            })}
          </div>

          {workloadUnreadable && (
            <div className={`${card} flex items-center gap-3 !p-3 border-red-500/20`}>
              <Warning size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-[12px] flex-1">تعذّر تحميل أعباء العمل — الأعداد أدناه غير متاحة حاليًا.</p>
              <button onClick={retry} className="text-[11px] font-bold text-red-500 hover:underline cursor-pointer flex-shrink-0">إعادة المحاولة</button>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
              <MagnifyingGlass size={15} className={muted} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..."
                className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {SORT_OPTIONS.map((s) => (
                <button key={s.key} onClick={() => setSortBy(s.key)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${sortBy === s.key ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                  <SortAscending size={12} /> {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Team */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<MagnifyingGlass />}
              title="لا توجد نتائج مطابقة"
              description="لم يُعثر على أعضاء يطابقون البحث الحالي."
              action={{ label: "إعادة ضبط البحث", onClick: () => setSearch("") }}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => {
                const rc = FIRM_ROLE_CONFIG[r.member.role];
                const sc = FIRM_STATUS_STYLE[r.member.status];
                return (
                  <motion.div key={r.member.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={spring}
                    className={`flex flex-wrap items-center gap-4 p-4 rounded-2xl border transition-all ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${r.member.isOwner ? "bg-gradient-to-br from-[#0B3D2E] to-[#1a5c45]" : "bg-[#0B3D2E]/70"}`}>
                      {r.member.displayName.charAt(0)}
                    </div>
                    <div className="w-40 flex-shrink-0 min-w-0">
                      <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{r.member.displayName}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${rc.bg} ${rc.color}`}>{rc.label}</span>
                        <span className={`text-[10px] ${sc.text}`}>{r.member.isOwner ? "صاحب المكتب" : sc.label}</span>
                      </div>
                    </div>

                    {/* Real counts */}
                    <div className="flex gap-4 flex-1 min-w-[180px] flex-wrap justify-start sm:justify-end">
                      <div className="text-center">
                        <p className={`text-[15px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{cell(r.counts?.assignedRequests, workloadUnreadable)}</p>
                        <p className={`text-[9px] ${muted}`}>طلبات</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-[15px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{cell(r.counts?.openTasks, workloadUnreadable)}</p>
                        <p className={`text-[9px] ${muted}`}>مهام</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-[15px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{cell(r.counts?.upcomingHearings, workloadUnreadable)}</p>
                        <p className={`text-[9px] ${muted}`}>جلسات</p>
                      </div>
                    </div>

                    <Link href={`/dashboard/firm/team/${r.member.id}`} className={`text-[11px] font-bold flex items-center gap-1 hover:underline flex-shrink-0 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      الملف <ArrowLeft size={10} />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* «طلبات» caveat — spelled out once rather than on every row */}
          <p className={`text-[11px] text-center ${muted}`}>
            «طلبات» تقتصر على الطلبات المرتبطة بسجل المكتب في النظام، وقد لا تشمل كل تكليف فعلي.
          </p>
        </>
      )}
    </div>
  );
}
