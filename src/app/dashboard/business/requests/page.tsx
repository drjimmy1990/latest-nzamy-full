"use client";

// Beta honesty gate (owner decision ٤, WP-6 B-6). «طلبات الخدمة» listed six
// hand-written requests as if they were this company's, and every filter,
// counter and stat tile on the page was computed over that same array. The
// file contained ZERO `apiGet` / `fetch` / `useEffect` calls.
//
// WHAT WAS REMOVED, and why:
//   - MOCK_REQUESTS: six Arabic service requests with invented budgets
//     («٣,٥٠٠ ر.س» … «٢٥,٠٠٠ ر.س»), assignees (محمد الغامدي / نورة القحطاني /
//     فهد العتيبي), `offersCount` values and deadlines. Identical for every
//     corporate account that opened the page.
//   - the status filters and the four counters above them, which summed that
//     array — so the totals were exactly as fabricated as the rows.
//
// THE REAL COMPANY REQUEST LIST ALREADY EXISTS and is reachable: the «طلبات
// منشأتك» panel on /dashboard/business (page.tsx), which calls
// listMyServiceOrders() → GET /api/v1/service-requests and is filtered by the
// `business members read business service requests` RLS policy
// (20260914_entity_memberships_and_business_requests.sql:52-59). «طلباتي» in
// the sidebar points at /dashboard/client/requests for the same rows. That is
// why this page is a gate and not a second list: a second list over the same
// endpoint is a second place for it to drift.
//
// This route is already withheld from a non-admin corporate account by
// `isHiddenBusinessSection` + the SectionNotReady guard in
// src/app/dashboard/business/layout.tsx — but only in the browser. The module
// was still compiled into the production bundle and a direct link still
// rendered it for an admin, which is precisely what owner decision ٤ names
// («الرابط المباشر لا يرسم fixture ولو اختفى من sidebar»؛ «build الإنتاج لا
// يحمل mock قابلاً للوصول»).
//
// The previous UI is preserved in git history and can be restored the day
// this page has a query of its own to draw.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessRequestsPage() {
  return (
    <DashboardComingSoon
      title="طلبات الخدمة"
      description="صفحة طلبات الخدمة المخصّصة للمنشأة غير متاحة حالياً. الطلبات والميزانيات والمكلّفون وأعداد العروض التي كانت تظهر هنا بيانات ثابتة لا تخص أي شركة حقيقية. طلبات منشأتك الفعلية تظهر في لوحة «نظرة عامة» وفي «طلباتي»."
      backHref="/dashboard/business"
    />
  );
}
