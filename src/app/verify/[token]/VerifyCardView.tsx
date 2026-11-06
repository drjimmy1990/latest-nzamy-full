"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SealCheck, SpinnerGap } from "@phosphor-icons/react";
import { arabicDigits } from "@/lib/branding/letterheadIdentity";
import { HOME_ANSWER, publicCardAnswer, type VerifyCardAnswer } from "@/lib/branding/verifyCard";

/** Anything but a card goes home: printed paper never shows a 404, and a token reveals nothing. */
export default function VerifyCardView({ token }: { token: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState<Extract<VerifyCardAnswer, { state: "card" }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/letterhead/verify/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((res) => res.json())
      .catch(() => HOME_ANSWER)
      .then((raw: unknown) => {
        if (cancelled) return;
        const read = publicCardAnswer(raw);
        if (read.state === "card") setAnswer(read);
        else router.replace("/");
      });
    return () => { cancelled = true; };
  }, [token, router]);

  if (!answer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" dir="rtl">
        <SpinnerGap size={26} className="animate-spin text-zinc-400" aria-label="جارٍ التحقق" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/[0.06] dark:bg-zinc-900/60">
        <h1 className="text-lg font-bold text-slate-800 dark:text-white">{answer.name}</h1>
        {answer.licence && (
          <p className="mt-2 text-[13px] text-slate-600 dark:text-zinc-300">ترخيص رقم {arabicDigits(answer.licence)}</p>
        )}
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0B3D2E] px-4 py-1.5 text-[12px] font-bold text-[#C8A762]">
          <SealCheck size={15} weight="fill" /> موثّق على منصة نظامي
        </p>
        {answer.published && answer.slug && (
          <div className="mt-5">
            <Link href={`/lawyers/${encodeURIComponent(answer.slug)}`} className="text-[13px] font-semibold text-[#0B3D2E] underline dark:text-[#C8A762]">
              عرض الملف
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
