"use client";

import { CreditCard, Receipt } from "@phosphor-icons/react";
import { EmptyPanel, SectionTitle } from "./_shared";

// ── Tab 5: Payments ─────────────────────────────────────────────────
// This tab held a saved Visa card and a five-row transaction ledger — all
// literals, including «أتعاب القضية ٢٠٢٥-٠٠١ — بانتظار الإنجاز / محجوز», money
// described to the account holder as held in escrow. No payment provider is
// connected to this platform and no transaction has ever been processed, so
// every one of those rows was a claim about the user's money that was false.
//
// There is a real receipts ledger (public.receipts), but its only door is
// /api/v1/admin/receipts, which requires an admin session — a client settings
// tab cannot read it. Until a client-readable source exists, this tab states
// the absence rather than filling it. Do not reintroduce sample rows here, and
// do not re-add "add card" / "remove card" controls before a real gateway is
// wired: a control that looks live is the same lie as a fabricated row.
//
// The copy below says only what THIS PAGE can show, never what did or did not
// happen to the account's money. An admin can record a real bank transfer into
// public.receipts without any gateway, so «لم تُنفَّذ أي عملية دفع» would be the
// old lie inverted: an unverifiable absolute about a balance we cannot read.
export function PaymentsTab() {
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>طرق الدفع المحفوظة</SectionTitle>
        <EmptyPanel
          icon={<CreditCard size={28} />}
          title="لا توجد طرق دفع محفوظة"
          description="لا يمكن حفظ بطاقة أو تنفيذ عملية دفع من هذه الصفحة."
        />
      </div>

      <div>
        <SectionTitle>سجل المعاملات</SectionTitle>
        <EmptyPanel
          icon={<Receipt size={28} />}
          title="لا توجد مدفوعات مسجّلة"
          description="لا يوجد في حسابك مصدر بيانات مدفوعات يمكن عرضه في هذه الصفحة."
        />
      </div>
    </div>
  );
}
