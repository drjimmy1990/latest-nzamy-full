"use client";

// Beta honesty gate: «إدارة الأقسام» promised departments, representatives,
// a monthly request/cost roll-up and "AI insight" alerts, and none of it was
// this company's data.
//
// WHAT WAS REMOVED, and why:
//   - MOCK_DEPTS was four hardcoded rows (hr / legal / procurement /
//     compliance) with invented representative names, emails, monthly
//     request counts and monthly costs — identical for every corporate
//     account that opened the page, none of it read from anywhere.
//   - the four stat tiles (إجمالي الإدارات / الطلبات شهرياً / التكلفة شهرياً /
//     اقتراحات AI) were sums over that same array, so the totals were exactly
//     as fabricated as the rows they were summed from.
//   - the "AI insight" banner («تستهلك ٨+ استشارات/شهر — هل تريد تعيين مستشار
//     دائم؟») was a literal string on one mock row, not a computed suggestion.
//   - «إضافة إدارة» accepted a name and a representative and showed «تم إضافة
//     الإدارة!» — nothing was written anywhere; a reload lost it and the four
//     mock rows were exactly what the next visitor saw.
//
// This route is already withheld from a non-admin corporate account by
// `isHiddenBusinessSection` (see the removal note atop
// src/constants/navigation.sidebars.business.ts:20 — «الأقسام → …
// MOCK_DEPTS») and src/app/dashboard/business/layout.tsx's SectionNotReady
// guard. An admin is exempt from that guard and still reached this page
// directly, which is why it is gated honestly here too rather than left as
// invented data behind an admin-only door.
//
// src/constants/navigation.navbar.ts still links «الأقسام» at the top nav
// (CORPORATE_NAV) — that file is owner-authored wording and is left
// untouched here; closing that link, or the sidebar's own already-hidden
// entry, is a separate call for whoever owns that file.
//
// The previous UI is preserved in git history and can be restored once a
// real departments table (and representative/spend data behind it) exists.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function DepartmentsPage() {
  return (
    <DashboardComingSoon
      title="إدارة الأقسام"
      description="إدارة الأقسام غير متاحة حالياً. الإدارات وممثلوها وأرقام الطلبات والتكلفة الشهرية وتنبيهات الذكاء الاصطناعي في هذه الصفحة كانت بيانات ثابتة لا تخص أي شركة حقيقية، و«إضافة إدارة» لم تكن تحفظ شيئاً. ستُفعَّل الصفحة عند ربط جدول أقسام حقيقي بحساب المنشأة."
      backHref="/dashboard/business"
    />
  );
}
