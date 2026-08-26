"use client";

import { CrownSimple, Receipt } from "@phosphor-icons/react";
import { EmptyPanel, SectionTitle } from "./_shared";

// ── Tab: Subscription ────────────────────────────────────────────────
// This tab used to build a whole billing history out of literals: a plan card
// per user type (name, price, «يتجدد ١ أغسطس ٢٠٢٦»), up to four usage meters,
// an auto-renew toggle that promised a charge on that date, and three invoices
// stamped «مدفوع». Nothing here was ever read from `subscriptions`, and no
// money has ever moved through this platform — an invoice marked paid for a
// payment nobody made is the most dangerous row a finance or bank reviewer can
// be shown, and it survived into production because the demo banner above it
// was compiled out of the production build.
//
// Nothing client-readable reports this account's plan today. Deliberately NOT
// used as a substitute: useUser().tier defaults to `meta.tier ?? "free"`, which
// cannot tell "no subscription granted" apart from "granted the free tier" — a
// corporate account under contract would be labelled «مجاني». Plans are granted
// by an administrator (src/lib/entitlements.ts), so absence is the truthful
// answer until a client endpoint exposes the row.
//
// For the same reason the copy below says only what THIS PAGE can show. A real
// `subscriptions` row or an admin-issued receipt may well exist for this
// account; asserting «لم تُستوفَ منه أي مبالغ» would be the old lie inverted —
// an unverifiable absolute about money, told to the client and to their bank.
export function SubscriptionTab() {
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>باقتك الحالية</SectionTitle>
        <EmptyPanel
          icon={<CrownSimple size={28} />}
          title="لا تُعرض بيانات الاشتراك هنا"
          description="لا يقرأ هذا القسم أي سجل اشتراك، فلا يعرض باقة أو تاريخ تجديد أو حدود استخدام. لمعرفة باقتك أو تعديلها، تواصل مع إدارة المنصة."
        />
      </div>

      <div>
        <SectionTitle>الفواتير</SectionTitle>
        <EmptyPanel
          icon={<Receipt size={28} />}
          title="لا توجد فواتير"
          description="لا تُعرض أي فاتورة في هذا الحساب، ولا يوجد مصدر فواتير مرتبط بهذه الصفحة."
        />
      </div>
    </div>
  );
}
