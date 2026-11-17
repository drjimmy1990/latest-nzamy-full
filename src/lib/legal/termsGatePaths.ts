/**
 * Where the re-ask modal (TermsReacceptGate) may open. Client-safe and pure —
 * kept apart from termsAcceptance.ts, which imports node:crypto.
 */

/**
 * Pages where the re-ask modal never opens: the two documents it links to,
 * the onboarding wizard (it carries its own checkbox), and the auth screens.
 */
const EXEMPT_PREFIXES = [
  "/terms",
  "/privacy",
  "/refund-policy",
  "/onboarding",
  "/login",
  "/register",
  "/auth",
  "/reset-password",
  "/forgot-password",
  "/account-frozen",
] as const;

export function isTermsGateExemptPath(pathname: string | null | undefined): boolean {
  const p = pathname ?? "";
  return EXEMPT_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
