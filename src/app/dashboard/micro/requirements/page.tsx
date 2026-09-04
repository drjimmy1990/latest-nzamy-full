"use client";

// Beta honesty gate: «اشتراطات ومتطلبات النشاط» is the overview for the
// five requirement sections below it, none of which has a data model — see
// the honesty gates in ./municipality, ./zakat, ./gosi, ./labor and
// ./licenses.
//
// WHAT WAS REMOVED, and why:
//   - SECTIONS carried a hardcoded `severity` and `statusAr` per section
//     («1 منتهي» / «تنتهي قريباً» / «سارية») — the same five statuses for
//     every micro account that opened the page, none of it a real permit
//     or filing state.
//   - the three summary KPI tiles (سارية / تحتاج تجديد / منتهية) were
//     counts over that same hardcoded array, so the totals were exactly as
//     fabricated as the rows they were summed from.
//   - the red banner («يوجد ١ قسم به تراخيص منتهية… قد تعرّض منشأتك
//     لغرامات») asserted a specific compliance violation for this account,
//     read from nothing.
//
// The previous UI is preserved in git history and can be restored once a
// real requirements/compliance record exists behind this account.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MicroRequirementsIndex() {
  return (
    <DashboardComingSoon
      title="اشتراطات ومتطلبات النشاط"
      description="اشتراطات النشاط غير متاحة حالياً. حالة التراخيص وأعداد المنتهي والمتبقي في هذه الصفحة كانت بيانات ثابتة لا تخص أي منشأة حقيقية. ستُفعَّل الصفحة عند ربط سجل الاشتراطات الفعلي بحساب المنشأة."
      backHref="/dashboard/micro"
    />
  );
}
