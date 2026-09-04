"use client";

// Beta honesty gate: «الزكاة والضريبة» has no data model at all — there is
// no ZATCA registration/filing record behind this screen, only what was
// hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - ITEMS was five hardcoded checklist rows (تسجيل ZATCA / الإقرار
//     الفصلي / الفوترة الإلكترونية / زكاة الأعمال / ضريبة الاستقطاع) with
//     an invented per-item `status`, `deadline` and `fee` — identical for
//     every micro account that opened the page, none of it this account's
//     actual filing status.
//   - the `aiTip` prop claimed a specific VAT return deadline («تستحق قبل
//     ٣٠ يونيو») — a fabricated, dated claim about this account.
//   - the checkbox toggle in RequirementsChecklist only flipped local
//     component state — nothing was written or read anywhere.
//
// The previous UI (and RequirementsChecklist, still in ../_components) is
// preserved in git history and can be restored once a real ZATCA
// registration/filing record exists behind this account.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MicroZakatPage() {
  return (
    <DashboardComingSoon
      title="الزكاة والضريبة (ZATCA)"
      description="الزكاة والضريبة غير متاحة حالياً. حالة التسجيل والإقرارات والمواعيد في هذه الصفحة كانت بيانات ثابتة لا تخص أي منشأة حقيقية، ولم يكن تحديد بند كمكتمل يحفظ شيئاً. ستُفعَّل الصفحة عند ربط سجل ZATCA الفعلي بحساب المنشأة."
      backHref="/dashboard/micro/requirements"
    />
  );
}
