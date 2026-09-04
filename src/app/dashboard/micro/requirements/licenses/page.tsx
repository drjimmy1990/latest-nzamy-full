"use client";

// Beta honesty gate: «التراخيص التخصصية» has no data model at all — there
// is no specialized-license (health / CITC / SFDA / SASO) record behind
// this screen, only what was hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - ITEMS was six hardcoded checklist rows (الجهة الرقابية / وزارة الصحة
//     / CITC / SFDA / التجديد السنوي / SASO) with an invented per-item
//     `status` and `deadline` — identical for every micro account that
//     opened the page, none of it this account's actual license mix.
//   - the `aiTip` prop claimed renewal "يستغرق ٣٠-٦٠ يوماً" and urged
//     starting "قبل ٩٠ يوماً" — a fabricated, generic claim treated as if
//     it were computed for this account.
//   - the checkbox toggle in RequirementsChecklist only flipped local
//     component state — nothing was written or read anywhere.
//
// The previous UI (and RequirementsChecklist, still in ../_components) is
// preserved in git history and can be restored once a real specialized-
// license record exists behind this account.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MicroLicensesPage() {
  return (
    <DashboardComingSoon
      title="التراخيص التخصصية"
      description="التراخيص التخصصية غير متاحة حالياً. حالة تراخيص الجهات الرقابية ومواعيد تجديدها في هذه الصفحة كانت بيانات ثابتة لا تخص أي منشأة حقيقية، ولم يكن تحديد بند كمكتمل يحفظ شيئاً. ستُفعَّل الصفحة عند ربط سجل التراخيص الفعلي بحساب المنشأة."
      backHref="/dashboard/micro/requirements"
    />
  );
}
