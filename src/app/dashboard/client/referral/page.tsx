"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * «برنامج الإحالة» — marked inactive, truthfully.
 *
 * WHY THE WHOLE PROGRAMME AND NOT JUST THE COPY. Three independent things had
 * to be true for this page to mean anything, and none of them is:
 *
 *  1. NOTHING RECORDS A REFERRAL. `referrals` is touched in exactly one place
 *     in the entire tree — the SELECT in src/app/api/v1/referrals/route.ts.
 *     No insert exists, in any route, wizard or trigger. The table can only
 *     ever be empty, so «دعوات مُرسلة» and «انضموا» could only ever print ٠.
 *
 *  2. THE LINK GOES NOWHERE USEFUL. That route builds
 *     `https://nezamy.sa/join?ref=<8 hex>`. /join is the LAWYER RECRUITMENT
 *     page and reads no `ref` parameter at all, so a friend who followed the
 *     link would be attributed to nobody — and would land on a page asking
 *     them to join as a legal professional.
 *
 *  3. NOBODY HAS DECIDED WHAT A REFERRAL EARNS. The page promised «٥٠ ر.س»
 *     four times over — hero, step ٣, the wallet cross-link and the terms
 *     line. There is no such decision anywhere in the product record, no
 *     `commission_amount` is ever written, and there is no payment provider
 *     behind the number (open owner question س٦).
 *
 * WHAT IS NOT HERE, DELIBERATELY. No rewards engine, no `referrals` insert, no
 * `?ref` handling on /join. Inventing a reward, or a subsystem to pay it, is
 * exactly the move this pass forbids: the promise needs a decision the owner
 * has not made, so the promise goes and the page says so.
 *
 * The page is KEPT, not deleted — «برنامج الإحالة» is still in the client
 * sidebar (src/constants/navigation.sidebars.primary.ts) and a sidebar row
 * that 404s is its own kind of broken. It now matches the marker «سفير نظامي»
 * already uses for the same situation (../celebrity/referrals/page.tsx).
 *
 * Also gone with the body: the five invented friends (أحمد العتيبي, سارة
 * القحطاني, فهد الشمري, نورة البقمي, خالد الدوسري) that demo mode showed with
 * «+٥٠ ر.س» beside each, and the «الرتبة الأولى» badge, which was a literal
 * string shown to every user.
 */
export default function ReferralPage() {
  return (
    <DashboardComingSoon
      title="برنامج الإحالة"
      description="برنامج الإحالة غير مفعَّل حالياً. لا تُسجَّل الدعوات ولا تُحتسب أي مكافأة عليها في الوقت الحاضر، ولم تُعتمد بعد قيمة المكافأة ولا آلية صرفها. سيظهر هنا رابط الإحالة الخاص بك وسجلّ من انضم عن طريقك فور تفعيل البرنامج."
      backHref="/dashboard/client"
    />
  );
}
