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
 * A real roster exists for exactly one account type: `public.firm_members`
 * (Phase 2, migration 20260903_phase2_clients_and_firm_membership.sql),
 * read and written through `/api/v1/firm/members` — see
 * `@/lib/services/firmMembersService` and the full management surface at
 * `src/app/dashboard/firm/team/page.tsx`. So this tab now does exactly two
 * things for a firm account: reads that same roster (name, role, status)
 * and links out to the real team page for anything that changes it —
 * inviting, changing a role, suspending, removing. It does not duplicate
 * that page's write surface; duplicating it here would be a second place
 * for the same roster to drift out of sync.
 *
 * Every other account type this tab could render for (lawyer, corporate,
 * government, ngo — see `getSettingsRolePolicy`'s `visibleTabs`) has no
 * comparable members table, so it gets the honest empty state instead of a
 * second invented roster.
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
import { itemsOf, listViewState, type ListRead } from "@/lib/services/listRead";
import { EmptyPanel, SectionTitle } from "./_shared";

const TEAM_PAGE_HREF = "/dashboard/firm/team";

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

export function TeamManagementTab() {
  const { userType, loading: userLoading } = useUser();
  const isFirm = userType === "firm";

  const [membersLoading, setMembersLoading] = useState(true);
  const [read, setRead] = useState<ListRead<FirmMember> | null>(null);

  const load = useCallback(async () => {
    setMembersLoading(true);
    const result = await getFirmMembers();
    setRead(result);
    setMembersLoading(false);
  }, []);

  useEffect(() => {
    if (userLoading || !isFirm) return;
    load();
  }, [userLoading, isFirm, load]);

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

  if (!isFirm) {
    return (
      <div className="space-y-6">
        <EmptyPanel
          icon={<UsersThree size={26} />}
          title="إدارة الفريق غير متاحة لهذا النوع من الحسابات"
          description="فريق حقيقي مُدار من هذه الصفحة موجود حالياً فقط لحسابات مكاتب المحاماة (جدول أعضاء المكتب public.firm_members). لا يوجد لهذا النوع من الحسابات جدول أعضاء مماثل بعد، فلا تعرض هذه الصفحة قائمة مختلقة بدلاً منه."
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
              فريق المكتب{viewState === "ready" ? ` (${members.length})` : ""}
            </SectionTitle>
            <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">
              هذه القائمة قراءة من فريق المكتب الفعلي. دعوة عضو جديد وتغيير الأدوار وتعليق الحسابات وحذف الأعضاء كلها من صفحة الفريق.
            </p>
          </div>
          <Link
            href={TEAM_PAGE_HREF}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)] transition-colors hover:bg-royal/90"
          >
            <ArrowSquareOut size={16} />
            فتح صفحة الفريق لدعوة عضو
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
          title="تعذّر تحميل فريق المكتب"
          description="حدث خطأ أثناء قراءة أعضاء الفريق. أعد فتح هذه الصفحة، أو راجع صفحة الفريق مباشرة."
        />
      ) : viewState === "empty" ? (
        <EmptyPanel
          icon={<UsersThree size={26} />}
          title="لا يوجد أعضاء في الفريق بعد"
          description="لم يُضَف أي عضو إلى مكتبك حتى الآن. أضف أول عضو من صفحة الفريق."
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
                  {member.displayName.trim().charAt(0) || "؟"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {member.displayName}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.color}`}>
                      {status.label}
                    </span>
                    {member.isOwner && (
                      <span className="text-[10px] font-bold text-[#C8A762]">المالك</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {FIRM_ROLE_LABEL[member.role]}
                    {member.email ? ` — ${member.email}` : ""}
                  </p>
                </div>

                <div className="hidden items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 sm:flex">
                  <Clock size={12} />
                  {member.acceptedAt ? formatDate(member.acceptedAt) : formatDate(member.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
