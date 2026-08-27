"use client";

/**
 * MyMarketplaceDashboard — مكوّن مشترك لـ:
 *  - /dashboard/lawyer/marketplace
 *  - /dashboard/firm/marketplace
 *  - /dashboard/business/marketplace
 *  - /marketplace/collaborate
 *
 * ─── WHY THIS IS NOW A "قريباً" GATE ─────────────────────────────────────────
 * Every row this component used to render came from module constants in
 * ./MyMarketplaceDashboardData — see the comment at the top of that file for
 * what exactly was fabricated. The screen showed the signed-in lawyer four
 * "own" requests (one naming a Riyadh prison, one naming a court and a hearing
 * day), KPI tiles counted off those constants, and a «دعوات تعاون» tab with a
 * pulsing notification dot over two invented fee-split invitations. Three of
 * the four consequential buttons — «قبول الدعوة», «رفض», «اقترح هذا التوزيع» —
 * had no handler at all; the only wired control was the cosmetic one.
 *
 * The honest options were (a) wire it to the server or (b) stop promising it.
 * (a) is not available: there is no marketplace API in this app (no
 * src/app/api/v1/marketplace), nothing writes `marketplace_listings` /
 * `marketplace_offers`, and no collaboration-invitation table exists. Building
 * that subsystem is a product decision. So (b).
 *
 * WHY THE FIX LIVES HERE AND NOT IN A ROUTE GUARD: the obvious cheap fix was
 * `if (BETA_MONOPOLY_MODE) redirect(...)` in the lawyer route. It was rejected
 * because it fixes exactly one of the four call sites — the firm and business
 * dashboards would carry on rendering سجن الحائر and the 15,000 ر.س invitation
 * — and because redirecting hides the page rather than telling the truth about
 * it. Fixing the shared component covers all four at once.
 *
 * The `Props` interface is deliberately unchanged. `/marketplace/collaborate`
 * passes `initialMode="collab"` and the three dashboards pass `userType`;
 * dropping either would be a type error at a call site outside this change.
 * `initialMode` is intentionally unread now — kept so those call sites compile
 * and so restoring the real screen does not have to re-thread it.
 */

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

interface Props {
  userType?: "lawyer" | "firm" | "corporate" | "micro";
  initialMode?: "solo" | "collab";
}

/**
 * Where «العودة» goes. Each dashboard has its own root and sending a lawyer to
 * the corporate dashboard would just be a second wrong thing on the screen.
 */
const BACK_HREF: Record<NonNullable<Props["userType"]>, string> = {
  lawyer: "/dashboard/lawyer",
  firm: "/dashboard/firm",
  corporate: "/dashboard/business",
  micro: "/dashboard",
};

export default function MyMarketplaceDashboard(props: Props) {
  const userType = props.userType ?? "lawyer";

  return (
    <DashboardComingSoon
      title="سوق المهنيين"
      description="سوق المهنيين — نشر الطلبات، استقبال العروض، ودعوات التعاون بين المحامين — غير متاح حالياً. لا توجد طلبات أو عروض أو دعوات حقيقية لعرضها، ولن يظهر هنا أي طلب حتى تُفعَّل الخدمة."
      backHref={BACK_HREF[userType]}
    />
  );
}
