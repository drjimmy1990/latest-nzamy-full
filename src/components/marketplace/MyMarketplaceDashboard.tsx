"use client";

/**
 * MyMarketplaceDashboard — «سوق التعاقد المهني والإسناد» for a lawyer or a firm
 * (/dashboard/lawyer/marketplace, /dashboard/firm/marketplace,
 * /marketplace/collaborate).
 *
 * CODE-F05 / CODE-F41 (owner package 2026-10-30). WHAT WAS REMOVED — the
 * previous UI is in git history:
 *   • two hard-coded listings («LIST-101», «LIST-102») shown as the lawyer's
 *     own requests, with invented budgets and offer counts;
 *   • «نشر طلب الإسناد», which only added a row to React state — gone on
 *     reload, seen by nobody — with the budget read as `Number(newBudget) ||
 *     1000`, so a zero, a negative or a blank silently became 1,000 SAR;
 *   • an «incoming offer» from a named lawyer with a licence number — a
 *     person who does not exist — priced «شامل الضريبة والعمولة», with
 *     «قبول العرض» and «محادثة آمنة» buttons that had no handler;
 *   • «استعراض العروض المقدمة والتعميد» with no handler;
 *   • «التنبيهات الفورية مفعلة لمدينتك» and «فحص تعارض المصالح آلياً» — two
 *     services that do not exist.
 *
 * Nothing behind this screen publishes, receives offers, accepts, chats or
 * checks conflicts, and the marketplace is parked by BETA_MONOPOLY_MODE
 * (src/lib/betaConfig.ts), as the company marketplace page already is. So it
 * says so, exactly like /dashboard/business/marketplace. No fee or commission
 * figure is shown: the platform's marketplace commission is an open owner
 * decision.
 *
 * When the marketplace is built, the listing budget must be validated on the
 * server (a finite amount above zero), never defaulted.
 */

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

interface Props {
  userType?: "lawyer" | "firm" | "corporate" | "micro";
  initialMode?: "solo" | "collab";
}

const BACK_HREF: Record<NonNullable<Props["userType"]>, string> = {
  lawyer: "/dashboard/lawyer",
  firm: "/dashboard/firm",
  corporate: "/dashboard/business",
  micro: "/dashboard",
};

/** The sentence the screen shows — exported so a test can pin what it promises. */
export function marketplaceUnavailableCopy(monopoly: boolean): { title: string; description: string } {
  return {
    title: "سوق الإسناد بين المحامين — غير متاح بعد",
    description: monopoly
      ? "سوق الإسناد متوقف خلال المرحلة التجريبية: لا يمكن نشر طلب إسناد أو استقبال عروض أو قبولها أو المحادثة بشأنها من هنا، ولا تُحفظ أي بيانات في هذه الصفحة."
      : "سوق الإسناد قيد التطوير: لا يمكن نشر طلب إسناد أو استقبال عروض أو قبولها أو المحادثة بشأنها من هنا بعد، ولا تُحفظ أي بيانات في هذه الصفحة.",
  };
}

export default function MyMarketplaceDashboard(props: Props) {
  const userType = props.userType ?? "lawyer";
  const copy = marketplaceUnavailableCopy(BETA_MONOPOLY_MODE);
  return <DashboardComingSoon title={copy.title} description={copy.description} backHref={BACK_HREF[userType]} />;
}
