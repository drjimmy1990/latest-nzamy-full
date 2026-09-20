"use client";

// Beta honesty gate (owner decision ٤, WP-6 B-6). «حوكمة العقود» presented an
// approval matrix — who signs off on which contract, at which value, within
// how many days — as if it were this company's own policy. It was not: the
// rules were a hardcoded array, and editing or adding one wrote to React state
// and nothing else, so a reload restored the same fiction for the next visitor.
//
// WHAT WAS REMOVED, and why:
//   - MOCK_RULES: approval rules with invented value bands (0–100,000 /
//     100,000–2,000,000 / 2,000,000+), approver chains (مدير القسم / CFO /
//     CEO / مجلس الإدارة), review windows in days and mandatory departments.
//     A company reading its own escalation thresholds off this page would have
//     been reading somebody's example.
//   - the add/edit/delete/activate controls over that array, none of which
//     reached a server.
//
// There is no approval-rules table in the schema and no endpoint behind any of
// it, so there is nothing to bind this page to yet. It returns when there is.
//
// Withheld in the browser by `isHiddenBusinessSection` + the SectionNotReady
// guard in the business layout, but still compiled into the bundle and still
// reachable by direct link for an admin.
//
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessGovernancePage() {
  return (
    <DashboardComingSoon
      title="حوكمة العقود"
      description="حوكمة العقود غير متاحة حالياً. مصفوفة الاعتمادات والحدود المالية وسلاسل الموافقة ومدد المراجعة التي كانت تظهر هنا بيانات ثابتة لا تمثّل سياسة أي شركة، ولم تكن التعديلات عليها تُحفظ في أي مكان. ستُفعَّل الصفحة عند ربط جدول قواعد اعتماد حقيقي بحساب المنشأة."
      backHref="/dashboard/business"
    />
  );
}
