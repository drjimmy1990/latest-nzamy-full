"use client";

/**
 * CurrentPlanCard — «باقتك الحالية», shared by Settings → «الاشتراك والباقة»
 * and /dashboard/billing so the two can never disagree (BUG-08).
 *
 * The plan is the tier every access gate already uses (useUser().tier, named by
 * currentPlanLabelAr) PLUS the lawyer founder membership, read from GET
 * /api/v1/membership/founder — the same per-viewer RLS read as the dashboard's
 * «عضويتي المؤسسة». founder_activate does not write `tier`, so without this
 * read a founder was shown the free tier here. Every decision is in the pure
 * currentPlanView.ts; this component fetches and draws.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CrownSimple, Info, SealCheck } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { isSupabaseMode } from "@/lib/services/api";
import { currentPlanLabelAr } from "@/lib/pricing/currentPlanLabel";
import { currentPlanView } from "./currentPlanView";

const PANEL =
  "bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]";

function PlanSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[92px] rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] bg-slate-100/60 dark:bg-white/[0.03] animate-pulse"
    />
  );
}

/** GET /api/v1/membership/founder: undefined while it runs, null when it failed. */
function useFounderMembership(enabled: boolean): unknown {
  const [reply, setReply] = useState<unknown>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/v1/membership/founder", { cache: "no-store", signal: controller.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as unknown) : null))
      .catch(() => null)
      .then((body) => { if (!controller.signal.aborted) setReply(body); });
    return () => controller.abort();
  }, [enabled]);
  return reply;
}

const NOT_A_FOUNDER = Object.freeze({ member: false });

export function CurrentPlanCard({ plansHref }: { plansHref: string }) {
  const { userType, practiceKind, loading, tier, isLoggedIn } = useUser();
  const read = isSupabaseMode && !loading && isLoggedIn;
  const founderReply = useFounderMembership(read);
  const planTier = tier ?? "free";
  const view = currentPlanView({
    userLoading: loading,
    tier: planTier,
    tierLabel: currentPlanLabelAr(userType, practiceKind, planTier),
    practiceKind,
    // Demo mode and signed-out sessions read nothing: no seat to find.
    founder: read ? founderReply : NOT_A_FOUNDER,
  });

  // Still resolving — say nothing about the plan yet (a «لا باقة» flash
  // before the truth is the defect SidebarComponents' `gateReady` prevents).
  if (view.kind === "loading") return <PlanSkeleton />;

  const plansLink = (
    <Link href={plansHref} className="text-xs font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline">
      الباقات المتاحة
    </Link>
  );

  if (view.kind === "free" || view.kind === "unverifiable") {
    const unverifiable = view.kind === "unverifiable";
    return (
      <div className={`${PANEL} px-6 py-10 text-center`}>
        <div className="mb-3 flex justify-center text-zinc-400 dark:text-zinc-500">
          {unverifiable ? <Info size={28} /> : <CrownSimple size={28} />}
        </div>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {unverifiable ? "تعذّر التحقق من باقتك الآن" : "لا باقة فعّالة"}
        </p>
        <p className="mt-1.5 text-xs leading-6 text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
          {unverifiable
            ? "لم نتمكن من قراءة عضويتك في هذه اللحظة — حدّث الصفحة بعد قليل."
            : "لا يوجد اشتراك مدفوع مفعّل على حسابك حالياً."}
        </p>
        {!unverifiable && (
          <Link
            href={plansHref}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0f5a42] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:hover:opacity-90"
          >
            الباقات المتاحة
          </Link>
        )}
      </div>
    );
  }

  if (view.kind === "founder") {
    return (
      <div className={`${PANEL} px-6 py-6`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#C8A762]/15 text-[#C8A762]">
              <SealCheck size={22} weight="fill" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{view.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">باقتك الحالية</p>
            </div>
          </div>
          {plansLink}
        </div>
        <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {view.lines.map((line) => (
            <li key={line} className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{line}</li>
          ))}
          {view.alsoTierLabel && (
            <li className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">وباقة: {view.alsoTierLabel}</li>
          )}
        </ul>
        {view.note && (
          <p className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <Info size={15} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {view.note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`${PANEL} px-6 py-6`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
            <CrownSimple size={22} weight="fill" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{view.label}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">باقتك الحالية</p>
          </div>
        </div>
        {plansLink}
      </div>
    </div>
  );
}
