"use client";

import Link from "next/link";
import { PenNib, Signature, Stamp, ArrowLeft } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { vaultHref } from "@/components/letterhead/legalVaultTabs";
import { BackendReadyNotice, EmptyPanel, SectionTitle } from "./_shared";

// N17 (owner RAW[31], batch l12): «الترويسة والختم والتوقيع» in the lawyer's and
// the firm's settings. The store already exists — the letterhead, the stamp and
// the signature are branding assets kept in the legal vault's «هوية ومطبوعات
// المكتب» tab (src/lib/branding/brandingAssets.ts, private bucket, signed
// links) — so this tab points at that same store instead of keeping a second
// one. It never uploads anything itself.
//
// History (2026-09-02): this tab was a simulation end to end — upload buttons
// that stored nothing and a hard-coded signature of someone not on the account,
// plus a نفاذ / emdha e-signature promise no system could keep. Those stay gone.
// The e-signature panel still says what is absent.
//
// A notary (provider) has no legal vault, so his tab keeps the plain statement.
export function SignatureTab() {
  const { userType } = useUser();
  const scope = userType === "firm" ? "firm" : userType === "lawyer" ? "lawyer" : null;

  return (
    <div className="space-y-8">
      {scope ? (
        <div>
          <SectionTitle>الترويسة والختم والتوقيع</SectionTitle>
          <div className="rounded-[2rem] border border-slate-200/50 bg-white/80 px-6 py-6 dark:border-white/[0.06] dark:bg-[#161b22]/80">
            <div className="mb-3 flex items-center gap-2 text-[#0B3D2E] dark:text-[#C8A762]">
              <Stamp size={22} weight="duotone" />
              <PenNib size={22} weight="duotone" />
            </div>
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              تُرفع ترويسة المكتب وختمه وتوقيعك وتُحفظ في «هوية ومطبوعات المكتب» داخل الخزنة، وتُستعمل منها في المستندات التي تُصدِرها من المنصة.
            </p>
            <Link
              href={vaultHref(scope, "branding")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0B3D2E]/90"
            >
              إدارة الترويسة والختم والتوقيع
              <ArrowLeft size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <BackendReadyNotice>
            لا يوجد في نظامي حالياً حفظ للتوقيع أو الختم لهذا النوع من الحسابات ولا تكامل توقيع رقمي.
            هذه الصفحة تعرض حالة الميزة فقط، ولا يُحفظ منها شيء.
          </BackendReadyNotice>
          <div>
            <SectionTitle>التوقيع المكتوب والختم الرسمي</SectionTitle>
            <EmptyPanel
              icon={<PenNib size={26} weight="fill" />}
              title="رفع التوقيع أو الختم غير متاح"
              description="لم يُبنَ بعد رفع صورة التوقيع أو الختم لهذا النوع من الحسابات، ولا تُدرَج أي منهما في المستندات التي تُولَّد داخل المنصة."
            />
          </div>
        </>
      )}

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
