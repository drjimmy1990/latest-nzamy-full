"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKey, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useOfficePlanLevel, type OfficePlanLevelState } from "@/hooks/useOfficePlanLevel";
import { isSupabaseMode } from "@/lib/services/api";
import { getDashboardRoute } from "@/constants/navigation.types";
import {
  OFFICE_PLAN_LINK_AR,
  OFFICE_PLAN_PRICING_HREF,
  officeAudienceFor,
  officePlanPhraseAr,
  type OfficeAudience,
} from "@/lib/auth/officePlan";
import {
  OFFICE_TEASER_KEEP_AR,
  OFFICE_TEASER_TITLE_AR,
  officeLevelGrants,
  officePageNeed,
  type OfficeNeed,
  type OfficeScope,
} from "@/lib/auth/officePages";

/**
 * Owner ق٢٦-١ / ق٢٦-٤ / ق٢٦-٥: a paid office page opened by an account on
 * the free side (or a «شركة المحاماة» page opened by a «مكتب المحاماة»
 * account) shows the lock teaser and the upgrade path instead of the page —
 * whatever way it was opened (menu, bookmark, typed URL). The rule is the
 * database's (useOfficePlanLevel → my_office_plan_level); the pages that need
 * a step are src/lib/auth/officePages.ts. Nothing is locked while the answer
 * loads (nothing is shown either), when the read fails (the server's write
 * gates still refuse, fail-closed), for an admin, in demo mode, or for a
 * non-professional account.
 */
export function useOfficeGateFor(need: OfficeNeed | null): { state: OfficePlanLevelState; locked: boolean; pending: boolean } {
  const user = useUser();
  const enabled = need !== null && isSupabaseMode && !user.loading && user.isLoggedIn && user.userType !== "admin";
  const state = useOfficePlanLevel(enabled);
  const pending = need !== null && isSupabaseMode && (user.loading || state.status === "loading");
  const locked = need !== null && state.status === "ready" && !officeLevelGrants(state.level, need);
  return { state, locked, pending };
}

export default function OfficePlanGuard({ scope, children }: { scope: OfficeScope; children: ReactNode }) {
  const pathname = usePathname();
  const need = officePageNeed(scope, pathname);
  const { locked, pending } = useOfficeGateFor(need);
  if (pending) return null;
  if (locked && need) return <OfficePlanTeaser need={need} />;
  return <>{children}</>;
}

/** The lock teaser: what the tool is for, where the plans are, and that nothing he added is lost. */
export function OfficePlanTeaser({ need, note }: { need: OfficeNeed; note?: string }) {
  const { isDark } = useTheme();
  const user = useUser();
  const audience: OfficeAudience = need === "enterprise" ? "enterprise" : officeAudienceFor(user.userType);
  const backHref = user.userType ? getDashboardRoute(user.userType) : "/dashboard";
  const card = isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm";
  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-600";
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4" dir="rtl">
      <div role="region" aria-label={OFFICE_TEASER_TITLE_AR} className={`flex w-full max-w-md flex-col items-center rounded-2xl border p-8 text-center ${card}`}>
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#C8A762]/15 text-[#C8A762]">
          <LockKey size={34} weight="duotone" />
        </div>
        <h2 className={`mb-3 text-xl font-bold ${tp}`}>🔒 {OFFICE_TEASER_TITLE_AR}</h2>
        <p className={`mb-2 text-[14px] leading-7 ${ts}`}>
          {`هذه الأداة متاحة في ${officePlanPhraseAr(audience)}.`}
        </p>
        {note && <p className={`mb-2 text-[13px] leading-7 ${ts}`}>{note}</p>}
        <p className={`mb-6 text-[13px] leading-7 ${ts}`}>{OFFICE_TEASER_KEEP_AR}</p>
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row">
          <Link
            href={OFFICE_PLAN_PRICING_HREF}
            className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#0a3328]"
          >
            {OFFICE_PLAN_LINK_AR}
          </Link>
          <Link
            href={backHref}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-6 py-3 text-[14px] font-medium transition-colors sm:w-auto ${
              isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ArrowLeft size={18} />
            العودة للوحة
          </Link>
        </div>
      </div>
    </div>
  );
}
