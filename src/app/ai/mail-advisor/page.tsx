"use client";

// «LegalMail — وكيل البريد القانوني» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: a "filtered inbox" of two invented e-mails (a supplier
// demanding a payment, an HR question), each with a fixed "AI analysis" and
// three fixed reply drafts. Its settings screen told the user that a legal
// mailbox had been created for their company at a made-up address and asked
// them to auto-forward real mail to it. No such mailbox, inbox or forwarding
// exists anywhere on the platform.
//
// The nav rows (navigation.navbar.ts) and the floating menu entry still link
// here; the navbar row carries «قريباً».

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function MailAdvisorPage() {
  return (
    <DashboardComingSoon
      title="وكيل البريد القانوني (LegalMail)"
      description="وكيل البريد القانوني غير متاح حالياً وسيُفعَّل قريباً. لا يوجد بريد مخصص لشركتك ولا ربط بصندوق وارد بعد، والرسائل والتحليلات والردود التي كانت تظهر هنا كانت أمثلة ثابتة."
      backHref="/ai"
    />
  );
}
