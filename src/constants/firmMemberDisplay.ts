/**
 * firmMemberDisplay.ts — role/status presentation shared by
 * `team/[id]/page.tsx` and `team/workload/page.tsx`.
 *
 * `team/page.tsx` keeps its own copy of the same two tables (`ROLE_CONFIG`,
 * `STATUS_STYLE`) — it is out of scope for this build task, so this module
 * is not imported there and nothing there was touched. All three team
 * screens map the same 13 real `FirmRole` values and 4 real
 * `FirmMemberStatus` values (`@/types/firmBackendReady`,
 * `@/lib/services/firmMembersService`); if a role's color or icon ever needs
 * to change, it needs to change in both places until someone unifies them.
 */

import {
  Users, Gavel, Star, Warning, Key, Student,
} from "@phosphor-icons/react";
import type { FirmRole } from "@/types/firmBackendReady";
import type { FirmMemberStatus } from "@/lib/services/firmMembersService";

export const FIRM_ROLE_CONFIG: Record<FirmRole, { label: string; color: string; bg: string; icon: React.ElementType }> = {
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

export const FIRM_STATUS_STYLE: Record<FirmMemberStatus, { label: string; dot: string; text: string }> = {
  active: { label: "نشط", dot: "bg-emerald-400", text: "text-emerald-500" },
  invited: { label: "بانتظار القبول", dot: "bg-amber-400 animate-pulse", text: "text-amber-500" },
  suspended: { label: "معلَّق", dot: "bg-orange-400", text: "text-orange-500" },
  removed: { label: "مُزال", dot: "bg-zinc-400", text: "text-zinc-500" },
};

export function formatMemberDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(iso);
  }
}
