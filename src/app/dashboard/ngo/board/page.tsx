"use client";

// Beta honesty gate: «مجلس الإدارة» has no data model at all — there is no
// board-membership table, no committee record and no decision/approval log
// behind this screen, only what was hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - BOARD_MEMBERS was three hardcoded members with invented names, roles
//     and committee assignments — the same three for every NGO account that
//     opened the page.
//   - DECISIONS was three hardcoded board decisions with invented statuses
//     and owners — nothing a real board of this NGO ever voted on.
//   - the four stat tiles (أعضاء المجلس / قرارات مفتوحة / سياسات حوكمة /
//     محاضر جاهزة) were the mock array's length plus three bare literals
//     («2», «6», «4») with no record behind any of them.
//   - «دعوة عضو» and «إجراء محلي» each only replaced the notice banner's
//     text (setNotice) — no invitation was sent and no decision was recorded.
//   - the "Backend-ready" badge on this page was itself the false claim:
//     there is no Board/Governance API to be ready against.
//
// The previous UI is preserved in git history and can be restored once a
// real board-membership, committee and decision-log model exists behind it.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function NgoBoardPage() {
  return (
    <DashboardComingSoon
      title="مجلس الإدارة"
      description="إدارة مجلس الإدارة غير متاحة حالياً. أعضاء المجلس واللجان والقرارات وحالات الاعتماد في هذه الصفحة كانت بيانات ثابتة لا تخص أي جمعية حقيقية، ولم تكن أزرار «دعوة عضو» و«إجراء محلي» ترسل دعوة أو تسجّل قراراً. ستُفعَّل الصفحة عند ربط نموذج عضوية مجلس وسجل قرارات حقيقي بحساب الجمعية."
      backHref="/dashboard/ngo"
    />
  );
}
