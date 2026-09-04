"use client";

import { ShieldCheck } from "@phosphor-icons/react";
import { EmptyPanel } from "./_shared";

// 2026-09-04 — Phase 6 (compliance/delegation/team/profession honesty pass).
//
// This tab used to render five compliance "modules" (PDPL, فوترة ZATCA
// Fatoora, SAMA, اتفاقية وزارة العدل, تقارير وزارة الموارد البشرية), each
// carrying an invented «ممتثل» / «يحتاج مراجعة» / «غير مفعّل» status that
// nothing evaluated — it was a literal in the MODULES array, identical for
// every account. Below it sat a data-retention selector (سنة / 3 سنوات / 6
// سنوات) that only ever wrote to component state, and a fixed «موعد
// المراجعة الدورية القادمة: 1447/12/01» banner that never moved and was
// shown to every account regardless of type.
//
// No compliance engine exists — no policy table, no retention job, no
// review scheduler, no PDPL/ZATCA/SAMA integration — so none of it is
// re-mocked. The tab states that plainly instead. If a real engine is ever
// built, replace this panel with the real read; do not restore a status
// literal.
export function ComplianceTab() {
  return (
    <div className="space-y-8">
      <EmptyPanel
        icon={<ShieldCheck size={26} />}
        title="محرك الامتثال غير متاح بعد"
        description="لا توجد في نظامي حالياً وحدات رصد امتثال (حماية البيانات الشخصية PDPL، الفوترة الإلكترونية ZATCA، متطلبات مؤسسة النقد SAMA، اتفاقية وزارة العدل، تقارير وزارة الموارد البشرية)، ولا سياسة احتفاظ بالبيانات قابلة للتعديل من هنا، ولا جدول مراجعة دورية. أي حالة أو تاريخ كانت هذه الصفحة تعرضه سابقاً لم يكن مرتبطاً بأي حساب فعلي."
      />
    </div>
  );
}
