"use client";

// Beta honesty gate: «اشتراطات العمل» has no data model at all — there is
// no Nitaqat/Qiwa/Mudad compliance record behind this screen, only what
// was hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - ITEMS was five hardcoded checklist rows (نسبة السعودة / عقود العمل /
//     حماية الأجور / تصاريح العمالة الوافدة / رفع كشوفات WPS) with an
//     invented per-item `status` and `deadline` — identical for every
//     micro account that opened the page, none of it this account's
//     actual Saudization or WPS status.
//   - the `aiTip` prop claimed work permits were "تقترب من انتهاء
//     صلاحيتها" — a fabricated, urgent claim about this account's
//     residency-permit expiries.
//   - the checkbox toggle in RequirementsChecklist only flipped local
//     component state — nothing was written or read anywhere.
//
// The previous UI (and RequirementsChecklist, still in ../_components) is
// preserved in git history and can be restored once a real labor/WPS
// compliance record exists behind this account.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MicroLaborPage() {
  return (
    <DashboardComingSoon
      title="اشتراطات العمل والتوظيف"
      description="اشتراطات العمل غير متاحة حالياً. نسبة السعودة وحالة العقود وحماية الأجور والتصاريح في هذه الصفحة كانت بيانات ثابتة لا تخص أي منشأة حقيقية، ولم يكن تحديد بند كمكتمل يحفظ شيئاً. ستُفعَّل الصفحة عند ربط سجل التزام العمل الفعلي بحساب المنشأة."
      backHref="/dashboard/micro/requirements"
    />
  );
}
