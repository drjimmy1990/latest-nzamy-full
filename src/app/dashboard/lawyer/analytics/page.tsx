"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/lawyer/analytics
 *
 * Audit 2026-08-27 — this page was ~600 lines of hardcoded numbers presented as
 * this lawyer's professional record, and it was removed rather than repaired
 * because there is nothing behind it to repair it against. What was on it:
 *
 *   • NPS 46, «مروّجون ٦١٪ / محايدون ٢٤٪ / منتقدون ١٥٪», and a footer reading
 *     «بناءً على تقييمات N موكل» — from `PROMOTER`, a literal. No reviews table
 *     exists anywhere in this platform, so no client has ever rated anyone.
 *   • «مؤشرات التطوير المهني»: إتقان الصياغة ٨٨, سرعة الإنجاز ٧٤, رضا الموكلين ٩٢,
 *     تنوع التخصص ٦٧ — four literals with no query behind them.
 *   • «أكثر أدوات نظامي AI استخداماً» — 183 tool uses across six named tools.
 *     Nothing in the repo records AI tool usage.
 *   • A year of monthly activity bars (`ACTIVITY_DATA`) — a literal per period.
 *   • «نتائج القضايا» / «توزيع نوع العمل» — the only two cards with a real query,
 *     against the `cases` table, which NOTHING in this repository ever writes.
 *
 * The «بيانات تجريبية» banner it carried was worse than no banner: its condition
 * was `winStats === WIN`, i.e. "the literals were not overwritten". The moment
 * the `cases` table gained a single row the banner would switch OFF — and the
 * NPS, the satisfaction score and the AI usage counts, all still invented, would
 * then be presented as this lawyer's verified record. A caveat that removes
 * itself is not a caveat.
 *
 * These are numbers a lawyer would quote to a client or put in a profile. There
 * is no honest partial version — four of the six cards have no data source at
 * all — so the page says so, unconditionally, until one exists.
 *
 * Nothing links here (no sidebar entry, no in-app link — grep for
 * "dashboard/lawyer/analytics" returns only this file), so this replaces a
 * URL-reachable page, not a navigation destination.
 *
 * ⚠️ /dashboard/lawyer/profile is a separate file and IS in the sidebar; it
 * imports the same fabricated ACTIVITY_DATA from ../_data/analytics and renders
 * the same year-of-activity chart, plus a WORK_HOURS literal and a tier system
 * keyed to it. That file belongs to another group and is reported, not touched.
 */
export default function LawyerAnalyticsPage() {
  return (
    <DashboardComingSoon
      title="إحصائيات الأداء المهني"
      description="لوحة الإحصائيات غير متاحة حالياً. المنصة لا تسجّل بعد تقييمات الموكلين ولا استخدام أدوات الذكاء الاصطناعي ولا نتائج القضايا، فلا توجد أرقام حقيقية لعرضها — وعرض أرقام غير حقيقية عن أدائك المهني أسوأ من عدم عرض شيء."
      backHref="/dashboard/lawyer"
    />
  );
}
