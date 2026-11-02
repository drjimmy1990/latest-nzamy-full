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
 * page exactly as before (its inner gates pass through too). Beta mode off →
 * the page renders as before, zero side effects.
 */

import type { ReactNode } from "react";
import BetaReviewGate from "@/components/BetaReviewGate";
import { BETA_REVIEW_MODE } from "@/lib/betaConfig";
import { useUser } from "@/hooks/useUser";

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
  if (!BETA_REVIEW_MODE || user.isDemoBypass) return <>{children}</>;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <BetaReviewGate toolId={toolId} toolName={toolName} reviewScope="legal-data">
        {null}
      </BetaReviewGate>
    </div>
  );
}
