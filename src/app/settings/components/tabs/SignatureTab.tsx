"use client";

import { PenNib, Signature } from "@phosphor-icons/react";
import { BackendReadyNotice, EmptyPanel, SectionTitle } from "./_shared";

// 2026-09-02 — this tab was a simulation end to end, and the previous pass left
// the worst of it standing:
//
//   • The «رفع التوقيع» / «رفع الختم» buttons opened a file picker and then set
//     `hasSignature` / `hasStamp` to true unconditionally — without an onChange
//     handler, without reading the chosen file, and even if the user cancelled.
//     The "uploaded signature" that appeared was a hard-coded «فهد النمر»: a
//     name belonging to no one on the account, rendered as if it were the
//     user's own signature.
//   • The eSignature block claimed «عبر خدمة Nafath / emdha — للتوقيع على
//     العقود بقوة قانونية ملزمة», and flipping its toggle showed «جارٍ التحقق
//     عبر Nafath» under a green success icon plus «ستصلك رسالة نفاذ للتأكيد
//     على جوالك» — a promise of an SMS that no system was able to send.
//
// There is no signature storage, no document pipeline that consumes a signature
// or a stamp, and no نفاذ / emdha integration. So the controls are gone and the
// tab states what is absent. It is kept registered (see
// src/constants/settingsReadiness.ts) so the disclosure stays reachable instead
// of the feature quietly vanishing. If any of this becomes real, replace a
// panel — do not restore an upload button that stores nothing.
export function SignatureTab() {
  return (
    <div className="space-y-8">
      <BackendReadyNotice>
        لا يوجد في نظامي حالياً حفظ للتوقيع أو الختم ولا تكامل توقيع رقمي.
        هذه الصفحة تعرض حالة الميزة فقط، ولا يُحفظ منها شيء.
      </BackendReadyNotice>

      <div>
        <SectionTitle>التوقيع المكتوب والختم الرسمي</SectionTitle>
        <EmptyPanel
          icon={<PenNib size={26} weight="fill" />}
          title="رفع التوقيع أو الختم غير متاح"
          description="لم يُبنَ بعد رفع صورة التوقيع أو الختم ولا تخزينها، ولا تُدرَج أي منهما في المستندات أو العقود أو المذكرات التي تُولَّد داخل المنصة."
        />
      </div>

      <div>
        <SectionTitle>التوقيع الرقمي (eSignature)</SectionTitle>
        <EmptyPanel
          icon={<Signature size={26} />}
          title="التوقيع الرقمي غير متاح"
          description="لا يوجد ربط مع نفاذ ولا مع إمضاء (emdha) ولا مع أي مزوّد توقيع رقمي معتمد، ولن تصلك من هذه الصفحة أي رسالة تحقق. وصورة التوقيع أو الختم ليست في ذاتها توقيعاً رقمياً ذا حجية نظامية."
        />
      </div>
    </div>
  );
}
