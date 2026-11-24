/**
 * Which provider specialty may open which part of /dashboard/provider.
 *
 * Live check of 13 Nov, row 23: a notary could open the arbitrator's pages.
 * The edge (routeAccess.ts) checks only `profiles.user_type === "provider"`,
 * and the specialty lived in the sidebar alone. Each specialty's subtree now
 * has a server layout (ProviderSpecialtyGate) that asks this function, with
 * the specialty read from the provider's own `provider_profiles.sub_role`
 * through their RLS client — never from user_metadata, which the user can
 * write.
 *
 * Pure, so the rule is testable; the I/O lives in the gate component.
 */

export const PROVIDER_SPECIALTIES = ["notary", "arbitrator", "bailiff"] as const;
export type ProviderSpecialty = (typeof PROVIDER_SPECIALTIES)[number];

/** The specialty a /dashboard/provider subtree belongs to, or null for the shared pages. */
export const PROVIDER_SPECIALTY_PREFIXES: Readonly<Record<string, ProviderSpecialty>> = Object.freeze({
  "/dashboard/provider/arbitration": "arbitrator",
  "/dashboard/provider/notary": "notary",
  "/dashboard/provider/bailiff": "bailiff",
});

export type SpecialtyFacts = {
  /** profiles.user_type, or null when it could not be read. */
  userType: string | null;
  /** provider_profiles.sub_role; "unavailable" when the read failed. */
  subRole: string | null | "unavailable";
};

/**
 * true = render the page. The admin passes (they open every dashboard).
 * Anything unread or not matching is refused — the pages behind this are
 * the specialty's own work, and a failed read must not open them.
 */
export function mayOpenSpecialty(required: ProviderSpecialty, facts: SpecialtyFacts): boolean {
  if (facts.userType === "admin") return true;
  if (facts.userType !== "provider") return false;
  if (facts.subRole === "unavailable" || facts.subRole === null) return false;
  return facts.subRole === required;
}
