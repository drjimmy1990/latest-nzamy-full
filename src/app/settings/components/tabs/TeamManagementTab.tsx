"use client";

/**
 * 2026-09-04 — Phase 6 (compliance/delegation/team/profession honesty pass).
 *
 * ── WHAT CHANGED ─────────────────────────────────────────────────────────
 * This tab used to render `getMockTeam(userType)` — a hard-coded roster of
 * two to five invented people per account type, complete with fabricated
 * names, e-mails, "last active" strings and statuses — plus a compact
 * invite form whose submit handler wrote the new "member" into local state
 * only and closed with «تم إنشاء دعوة محلية إلى … - الرابط وهمي وجاهز
 * للربط بالبريد/الجوال لاحقاً» (item: a link that does not exist, said to
 * be an invitation). "Change role" / "suspend" / "remove" menu actions did
 * the same: `setLocalMessage` and nothing else.
 *
 * A real roster exists for TWO account types:
 *   • firm      → `public.firm_members` (Phase 2, migration
 *     20260903_phase2_clients_and_firm_membership.sql), through
 *     `/api/v1/firm/members` and `@/lib/services/firmMembersService`;
 *     management surface at `src/app/dashboard/firm/team/page.tsx`.
 *   • corporate → `public.business_members` (20260603_phase1_002_entities.sql),
 *     through `/api/v1/business/members` and
 *     `@/lib/services/businessMembersService` (WP-6 B-5); management surface
 *     at `src/app/dashboard/business/team/page.tsx`.
 *
 * So this tab does exactly two things for either: reads that roster (name,
 * role, status) and links out to the real team page for anything that changes
 * it — inviting, changing a role, suspending, removing. It does not duplicate
 * that page's write surface; duplicating it here would be a second place for
 * the same roster to drift out of sync.
 *
 * ── WHAT THIS FILE USED TO SAY, AND WHY IT WAS WRONG ──────────────────────
 * Until WP-6 B-5 the panel below told a corporate account «لا يوجد لهذا النوع
 * من الحسابات جدول أعضاء مماثل بعد». `public.business_members` has existed
 * since 20260603 with nine roles and four statuses; what did not exist was
 * any code that wrote it — the audit's own words, «factually wrong about the
 * schema but correct about the code». Now that the API exists, the sentence is
 * wrong twice over, so it is gone rather than softened.
 *
 * Every other account type this tab could render for (lawyer, government, ngo
 * — see `getSettingsRolePolicy`'s `visibleTabs`) has no comparable members
 * table, so it gets the honest empty state instead of an invented roster.
 *
 * ── SEAT MATH ────────────────────────────────────────────────────────────
 * The old tab computed `usedSeats` / `seatsFull` against
 * `getSettingsRolePolicy(user).seatPolicy`. That field is declared in
 * `@/constants/settingsReadiness` and is NEVER populated by any branch of
 * `getSettingsRolePolicy` (see that file's own note on `seatPolicy`) — there
 * is no seat table and nothing counts a plan quota. With the local invite
 * form gone there is nothing left in this file to gate on a quota anyway;
 * the member count shown below is the real length of the roster this tab
 * just read, not a comparison against an invented "included" number.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowSquareOut, Clock, UsersThree } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import {
  getFirmMembers,
  type FirmMember,
  type FirmMemberStatus,
} from "@/lib/services/firmMembersService";
import { getBusinessMembers, type BusinessMember } from "@/lib/services/businessMembersService";
import { BUSINESS_ROLE_LABEL } from "@/lib/auth/businessMembershipAccess";
import { itemsOf, listViewState, type ListRead } from "@/lib/services/listRead";
import { EmptyPanel, SectionTitle } from "./_shared";

const FIRM_TEAM_PAGE_HREF = "/dashboard/firm/team";
const BUSINESS_TEAM_PAGE_HREF = "/dashboard/business/team";

const STATUS_STYLE: Record<FirmMemberStatus, { label: string; color: string }> = {
  active: { label: "نشط", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20" },
  invited: { label: "بانتظار القبول", color: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20" },
  suspended: { label: "معلَّق", color: "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20" },
  removed: { label: "مُزال", color: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800" },
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

/**
 * One row shape for both rosters, so the list below is written once.
 *
 * `displayName` is `string | null` because either roster's name lookup can
 * fail — «we could not read this name» is a different fact from «this person
 * has no name», and the list says so rather than printing a dash for both.
 */
interface RosterRow {
  id: string;
  displayName: string | null;
  email: string | null;
  roleLabel: string;
  status: FirmMemberStatus;
  isOwner: boolean;
  date: string | null;
}

function firmRow(m: FirmMember): RosterRow {
  return {
    id: m.id,
    displayName: m.displayName,
    email: m.email,
    roleLabel: FIRM_ROLE_LABEL[m.role],
    status: m.status,
    isOwner: m.isOwner,
    date: m.acceptedAt ?? m.createdAt,
  };
}

function businessRow(m: BusinessMember): RosterRow {
  return {
    id: m.id,
    displayName: m.displayName,
    email: m.email,
    roleLabel: BUSINESS_ROLE_LABEL[m.role],
    status: m.status,
    isOwner: m.isOwner,
    date: m.acceptedAt ?? m.createdAt,
  };
}

export function TeamManagementTab() {
  const { userType, loading: userLoading } = useUser();
  const isFirm = userType === "firm";
  const isCorporate = userType === "corporate";
  const hasRoster = isFirm || isCorporate;

  const [membersLoading, setMembersLoading] = useState(true);
  const [read, setRead] = useState<ListRead<RosterRow> | null>(null);

  const load = useCallback(async () => {
    setMembersLoading(true);
    if (isCorporate) {
      const { list } = await getBusinessMembers();
      setRead(list.ok ? { ...list, items: list.items.map(businessRow) } : list);
    } else {
      const result = await getFirmMembers();
      setRead(result.ok ? { ...result, items: result.items.map(firmRow) } : result);
    }
    setMembersLoading(false);
  }, [isCorporate]);

  useEffect(() => {
    if (userLoading || !hasRoster) return;
    load();
  }, [userLoading, hasRoster, load]);

  // The role is not known yet — do not decide between the real roster and
  // the "not available for this account" panel on a `userType` that has not
  // finished loading and may still resolve to "firm".
  if (userLoading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center dark:border-white/[0.06] dark:bg-dark-card">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">جارٍ التحقق من نوع الحساب...</p>
      </div>
    );
  }

  if (!hasRoster) {
    return (
      <div className="space-y-6">
        <EmptyPanel
          icon={<UsersThree size={26} />}
          title="إدارة الفريق غير متاحة لهذا النوع من الحسابات"
          description="فريق حقيقي مُدار من هذه الصفحة موجود حالياً لحسابات مكاتب المحاماة (جدول أعضاء المكتب public.firm_members) وحسابات الشركات (public.business_members). لا يوجد لهذا النوع من الحسابات جدول أعضاء مماثل بعد، فلا تعرض هذه الصفحة قائمة مختلقة بدلاً منه."
        />
      </div>
    );
  }

  const viewState = listViewState(membersLoading, read);
  const members = itemsOf(read);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-dark-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <SectionTitle>
              {isCorporate ? "فريق الشركة" : "فريق المكتب"}
              {viewState === "ready" ? ` (${members.length})` : ""}
            </SectionTitle>
            <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">
              {isCorporate
                ? "هذه القائمة قراءة من أعضاء الشركة الفعليين. إضافة عضو وتغيير الأدوار وتعليق العضوية وإزالة الأعضاء كلها من صفحة الفريق، ومتاحة لمالك الحساب فقط."
                : "هذه القائمة قراءة من فريق المكتب الفعلي. دعوة عضو جديد وتغيير الأدوار وتعليق الحسابات وحذف الأعضاء كلها من صفحة الفريق."}
            </p>
          </div>
          <Link
            href={isCorporate ? BUSINESS_TEAM_PAGE_HREF : FIRM_TEAM_PAGE_HREF}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)] transition-colors hover:bg-royal/90"
          >
            <ArrowSquareOut size={16} />
            {isCorporate ? "فتح صفحة الفريق لإضافة عضو" : "فتح صفحة الفريق لدعوة عضو"}
          </Link>
        </div>
      </div>

      {viewState === "loading" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center dark:border-white/[0.06] dark:bg-dark-card">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">جارٍ تحميل الفريق...</p>
        </div>
      ) : viewState === "unreadable" ? (
        <EmptyPanel
          icon={<UsersThree size={26} />}
          title={isCorporate ? "تعذّر تحميل فريق الشركة" : "تعذّر تحميل فريق المكتب"}
          description="حدث خطأ أثناء قراءة أعضاء الفريق. أعد فتح هذه الصفحة، أو راجع صفحة الفريق مباشرة."
        />
      ) : viewState === "empty" ? (
        <EmptyPanel
          icon={<UsersThree size={26} />}
          title="لا يوجد أعضاء في الفريق بعد"
          description={isCorporate ? "لم يُضَف أي عضو إلى شركتك حتى الآن. أضف أول عضو من صفحة الفريق." : "لم يُضَف أي عضو إلى مكتبك حتى الآن. أضف أول عضو من صفحة الفريق."}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.06] dark:bg-dark-card">
          {members.map((member) => {
            const status = STATUS_STYLE[member.status];
            return (
              <div
                key={member.id}
                className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-0 dark:border-white/[0.04]"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 text-sm font-bold text-white">
                  {(member.displayName ?? "").trim().charAt(0) || "؟"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* null means the joined `profiles` row was not readable
                        (business rosters read it with the caller's own RLS
                        client), which is not the same as an empty name. */}
                    <p className={`truncate text-sm font-semibold ${member.displayName ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500"}`}>
                      {member.displayName ?? "الاسم غير متاح"}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.color}`}>
                      {status.label}
                    </span>
                    {member.isOwner && (
                      <span className="text-[10px] font-bold text-[#C8A762]">المالك</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {member.roleLabel}
                    {member.email ? ` — ${member.email}` : ""}
                  </p>
                </div>

                <div className="hidden items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 sm:flex">
                  <Clock size={12} />
                  {formatDate(member.date)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
