"use client";

import { Gift } from "@phosphor-icons/react";
import { EmptyPanel, SectionTitle } from "./_shared";

// ── Tab: Referral ────────────────────────────────────────────────────
// THE SECOND RENDER SITE OF THE REFERRAL PROGRAMME. The other one —
// src/app/dashboard/client/referral/page.tsx — was already reduced to
// DashboardComingSoon; read its docblock for the full reasoning. This tab was
// missed, so the identical promise kept rendering at /settings → «دعوة
// الأصدقاء» for every individual, lawyer and corporate account
// (src/constants/settingsReadiness.ts lists "referral" in all three
// visibleTabs). Both sites now say the same thing.
//
// WHY THE WHOLE BODY WENT, not just the wording. Three things had to be true
// for any of it to mean something, and none of them is:
//
//  1. NOTHING RECORDS A REFERRAL. `referrals` is touched in exactly one place
//     in the tree — the SELECT in src/app/api/v1/referrals/route.ts. There is
//     no insert, in any route, wizard or trigger.
//  2. THE LINK GOES NOWHERE. /join reads no `ref` parameter at all; it is the
//     lawyer/provider recruitment landing page. A friend who followed the link
//     would be attributed to nobody.
//  3. NOBODY HAS DECIDED WHAT A REFERRAL EARNS. No `commission_amount` is ever
//     written and there is no payment provider behind any figure (open owner
//     question س٦).
//
// WHAT WAS REMOVED, with values, since git history is the only other record:
//   • `referralCode` — "NZM-" + the first four letters of the account holder's
//     own name, uppercased. Invented client-side, stored nowhere, and not even
//     the same code the one existing endpoint derives (user.id.slice(0, 8)).
//   • `referralLink` — `https://nezamy.sa/join?ref=${referralCode}`, printed on
//     screen, echoed under «كودك:», and written to the clipboard by a «نسخ»
//     button.
//   • getReferralContent() and its seven per-type reward literals: «50 ر.س رصيد
//     لحسابك» + «شهر مجاني لصديقك» (individual), «3 أشهر مجانية أو 150 ر.س» +
//     «شهر تجريبي مجاني» (lawyer/firm), «خصم 15% على تجديد الباقة السنوية»
//     (corporate), «75 ر.س رصيد لكل إحالة» (micro), «50 ر.س رصيد» (ngo),
//     «100 ر.س رصيد» (provider) and the «50 ر.س رصيد» default.
//   • The three «إحصائيات الإحالات» tiles — «دعوات أُرسلت: 12», «تسجيلات
//     مكتملة: 7», «رصيد مكتسب: 350 ر.س». Module-level literals, byte-identical
//     for every account, presented under a live heading as facts about the
//     client's own account and money. This was the worst of it.
//   • The `userType === "government"` branch, which claimed the programme is
//     unavailable to government accounts specifically — an eligibility policy
//     backed by nothing but that switch, and moot now the programme is off for
//     everyone.
//
// DELIBERATELY NOT ADDED: no `referrals` insert, no `?ref` handling on /join,
// no rewards engine, and no zeroed tiles. «دعوات أُرسلت: ٠» would be the same
// lie inverted — an assertion about the account that a permanently empty table
// still cannot back. The link, the code and the counts all go together; a copy
// button merely disabled would leave the URL itself stated on screen.
//
// If the programme is ever built, delete this file's body and restore both
// render sites together — that is the mistake that brought this back.
export function ReferralTab() {
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>برنامج الإحالة</SectionTitle>
        <EmptyPanel
          icon={<Gift size={28} />}
          title="برنامج الإحالة غير مفعَّل حالياً"
          description="لا تُسجَّل الدعوات ولا تُحتسب أي مكافأة عليها في الوقت الحاضر، ولم تُعتمد بعد قيمة المكافأة ولا آلية صرفها. سيظهر هنا رابط الإحالة الخاص بك وسجلّ من انضم عن طريقك فور تفعيل البرنامج."
        />
      </div>
    </div>
  );
}
