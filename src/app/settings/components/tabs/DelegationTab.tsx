"use client";

import { Handshake } from "@phosphor-icons/react";
import { EmptyPanel } from "./_shared";

// 2026-09-04 — Phase 6 (compliance/delegation/team/profession honesty pass).
//
// This tab used to render two invented delegations (أ. نورة العتيبي —
// "جميع الصلاحيات", أ. عبدالعزيز الحربي — "الموافقات المالية فقط") with
// fabricated scopes, dates and statuses baked into a MOCK_DELEGATIONS
// literal. Its "تفويض جديد" form wrote nothing past component state and
// said so on submit ("تم إنشاء التفويض كحالة واجهة فقط"); its "إلغاء"
// button claimed to revoke a delegation with nothing server-side behind it;
// and its notification toggle saved nowhere.
//
// No delegation/RBAC system exists — no delegations table, no scoped
// permission grant a delegate could actually act under, no audit trail that
// distinguishes an action taken by the account owner from one taken by a
// delegate. None of it is re-mocked; the tab states that plainly instead.
export function DelegationTab() {
  return (
    <div className="space-y-8">
      <EmptyPanel
        icon={<Handshake size={26} weight="fill" />}
        title="تفويض الصلاحيات غير متاح بعد"
        description="لا توجد في نظامي حالياً آلية لتفويض صلاحياتك مؤقتاً لزميل — لا جدول تفويضات، ولا صلاحيات محدودة النطاق يعمل بها المُفوَّض فعلياً، ولا سجل تدقيق يفرّق بين إجراءاتك وإجراءات من تفوّضه. أي تفويض كانت هذه الصفحة تعرضه سابقاً لم يكن له أي أثر فعلي على حسابك."
      />
    </div>
  );
}
