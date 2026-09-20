"use client";

// Beta honesty gate (owner decision ٤, WP-6 B-6). «لوحة المهام» rendered a
// four-column board — plus list, timeline and graph views over the same data —
// as if the cards were this company's live matters.
//
// WHAT WAS REMOVED, and why:
//   - MOCK_CARDS: a per-column record of cards with invented titles («تجديد
//     عقد الإيجار - فرع الرياض», «صياغة لائحة العمل الداخلية المحدثة» …),
//     departments, assigned lawyers (first names + avatar initials), due dates
//     («٢٠ أبريل», «غداً»), priorities, tags, per-card checklists and blockers.
//     A due date is the most damaging fixture on this platform: a company that
//     reads «غداً» on a card and does not act has been actively misled.
//   - the drag/drop and checklist controls over that array, which wrote to
//     React state and nothing else.
//   - the graph view (CaseGraphView + _graph-model.ts +
//     _use-case-graph-state.ts), which was fed from the same cards. Those
//     files are left in place, unimported, for whoever binds them to real
//     data; nothing in the compiled business bundle reaches them from here.
//
// There is no board/column/card table in the schema. The company's real
// matters are `service_requests` rows, listed on /dashboard/business.
//
// Withheld in the browser by `isHiddenBusinessSection` + the SectionNotReady
// guard in the business layout, but still compiled into the bundle and still
// reachable by direct link for an admin.
//
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessKanbanPage() {
  return (
    <DashboardComingSoon
      title="لوحة المهام"
      description="لوحة المهام غير متاحة حالياً. البطاقات والأقسام والمكلّفون والمواعيد وقوائم المهام التي كانت تظهر هنا بيانات ثابتة لا تخص أي شركة حقيقية، ولم تكن أي حركة عليها تُحفظ. طلبات منشأتك الفعلية تظهر في لوحة «نظرة عامة»."
      backHref="/dashboard/business"
    />
  );
}
