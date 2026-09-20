"use client";

// Beta honesty gate (owner decision ٤, WP-6 B-6). «المراجعات الداخلية» showed
// contracts circulating between departments, each with a named reviewer, a
// verdict and a timestamp — none of it this company's.
//
// WHAT WAS REMOVED, and why:
//   - MOCK_DOCS: contract reviews with invented titles, contract values
//     («٢,٤٠٠,٠٠٠ ﷼»), send/due dates, share tokens («abc123») and per-
//     department verdicts attributed to named people (محمد الحربي، ريم
//     العتيبي …) with review notes and «منذ ٢ ساعة» timestamps. A verdict
//     attributed to a named colleague is the worst kind of fixture: it reads
//     as something a specific person said about a specific contract.
//   - the approve / add-note / share controls over that array, none of which
//     reached a server, and the share token, which addressed nothing.
//
// /dashboard/business/reviews/new already carries the same honest gate
// (reviews/new/page.tsx), so the two halves of this feature now say the same
// thing. No review or reviewer table exists in the schema.
//
// Withheld in the browser by `isHiddenBusinessSection` + the SectionNotReady
// guard in the business layout, but still compiled into the bundle and still
// reachable by direct link for an admin.
//
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessReviewsPage() {
  return (
    <DashboardComingSoon
      title="المراجعات الداخلية"
      description="المراجعات الداخلية غير متاحة حالياً. العقود والأقسام والمراجعون وملاحظاتهم وقيم العقود التي كانت تظهر هنا بيانات ثابتة لا تخص أي شركة حقيقية، ولم تكن أي موافقة أو ملاحظة تُحفظ أو تصل إلى أحد. ستُفعَّل الصفحة عند ربط دورة مراجعة حقيقية بحساب المنشأة."
      backHref="/dashboard/business"
    />
  );
}
