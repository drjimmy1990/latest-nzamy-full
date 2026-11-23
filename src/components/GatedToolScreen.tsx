"use client";

/**
 * GatedToolScreen — the beta gate FIRST, for a tool whose every output is
 * gated (Wave 1 task 6; GATE_ONLY_TOOL_ROUTES in
 * src/constants/betaGatedRoutes.ts).
 *
 * Those pages used to play their whole form and a fake progress timer and
 * only then show BetaReviewGate's "not available during beta" card. Wrapping
 * the page in this shows the card on arrival instead: no form, no timer, no
 * mock result reachable before it. The page and its mock data stay in the
 * tree for the day the gate comes off.
 *
 * Same decision as <BetaReviewGate reviewScope="legal-data">: gated while
 * BETA_REVIEW_MODE is on, except for a demo-bypass account, which sees the
 * page exactly as before (its inner gates pass through too).
 *
 * Owner ١٧٤ (ب) / ١١٥ (batch l13): the pages behind this gate are canned (no
 * engine behind them). Outside demo mode they never render, whatever
 * BETA_REVIEW_MODE says — beta mode off shows «قيد التفعيل», not the mock —
 * for every account, the admin included. Demo mode (a demo build) keeps the
 * old behaviour.
 */

import type { ReactNode } from "react";
import BetaReviewGate from "@/components/BetaReviewGate";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import { useUser } from "@/hooks/useUser";
import { isDemoMode } from "@/lib/runtimeMode";

// ── Safe import, as in BetaReviewGate.tsx: if betaConfig is deleted (its
// "Option C"), beta mode is OFF and every page renders as before ──────────────
let BETA_REVIEW_MODE = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require("@/lib/betaConfig");
  BETA_REVIEW_MODE = cfg.BETA_REVIEW_MODE ?? false;
} catch {
  // betaConfig.ts was deleted — beta mode OFF
}

export default function GatedToolScreen({
  toolId,
  toolName,
  children,
}: {
  /** Stable id from LEGAL_DATA_REVIEW_GATED_TOOLS. */
  toolId: string;
  /** The tool's name, shown in the card's title. */
  toolName: string;
  children: ReactNode;
}) {
  const user = useUser();
  if (!BETA_REVIEW_MODE || user.isDemoBypass) {
    // Owner ١٧٤: a canned page is shown only in a demo build.
    if (isDemoMode) return <>{children}</>;
    return (
      <DashboardComingSoon
        title={`${toolName} — قيد التفعيل`}
        description="هذه الأداة قيد التفعيل: لم تُربط بعد بمحركها الحقيقي، فلا تُعرض هنا نتائج جاهزة مكان نتيجة حقيقية."
        backHref="/ai"
      />
    );
  }
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <BetaReviewGate toolId={toolId} toolName={toolName} reviewScope="legal-data">
        {null}
      </BetaReviewGate>
    </div>
  );
}
