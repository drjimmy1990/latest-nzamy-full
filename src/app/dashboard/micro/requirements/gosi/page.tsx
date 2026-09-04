"use client";

// Beta honesty gate: «التأمينات الاجتماعية» has no data model at all —
// there is no GOSI registration/contribution record behind this screen,
// only what was hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - ITEMS was five hardcoded checklist rows (تسجيل المنشأة / تسجيل
//     الموظفين / اشتراكات شهرية / تحديث بيانات / تأمين مخاطر العمل) with
//     an invented per-item `status`, `deadline` and `fee` — identical for
//     every micro account that opened the page, none of it this account's
//     actual GOSI status.
//   - the `aiTip` prop claimed a specific monthly-contribution deadline and
//     a "١٪ عن كل شهر تأخير" penalty rate — a fabricated claim about this
//     account.
//   - the checkbox toggle in RequirementsChecklist only flipped local
//     component state — nothing was written or read anywhere.
//
// The previous UI (and RequirementsChecklist, still in ../_components) is
// preserved in git history and can be restored once a real GOSI
// registration/contribution record exists behind this account.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MicroGosiPage() {
  return (
    <DashboardComingSoon
      title="التأمينات الاجتماعية (GOSI)"
      description="التأمينات الاجتماعية غير متاحة حالياً. حالة التسجيل والاشتراكات والمواعيد في هذه الصفحة كانت بيانات ثابتة لا تخص أي منشأة حقيقية، ولم يكن تحديد بند كمكتمل يحفظ شيئاً. ستُفعَّل الصفحة عند ربط سجل GOSI الفعلي بحساب المنشأة."
      backHref="/dashboard/micro/requirements"
    />
  );
}
