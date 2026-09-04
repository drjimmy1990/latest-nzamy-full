"use client";

/**
 * Firm team member profile — rebuilt 2026-09-04 (owner review item 4:
 * "both pages still read MOCK_TEAM").
 *
 * ── WHAT CHANGED ─────────────────────────────────────────────────────────
 * This page used to render `MOCK_TEAM` (`@/constants/firmTeamData`) — an
 * invented bio, education, courts, a "قضايا مكسوبة" won/total ratio, a star
 * rating, `utilizationRate`/`deadlineAdherence` percentages, a gamified
 * task-weight point system with fabricated "achievements", and a tab of
 * "shared files" with invented collaborator names. None of it came from a
 * query, and `useParams` fell back to `MOCK_TEAM[0]` for any id that didn't
 * match — so an unmatched id silently rendered a DIFFERENT person's profile.
 *
 * It now reads the real `firm_members` roster
 * (`@/lib/services/firmMembersService`, same read `team/page.tsx` uses) and
 * three real per-member counts computed from RLS-visible rows
 * (`@/lib/services/firmMemberWorkloadService` →
 * `GET /api/v1/firm/members/workload`): service requests assigned to this
 * member, this member's own open tasks, and this member's own upcoming
 * hearings. Every number on this page comes from one of those two reads —
 * see `@/lib/services/firmMemberWorkload` for exactly what each count means
 * and the documented gap in "طلبات مسندة" (it can under-count; that file
 * explains why and the caption on the tile says so).
 *
 * ── WHAT WAS REMOVED, AND WHY IT HAS NO REPLACEMENT HERE ───────────────────
 * Nothing in `firm_members` (or anywhere else RLS lets this viewer read)
 * backs these, so they are gone rather than re-mocked:
 *   • bio, education, courts, expertise, primaryResponsibilities/assistsIn
 *                                    — free text with no column, ever.
 *   • casesWon/casesTotal, rating    — no case-assignment-to-member link and
 *                                      no rating table exists.
 *   • utilizationRate, deadlineAdherence — no such measurement exists
 *                                      anywhere in the schema.
 *   • the achievements tab, the task-weight point system, "vs team average"
 *                                    — all arithmetic over the invented
 *                                      point system above; the system itself
 *                                      is gone, so there is nothing left to
 *                                      compute achievements or an average
 *                                      from.
 *   • the "files" tab (solo + "shared" work items with collaborator names)
 *                                    — no per-member case-file list exists;
 *                                      what DOES exist and IS shown is the
 *                                      count of service requests assigned to
 *                                      this member, not a titled list of
 *                                      them.
 *   • «تصدير PDF», «إسناد مهمة», «تعديل الملف» buttons — none had a
 *                                      handler; they were dead affordances,
 *                                      not deferred features.
 *   • the phone number — `firm_members` has no phone column and
 *                                      `profiles.phone` is not exposed by
 *                                      the members route (see that route's
 *                                      own comment on why).
 *   • any "share link" — grepped for one across this file and the workload
 *                                      page before this rewrite; neither
 *                                      contained one to remove.
 *
 * Role/status management (change role, suspend/activate) already lives on
 * `team/page.tsx` and is not duplicated here — this page is deliberately
 * read-only.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft, Envelope, CalendarBlank, Crown, Warning,
  Scroll, ListChecks, Gavel,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { getFirmMembers, type FirmMember } from "@/lib/services/firmMembersService";
import { getFirmMemberWorkload, type FirmMemberWorkloadCounts } from "@/lib/services/firmMemberWorkloadService";
import { type ListRead, listViewState, itemsOf, type ListViewState } from "@/lib/services/listRead";
import { countTileAr } from "@/lib/services/arabicCount";
import { FIRM_ROLE_CONFIG, FIRM_STATUS_STYLE, formatMemberDate } from "@/constants/firmMemberDisplay";

const sp = { type: "spring" as const, stiffness: 260, damping: 24 };

function StatTile({
  icon: Icon, label, viewState, value, note, isDark,
}: {
  icon: React.ElementType; label: string; viewState: ListViewState;
  value: number | undefined; note?: string; isDark: boolean;
}) {
  const display =
    viewState === "loading" ? "…" :
    viewState === "unreadable" ? "—" :
    value === undefined ? "—" :
    countTileAr(value);

  return (
    <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-black/[0.06] bg-white/80"}`}>
      <div className="flex items-center gap-2 mb-2 opacity-60">
        <Icon size={14} className="text-[#C8A762]" />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="font-mono text-2xl font-bold text-[#C8A762]">{display}</div>
      {viewState === "unreadable" ? (
        <p className="text-[10px] mt-1 text-red-400">تعذّر تحميل هذا الرقم</p>
      ) : note ? (
        <p className="text-[10px] mt-1 opacity-40">{note}</p>
      ) : null}
    </div>
  );
}

export default function FirmTeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { isDark } = useTheme();

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
  // Never fall back to another member on a missing/unmatched id — that was
  // the old page's defect (`MOCK_TEAM.find(...) ?? MOCK_TEAM[0]`).
  const member = members.find((m) => m.id === id);

  const workloadViewState = listViewState(workloadLoading, workloadRead);
  const workloadItems = itemsOf(workloadRead);
  const counts = workloadItems.find((w) => w.memberId === id);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-black/[0.06] bg-white/80";

  return (
    <div dir="rtl" className={`min-h-screen p-4 md:p-8 ${isDark ? "bg-zinc-950 text-white" : "bg-slate-50 text-zinc-900"}`}>
      <Link href="/dashboard/firm/team" className="inline-flex items-center gap-2 text-sm opacity-60 hover:opacity-100 mb-6 transition-opacity">
        <ArrowLeft size={16} />
        <span>العودة للفريق</span>
      </Link>

      {membersViewState === "loading" ? (
        <div className={`${card} overflow-hidden animate-pulse`}>
          <div className="h-24 w-full bg-white/5" />
          <div className="px-6 pb-6 pt-4 space-y-3">
            <div className="h-6 w-40 rounded bg-white/10" />
            <div className="h-4 w-64 rounded bg-white/5" />
          </div>
        </div>
      ) : membersViewState === "unreadable" ? (
        <div className={`${card} p-6 text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className="text-[14px] font-bold">تعذّرت قراءة بيانات الفريق</p>
          <p className="text-[12px] opacity-60">لم يستجب الخادم لطلب الفريق. هذه ليست بيانات فارغة — قد يكون العضو موجودًا ولم تُقرأ بياناته بعد.</p>
          <button onClick={retry} className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors cursor-pointer">
            إعادة المحاولة
          </button>
        </div>
      ) : !member ? (
        <EmptyState
          icon={<Warning />}
          title="لم يُعثر على هذا العضو"
          description="قد يكون رابطًا قديمًا، أو أن العضو أُزيل من فريق المكتب."
          action={{ label: "العودة لفريق المكتب", href: "/dashboard/firm/team" }}
        />
      ) : (
        <>
          {/* Hero Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={sp}
            className={`${card} overflow-hidden mb-6`}>
            <div className="h-24 w-full" style={{ background: "linear-gradient(135deg,#0B3D2E,#C8A762)" }} />
            <div className="px-6 pb-6">
              <div className="flex items-end justify-between -mt-10 mb-4 flex-wrap gap-3">
                <div className="w-20 h-20 rounded-2xl border-4 border-[#0B3D2E] bg-gradient-to-br from-[#0B3D2E] to-[#C8A762] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  {member.displayName.charAt(0)}
                </div>
                {member.isOwner && (
                  <span className="text-xs px-3 py-1 rounded-full bg-[#C8A762]/20 text-[#C8A762] font-semibold flex items-center gap-1">
                    <Crown size={12} weight="fill" /> صاحب المكتب
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-xl font-bold mb-1">{member.displayName}</h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const rc = FIRM_ROLE_CONFIG[member.role];
                      return (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${rc.bg} ${rc.color}`}>
                          <rc.icon size={11} />
                          {rc.label}
                        </span>
                      );
                    })()}
                    {(() => {
                      const sc = FIRM_STATUS_STYLE[member.status];
                      return (
                        <span className={`flex items-center gap-1 text-xs ${sc.text}`}>
                          <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                          {member.isOwner ? "صاحب المكتب" : sc.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-[#C8A762] mb-0.5">
                    <CalendarBlank size={14} />
                    <span className="text-sm font-semibold">{formatMemberDate(member.acceptedAt ?? member.createdAt)}</span>
                  </div>
                  <div className="text-xs opacity-50">عضو منذ</div>
                </div>
              </div>

              {member.email && (
                <div className="flex gap-3 mt-4 flex-wrap">
                  <a href={`mailto:${member.email}`} className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity" dir="ltr">
                    <Envelope size={13} />{member.email}
                  </a>
                </div>
              )}
            </div>
          </motion.div>

          {/* Real per-member counts */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...sp, delay: 0.05 }}>
            <h2 className="text-sm font-bold opacity-60 mb-3">عبء العمل الحالي</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatTile
                icon={Scroll} label="طلبات مسندة" isDark={isDark}
                viewState={workloadViewState} value={counts?.assignedRequests}
                note="ضمن الطلبات المرتبطة بسجل المكتب في النظام — قد لا يشمل كل تكليف فعلي"
              />
              <StatTile
                icon={ListChecks} label="مهام مفتوحة" isDark={isDark}
                viewState={workloadViewState} value={counts?.openTasks}
              />
              <StatTile
                icon={Gavel} label="جلسات قادمة" isDark={isDark}
                viewState={workloadViewState} value={counts?.upcomingHearings}
              />
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
