/**
 * lawyerAiBadges.ts — the lawyer AI hub's point badges, read from the AI
 * registry (Wave 1 task 4). Kept apart from lawyerAiCatalog.ts so that file,
 * which useUser loads on every page for the permission list, does not pull
 * the registry (src/lib/ai/tools.ts) into every page's bundle.
 *
 * Relative `.ts` imports only: `node --test` loads this file.
 */
import { aiToolPointRange, aiToolPointsLabel, pointsNounAr, type PricedAiToolRef } from "../lib/ai/toolPointsDisplay.ts";
import type { LawyerAiPermission, LawyerAiTool } from "./lawyerAiCatalog.ts";

/**
 * The registry tool (src/lib/ai/tools.ts) behind each priced catalog id: the
 * hub badge is the points that tool's run is charged, read from the registry
 * (toolPointsDisplay.ts), never a figure written here (Wave 1 task 4). The
 * price list under the lawyer cards on /pricing (`lawyerServicesTable` in
 * src/constants/pricing/pricing.lawyers.ts) reads the same registry, so the
 * two cannot disagree; pricingApprovals.test.ts holds both to the server.
 *
 * A catalog id with no registry tool gets no badge: a missing price is better
 * than a guessed one. A `comingSoon` tool shows «قريباً» whatever this map
 * holds. The legal opinion sells two runs (a consultation and a letter) under
 * one card, so its badge spans both.
 *
 * UNPRICED UNTIL THEY WORK (owner ١١٥, fix round 1). These tools are
 * `comingSoon` with no registry entry, so neither this map nor
 * lawyerServicesTable sells them. The owner's approved figures, for when each
 * page really answers (the badge will then read the registry's price):
 *   - "ai:analyze": ٨ — row «عصارة المرفقات وتلخيص ملف القضية واستخلاص
 *     النزاع»; the lawyer card also listed «عصارة المرفقات وتلخيص ملف
 *     القضية: ٨ نقاط» / "Attachment digest and case summary: 8 points".
 *   - "ai:transcriber" and "ai:secretary": ٥ — one shared row,
 *     «التفريغ الصوتي الذكي وأوامر السكرتير».
 */
export const TOOL_POINT_SOURCES: Readonly<Partial<Record<LawyerAiPermission, PricedAiToolRef>>> = {
  "ai:quick-answer": "quick-answer",
  "ai:case-brief": "case-brief",
  "ai:draft": "legal-drafter",
  "ai:brief-check": "brief-check",
  "ai:contracts": "contracts-pro",
  "ai:contract-drafter": "contract-drafter",
  "ai:wargaming": "wargaming",
  "ai:analyze-strength": "analyze-strength",
  "ai:legal-opinion": ["legal-opinion-consult", "legal-opinion-letter"],
  "ai:najiz-optimizer": "najiz-optimizer",
  "ai:communicate": "communicate",
  "ai:assistant": "assistant",
};

/** A priced tool's points on the hub, keyed by catalog id: «٢٥٠», «٥٠٠–١٬٥٠٠». */
export const TOOL_POINT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_POINT_SOURCES).map(([id, ref]) => [id, aiToolPointsLabel(ref, "ar")]),
);

export function getLawyerAiBadge(tool: LawyerAiTool, lang: "ar" | "en"): string | null {
  // Checked FIRST, before any price: a tool with no working page is not
  // "100 points", it is not available. See `comingSoon` on LawyerAiTool.
  if (tool.comingSoon) return lang === "ar" ? "قريباً" : "Coming soon";
  if (tool.betaStatus === "beta-free") return lang === "ar" ? "بيتا مجاني" : "Beta free";
  if (tool.betaStatus === "free") return lang === "ar" ? "مجاني" : "Free";
  const ref = TOOL_POINT_SOURCES[tool.permission];
  if (!ref) return null;
  if (lang === "en") return `${aiToolPointsLabel(ref, "en")} pts`;
  // A range agrees with its upper bound, the number read last.
  return `${aiToolPointsLabel(ref, "ar")} ${pointsNounAr(aiToolPointRange(ref)[1])}`;
}
