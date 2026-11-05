/**
 * betaGatedRoutes.ts — which /ai routes a visitor can actually use while the
 * beta review gate is on (Wave 1 task 6, slice D "honesty defects").
 *
 * `LEGAL_DATA_REVIEW_GATED_TOOLS` (src/lib/betaConfig.ts) lists every output
 * BetaReviewGate hides. It mixes two kinds of route:
 *   - a TERMINAL route: every path through the page ends at the gate's
 *     "not available during beta" card (or the page is DashboardComingSoon).
 *     The tool cannot produce anything for a normal account, so every nav,
 *     sidebar and hub row that opens it says «قريباً», and the page shows the
 *     gate first instead of playing a form and a progress timer before it;
 *   - a LIVE route: the page has a real path (a charged AI run through
 *     useAiRun, or real reference data) and only an old sub-result is gated.
 *     Badging it «قريباً» would be a false claim the other way.
 *
 * Every route in the registry is in exactly one list; betaGatedRoutes.test.ts
 * holds that, checks each list against the page code (no useAiRun under a
 * terminal route), and checks the nav rows.
 *
 * Pure (no imports), so `node --test` and any client component can load it.
 */

export const COMING_SOON_BADGE_AR = "قريباً";

/** Pages that render BetaReviewGate around their only output (mock behind it). */
export const GATE_ONLY_TOOL_ROUTES = [
  "/ai/consult",
  "/ai/report-generator",
  "/ai/smart-inspector",
  // Clients get SmartAnalyzer (gated mock). Lawyer and firm get the real case
  // brief on the same URL: LIVE_FOR_LAWYER_AND_FIRM_ROUTES below.
  "/ai/analyze",
  "/ai/corp/compliance-monitor",
  "/ai/corp/advisor",
  "/ai/corp/risk-assessment",
  "/ai/corp/deal-intel",
  "/ai/ngo/donation-analyzer",
  "/ai/ngo/report-generator",
  "/ai/gov/judgment-drafter",
  "/ai/gov/jurisdiction-analyzer",
  "/ai/gov/legal-opinion-drafter",
  "/ai/gov/procurement-reviewer",
  "/ai/gov/procedure-guide",
  "/ai/gov/rights-reminder",
  "/ai/gov/contract-reviewer",
  "/ai/gov/evidence-analyzer",
  "/ai/gov/guarantees-checker",
  "/ai/gov/judgment-weigher",
  "/ai/gov/judicial-search",
  "/ai/gov/arrest-forms",
  "/ai/gov/detention-records",
  "/ai/gov/indictment-drafter",
  "/ai/gov/verdict-drafter",
  "/ai/gov/investigation-forms",
  "/ai/gov/incident-report",
  "/ai/gov/compliance-checker",
  // Its date rules are real (deadlineEngine), but its output is gated.
  "/ai/gov/deadline-calculator",
] as const;

/** Registry routes whose page renders DashboardComingSoon (owner ١١٥). */
export const COMING_SOON_TOOL_ROUTES = [
  "/ai/compare",
  "/ai/transcriber",
  "/ai/corp/compliance",
  "/ai/corp/hr",
  "/ai/corp/corpmind",
] as const;

/** Registry routes with a working path; only an older sub-result is gated. */
export const LIVE_ROUTES_WITH_GATED_PARTS: Readonly<Record<string, string>> = {
  "/ai/draft": "StepAiDraft runs the legal-drafter tool (useAiRun)",
  "/ai/legal-opinion": "the consultation and the letter run through useAiRun",
  "/ai/contract-drafter": "the draft runs through useAiRun; the aiDraft result is never gated",
  "/ai/brief-check": "the review runs through useAiRun",
  "/ai/wargaming": "the simulation runs through useAiRun",
  "/ai/quick-answer": "the answer runs through useAiRun",
  "/ai/procedures": "the courts, circuits and agencies directories are real data; only the manual guide is gated",
};

/** Every route that opens to nothing usable: the gate card or «قريباً». */
export const TERMINAL_TOOL_ROUTES: readonly string[] = [...GATE_ONLY_TOOL_ROUTES, ...COMING_SOON_TOOL_ROUTES];

/** "/ai/consult?ctx=x#y" → "/ai/consult". */
export function routeOf(href: string): string {
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** True when the link opens a tool that cannot answer yet. */
export function isTerminalToolHref(href: string): boolean {
  return TERMINAL_TOOL_ROUTES.includes(routeOf(href));
}

/**
 * A terminal route that is live for lawyer and firm accounts. /ai/analyze ends at
 * the gate for every client surface, so it stays in the list above, and the lawyer
 * and firm surfaces (their sidebars, the lawyer catalog) open the real case brief
 * there. Only those two surfaces may read this; a client surface uses isTerminalToolHref.
 */
export const LIVE_FOR_LAWYER_AND_FIRM_ROUTES: readonly string[] = ["/ai/analyze"];

export function isLiveForLawyerAndFirm(href: string): boolean {
  return LIVE_FOR_LAWYER_AND_FIRM_ROUTES.includes(routeOf(href));
}
