"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, SealCheck, Sparkle, ArrowLeft } from "@phosphor-icons/react";
import { Shimmer } from "@/components/ui/Skeleton";
import { LibraryGrantStatusCard, useMyLibraryGrant } from "@/components/library/LibraryGrantStatusCard";
import { PointsBalanceCard } from "@/components/payments/PointsBalanceCard";
import { useBillingData } from "@/components/payments/useBillingData";
import { useUser } from "@/hooks/useUser";
import { BlockNote, BlockShell } from "./_BlockShell";
import { arDigits, founderPointsView, subscriptionView } from "./myLibraryView";

/**
 * GET /api/v1/membership/founder: undefined while it runs, null when it failed.
 * Read only for a lawyer or a firm (the founder seat is theirs): anyone else
 * is answered «not a member» without a call, so a failed read never shows
 * him a line about a membership he cannot hold.
 */
function useFounderReply(): unknown {
  const { userType, loading } = useUser();
  const eligible = userType === "lawyer" || userType === "firm";
  const [reply, setReply] = useState<unknown>(undefined);
  useEffect(() => {
    if (loading || !eligible) return;
    const controller = new AbortController();
    fetch("/api/v1/membership/founder", { cache: "no-store", signal: controller.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as unknown) : null))
      .catch(() => null)
      .then((body) => {
        if (!controller.signal.aborted) setReply(body);
      });
    return () => controller.abort();
  }, [loading, eligible]);
  if (!loading && !eligible) return { member: false };
  return reply;
}

const SUBSCRIBE_LINK =
  "inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0a3328] dark:bg-[#C8A762] dark:text-[#0B3D2E]";

/**
 * «النقاط والاشتراك» — the library subscription (GET /api/v1/library/my-grant
 * through LibraryGrantStatusCard, or the full library through his plan), the
 * points balance (GET /api/v1/billing, the same card as Settings) and a
 * founder's library-assistant points (GET /api/v1/membership/founder). Prices
 * and plans are /laws/subscribe's; nothing here sells or changes one.
 */
export function PlanBlock({ fullAccess }: { fullAccess: boolean | null }) {
  const { answer, loading } = useMyLibraryGrant();
  const sub = subscriptionView(loading ? null : answer, fullAccess);
  const { state: billing } = useBillingData();
  const founder = founderPointsView(useFounderReply());

  return (
    <BlockShell id="plan" icon={Coins} title="النقاط والاشتراك" subtitle="اشتراكك في المكتبة ورصيد نقاطك.">
      <div className="space-y-3">
        {/* The library subscription */}
        {loading ? (
          <Shimmer className="h-20 w-full" />
        ) : sub.kind === "grant" ? (
          <LibraryGrantStatusCard answer={answer} />
        ) : sub.kind === "plan" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#0B3D2E] dark:text-emerald-300">
              <SealCheck size={16} weight="fill" /> الوصول الكامل للمكتبة مفعّل لحسابك
            </p>
            <p className="mt-1 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
              يأتي ضمن باقتك الحالية، وليس لديك اشتراك مكتبة مستقل.
            </p>
            <Link
              href="/settings?tab=subscription"
              className="mt-2 inline-flex text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]"
            >
              إدارة الباقة
            </Link>
          </div>
        ) : sub.kind === "none" ? (
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/[0.08]">
            <p className="text-[13px] font-bold text-zinc-800 dark:text-white">لا يوجد لديك اشتراك في المكتبة حالياً.</p>
            <p className="mt-1 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
              {sub.messageAr ?? "يتيح الاشتراك قراءة النصوص كاملة في الأنظمة والسوابق والكتب."}
            </p>
            <Link href="/laws/subscribe" className={`mt-3 ${SUBSCRIBE_LINK}`}>
              خطط المكتبة <ArrowLeft size={13} />
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <BlockNote tone="error">تعذّر التحقق من اشتراكك في المكتبة الآن.</BlockNote>
            <Link href="/laws/subscribe" className="inline-flex text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]">
              خطط المكتبة
            </Link>
          </div>
        )}

        {/* The points balance */}
        {billing.status === "loading" ? (
          <Shimmer className="h-20 w-full" />
        ) : billing.status === "error" ? (
          <BlockNote tone="error">تعذّر تحميل رصيد النقاط الآن.</BlockNote>
        ) : (
          <PointsBalanceCard data={billing.data} />
        )}

        {/* A founder's library-assistant points */}
        {founder.kind === "member" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[#C8A762]/30 bg-[#C8A762]/5 p-4 dark:bg-[#C8A762]/10">
            <Sparkle size={20} weight="fill" className="shrink-0 text-[#C8A762]" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-zinc-800 dark:text-white">
                نقاط مساعد المكتبة الذكي: {arDigits(founder.remaining)} من {arDigits(founder.total)}
              </p>
              <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">من عضويتك المؤسسة، تُستخدم لأسئلة مساعد المكتبة.</p>
            </div>
          </div>
        ) : founder.kind === "unavailable" ? (
          <BlockNote>تعذّر تحميل نقاط العضوية المؤسسة الآن.</BlockNote>
        ) : null}

        {sub.kind === "grant" || sub.kind === "plan" ? (
          <Link
            href="/laws/subscribe"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]"
          >
            خطط المكتبة <ArrowLeft size={12} />
          </Link>
        ) : null}
      </div>
    </BlockShell>
  );
}
