"use client";

/**
 * «اشتراك المكتبة: ساري حتى [التاريخ]» (owner note ١٨ C05) — the one place a
 * library-only subscriber sees when his library ends. Before this card the
 * date was only in the approval notification.
 *
 * It reads GET /api/v1/library/my-grant (the chain end of his stacked grants,
 * never the admin's reason) unless the parent already holds that answer and
 * passes it as `answer` (/laws/subscribe reads it once for the card AND the
 * purchase gate). It renders NOTHING while loading, for a guest, for someone
 * with no library grant, or when the read fails — never a placeholder date.
 *
 * Placed in: settings → الاشتراك (SubscriptionTab) and /laws/subscribe.
 * Dashboard home, the account menu and beside «المكتبة القانونية» in the nav
 * are integration points for the coordinator (shared files).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ArrowLeft } from "@phosphor-icons/react";
import {
  MY_LIBRARY_GRANT_ENDPOINT,
  grantHeadlineAr,
  grantNeedsRenewal,
  parseMyLibraryGrant,
  type MyLibraryGrantAnswer,
} from "@/lib/library/myLibraryGrant";

/** Reads /api/v1/library/my-grant once per mount. `loading` until it answers. */
export function useMyLibraryGrant(): { answer: MyLibraryGrantAnswer | null; loading: boolean } {
  const [state, setState] = useState<{ answer: MyLibraryGrantAnswer | null; loading: boolean }>({
    answer: null,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    fetch(MY_LIBRARY_GRANT_ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (res) => parseMyLibraryGrant(res.ok, await res.json().catch(() => null)))
      .catch(() => parseMyLibraryGrant(false, null))
      .then((answer) => {
        if (alive) setState({ answer, loading: false });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function LibraryGrantStatusCard({
  answer,
  showRenew = true,
  className = "",
}: {
  /** The parent's own my-grant answer; omitted → the card reads it itself. */
  answer?: MyLibraryGrantAnswer | null;
  /** Hide the renew link (e.g. on the subscribe page, whose plans are right below). */
  showRenew?: boolean;
  className?: string;
}) {
  if (answer !== undefined) return <CardBody answer={answer} showRenew={showRenew} className={className} />;
  return <SelfLoadingCard showRenew={showRenew} className={className} />;
}

function SelfLoadingCard({ showRenew, className }: { showRenew: boolean; className: string }) {
  const { answer } = useMyLibraryGrant();
  return <CardBody answer={answer} showRenew={showRenew} className={className} />;
}

function CardBody({
  answer,
  showRenew,
  className,
}: {
  answer: MyLibraryGrantAnswer | null;
  showRenew: boolean;
  className: string;
}) {
  const grant = answer?.grant;
  if (!grant) return null;
  const renewSoon = grantNeedsRenewal(grant);

  return (
    <section
      aria-label="اشتراك المكتبة القانونية"
      dir="rtl"
      className={`rounded-2xl border p-4 sm:p-5 ${
        renewSoon
          ? "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
          : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
      } ${className}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B3D2E] text-[#C8A762]">
          <BookOpen size={20} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-black text-[#0B3D2E] dark:text-emerald-300">{grantHeadlineAr(grant)}</p>
          <p className="mt-1 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
            {grant.planLabel ? `الباقة: ${grant.planLabel}` : "اشتراك المكتبة القانونية"}
            {grant.status === "active" && grant.daysLeft > 0 ? ` · متبقٍ ${grant.daysLeft} يوماً` : ""}
          </p>
          {grant.nextStartsAt ? (
            <p className="mt-1 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
              لديك منحة أخرى تبدأ لاحقاً، ويعود الوصول الكامل عند بدايتها.
            </p>
          ) : null}
          {renewSoon ? (
            <p className="mt-1 text-xs font-bold leading-6 text-amber-800 dark:text-amber-300">
              يقترب موعد انتهاء اشتراكك؛ جدّده الآن ليستمر الوصول دون انقطاع، فالمدة الجديدة تُضاف بعد نهاية الحالية.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/laws"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0a3328] dark:bg-[#C8A762] dark:text-[#0B3D2E]"
          >
            فتح المكتبة <ArrowLeft size={13} />
          </Link>
          {showRenew ? (
            <Link
              href="/laws/subscribe"
              className={`inline-flex items-center rounded-xl px-4 py-2 text-xs font-bold ${
                renewSoon
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-[#0B3D2E]/30 text-[#0B3D2E] hover:bg-[#0B3D2E]/5 dark:border-white/15 dark:text-zinc-300"
              }`}
            >
              تجديد الاشتراك
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
