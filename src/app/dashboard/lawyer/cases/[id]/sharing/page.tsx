"use client";

// Beta honesty gate: the case-sharing controls (guest links, share scope, timeline
// visibility) did not persist — toggling them saved nothing, so the lawyer believed
// they controlled what the client sees while nothing was stored. Gated as "قريباً"
// until the share store is wired to the database. The previous UI is preserved in
// git history and can be restored once persistence exists.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function CaseSharingPage() {
  return (
    <DashboardComingSoon
      title="مشاركة القضية مع الموكل"
      description="لوحة التحكم في ما يراه الموكل من قضيته — روابط الضيف، نطاق المشاركة، والجدول الزمني — غير متاحة حالياً. سيتم تفعيلها فور ربط مخزن المشاركة بقاعدة البيانات؛ حتى ذلك الحين لا تُحفظ إعدادات المشاركة."
      backHref="/dashboard/lawyer/cases"
    />
  );
}
