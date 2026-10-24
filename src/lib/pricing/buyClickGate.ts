/**
 * buyClickGate.ts — what a plan card's buy button does with a click, given
 * the PricingCards session.
 *
 *   wait    — useUser() is still resolving: ignore the click. Acting on it
 *             would treat a signed-in member as a guest and send them to
 *             /register (Settings → «الاشتراك والباقة» mounts PricingCards
 *             with its own, not yet resolved, useUser() call);
 *   default — a guest: the CTA's own register/login navigation;
 *   member  — the existing buy logic (checkout, or the review request).
 *
 * Pure, no imports, so `node --test` loads it (buyClickGate.test.ts).
 */
export type BuyClickGate = "wait" | "default" | "member";

export function buyClickGate(session: { loading: boolean; isLoggedIn: boolean }): BuyClickGate {
  if (session.loading) return "wait";
  return session.isLoggedIn ? "member" : "default";
}
