"use client";

// Beta honesty gate: the four-step "إرسال مستند للمراجعة" wizard promised an
// upload, a review link and a dispatch to each department, and had none of them.
//
// WHAT WAS REMOVED, and why:
//   - the dropzone under «اسحب الملف هنا أو اضغط للاختيار (PDF, DOCX)» was a
//     `<div onClick={() => setFileUploaded(true)}>`. There was no `type="file"`
//     anywhere in the file, so no file was ever chosen, read, stored or sent —
//     the user only flipped a boolean, which then unlocked the "next" button.
//   - the confirmed state printed a FABRICATED filename,
//     `{docTitle || "عقد_توريد_شركة_الأفق"}.pdf` — a document name the user
//     never typed, for a file that did not exist.
//   - `handleSendReview` wrote through `saveWorkflowRequest` to the local
//     workflow store (browser storage), never to `service_requests`, and then
//     rendered «تم إرسال المستند بنجاح» over that non-write.
//   - the success screen showed a review link and a passcode that were string
//     LITERALS, identical for every user of the platform:
//     `https://nezamy.sa/review/a7b3c9d1` and `٧٢٤٩١٣`. The link resolves to
//     nothing and the code opens nothing.
//   - the WhatsApp dispatch («سيتم إرسال رابط واتساب لكل منها»), the
//     passcode-protected external reviewer page, the review deadline and the
//     automatic escalation to the CEO were all copy with no implementation.
//   - the six DEPARTMENTS carried invented phone numbers
//     (`+966 5xx xxx 001` …), presented as each department's contact.
//
// `SubscriptionGuard featureKey="dept-reviews"` came off with the wizard on
// purpose: paywalling a «قريباً» notice behind an entitlement for a feature
// that does not exist would be a second false promise, not a protection.
//
// REACH: this route is not in CORPORATE_SIDEBAR, so
// `isHiddenBusinessSection("/dashboard/business/reviews/new")` is true and a
// non-admin corporate account gets SectionNotReady from
// src/app/dashboard/business/layout.tsx instead of this page. An admin is
// exempt from that guard and from EntityRouteGuard, and does render this page —
// which is why it is gated honestly rather than left as it was.
//
// backHref is /dashboard/business, not the parent list: /dashboard/business/reviews
// is itself a hidden section, so it is not a working destination for either role.
//
// The previous UI is preserved in git history and can be restored once file
// storage and a real dispatch channel exist.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function NewReviewPage() {
  return (
    <DashboardComingSoon
      title="إرسال مستند للمراجعة"
      description="إرسال المستندات لمراجعة الإدارات غير متاح حالياً. لا يتم رفع أي ملف أو حفظه، ولا يصل أي إشعار أو رابط إلى أي إدارة، وما كان يظهر من رقم مراجعة ورابط ورمز دخول كان ثابتاً في الصفحة ولا يفتح شيئاً. سيتم تفعيل الصفحة فور توفّر تخزين الملفات وقناة فعلية لإبلاغ الإدارات."
      backHref="/dashboard/business"
    />
  );
}
