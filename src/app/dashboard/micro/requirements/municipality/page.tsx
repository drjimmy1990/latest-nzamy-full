"use client";

// Beta honesty gate: «اشتراطات البلدية» has no data model at all — there is
// no municipal-license table, no renewal-tracking record and no permit feed
// behind this screen, only what was hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - ITEMS was five hardcoded checklist rows (رخصة البلدية / السجل التجاري /
//     تصريح الإعلانات / شهادة السلامة / شهادة المخزن) with an invented
//     per-item `status` ('done'/'pending'/'overdue'/'na'), a fabricated
//     `deadline` and `fee` — identical for every micro account that opened
//     the page, none of it a real permit this account holds.
//   - the `aiTip` prop claimed «تصريح الإعلانات منتهٍ منذ أكثر من 90 يوماً»
//     and threatened a ٥٠٠٠ ﷼ fine — a fabricated, urgent claim about this
//     specific account's compliance status, read from nothing.
//   - the checkbox toggle in RequirementsChecklist only flipped local
//     component state — nothing was written or read anywhere, so a reload
//     reset every checked item back to its hardcoded starting status.
//
// The previous UI (and RequirementsChecklist, still in ../_components) is
// preserved in git history and can be restored once a real municipal
// permit/renewal table exists behind this account.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MicroMunicipalityPage() {
  return (
    <DashboardComingSoon
      title="اشتراطات البلدية"
      description="اشتراطات البلدية غير متاحة حالياً. حالة الرخصة والمواعيد والرسوم في هذه الصفحة كانت بيانات ثابتة لا تخص أي منشأة حقيقية، ولم يكن تحديد بند كمكتمل يحفظ شيئاً. ستُفعَّل الصفحة عند ربط رخص البلدية الفعلية بحساب المنشأة."
      backHref="/dashboard/micro/requirements"
    />
  );
}
