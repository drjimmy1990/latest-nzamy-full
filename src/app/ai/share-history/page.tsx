"use client";

// «سجل الأعمال والاعتمادات» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: three invented shared documents (named clients, dates,
// six-digit passcodes, a client's revision request) and buttons that wrote a
// fixed "AI reply" into the box. None of it came from a share.
//
// WHY «قريباً» AND NOT A REAL LIST: the real share flow exists —
// POST /api/v1/share mints a hashed `document_shares` row — but nothing reads
// those rows back for the signed-in user (the route has no GET, and no page
// selects from the table), and the table holds no approval status or client
// notes, which is what this page was about. So there is nothing true to list.
//
// proxy.ts already redirects /ai/share-history to /settings; this body is what
// remains if that redirect is ever removed.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function ShareHistoryPage() {
  return (
    <DashboardComingSoon
      title="سجل الأعمال والاعتمادات"
      description="سجل المستندات المرسلة للعملاء غير متاح حالياً وسيُفعَّل قريباً. لا تُعرض هنا حالة الاعتماد ولا ملاحظات العميل لأنها لا تُحفظ بعد."
      backHref="/ai"
    />
  );
}
