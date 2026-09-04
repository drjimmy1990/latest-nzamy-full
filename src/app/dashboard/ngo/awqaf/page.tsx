"use client";

// Beta honesty gate: «الأوقاف والأصول» has no data model at all — there is no
// waqf/asset table, no revenue ledger and no approval record behind this
// screen, only what was hardcoded here.
//
// WHAT WAS REMOVED, and why:
//   - AWQAF was three hardcoded waqf rows (WQF-001..003) with invented asset
//     types, monthly revenue figures and an approval status — the same three
//     for every NGO account that opened the page.
//   - the three stat tiles (الأوقاف المسجلة / ريع شهري تقديري / برامج مرتبطة)
//     summed or hardcoded on top of that same array — «91,700 ر.س» and «3»
//     were literals, not a computation over anything real.
//   - «إضافة وقف» and «معاينة المصدر» each only replaced the notice banner's
//     text (setNotice) — no form opened, nothing was written or read.
//   - the "Backend-ready" badge on this page was itself the false claim:
//     there is no WaqfAsset API to be ready against.
//
// The previous UI is preserved in git history and can be restored once a
// real waqf/asset table and an approval record exist behind it.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function NgoAwqafPage() {
  return (
    <DashboardComingSoon
      title="الأوقاف والأصول"
      description="إدارة الأوقاف غير متاحة حالياً. الأوقاف والأصول والريع الشهري وحالة الاعتماد في هذه الصفحة كانت بيانات ثابتة لا تخص أي جمعية حقيقية، ولم يكن زرا «إضافة وقف» و«معاينة المصدر» يحفظان أو يعرضان شيئاً. ستُفعَّل الصفحة عند ربط جدول أوقاف وأصول حقيقي بحساب الجمعية."
      backHref="/dashboard/ngo"
    />
  );
}
