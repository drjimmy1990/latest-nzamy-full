"use client";

import Link from "next/link";
import { Handshake, ArrowLeft } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
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
// 2026-10-17 — owner decision ٣٦. A company now HAS a real register:
// public.business_delegations (20261017_30), managed at
// /dashboard/business/delegations, with one power today — editing the company
// data. A corporate account is sent there. Every other account type still has
// no delegation system (no table, no scoped grant, no audit trail), and the tab
// keeps saying so rather than re-mocking one.
export function DelegationTab() {
  const { userType } = useUser();

  if (userType === "corporate") {
    return (
      <div className="space-y-8">
        <EmptyPanel
          icon={<Handshake size={26} weight="fill" />}
          title="سجل التفويضات في لوحة المنشأة"
          description="يسجّل مالك الحساب تفويض عضو نشط من فريق المنشأة بتعديل بيانات المنشأة، ويحدّد آخر يوم له أو يتركه سارياً حتى يلغيه. كل تفويض وكل إلغاء يبقى في السجل باسم من قرّره وتاريخه. هذه هي الصلاحية الوحيدة القابلة للتفويض حالياً."
        />
        <Link
          href="/dashboard/business/delegations"
          className="inline-flex items-center gap-2 rounded-xl bg-royal px-5 py-2.5 text-sm font-bold text-white hover:bg-royal/90"
        >
          فتح سجل التفويضات
          <ArrowLeft size={15} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <EmptyPanel
        icon={<Handshake size={26} weight="fill" />}
        title="تفويض الصلاحيات غير متاح بعد"
        description="لا توجد في نظامي حالياً آلية لتفويض صلاحياتك مؤقتاً لزميل في هذا النوع من الحسابات — لا جدول تفويضات، ولا صلاحيات محدودة النطاق يعمل بها المُفوَّض فعلياً، ولا سجل تدقيق يفرّق بين إجراءاتك وإجراءات من تفوّضه. أي تفويض كانت هذه الصفحة تعرضه سابقاً لم يكن له أي أثر فعلي على حسابك."
      />
    </div>
  );
}
