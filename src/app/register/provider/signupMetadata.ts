/**
 * signupMetadata.ts — the account fields /register/provider sends to
 * `supabase.auth.signUp` for each card, which `?type=` values preselect a
 * card, and the consultant's fixed country.
 *
 * The consultant (owner answers ١٧٣ / ٢١٩) is a `lawyer` account whose
 * `lawyer_profiles.practice_kind` is 'consultant'. The signup metadata carries
 * `practice_kind: 'consultant'`, and the BEFORE INSERT trigger of
 * supabase/migrations/20261019_20_lawyer_practice_kind.sql copies it onto the
 * row only when it is exactly 'consultant'. The other five cards send no
 * `practice_kind` key at all, so their signups are what they were before.
 * Consultants register only through this form (ruling P11): Google onboarding
 * has no consultant option.
 *
 * No `@/` imports and no runtime imports: `node --test` loads this file
 * directly (signupMetadata.test.ts). `./types.ts` is a type-only import.
 */
import type { ProviderType } from "./types.ts";

export type ProviderTypeId = Exclude<ProviderType, null>;

export interface ProviderSignupMetadata {
  user_type: "lawyer" | "firm" | "provider";
  sub_role: "notary" | "arbitrator" | "bailiff" | null;
  practice_kind?: "consultant";
}

// Keyed by every ProviderType, so a new card is a compile error until it has
// a row here. The first five are the inline ternaries the page used before:
// موثّق / معقّب / محكّم are the one user_type `provider`, told apart by
// `sub_role`, and the معقّب's sub_role is 'bailiff', not its card id.
const METADATA: Record<ProviderTypeId, ProviderSignupMetadata> = {
  lawyer: { user_type: "lawyer", sub_role: null },
  firm: { user_type: "firm", sub_role: null },
  notary: { user_type: "provider", sub_role: "notary" },
  tracker: { user_type: "provider", sub_role: "bailiff" },
  arbitrator: { user_type: "provider", sub_role: "arbitrator" },
  consultant: { user_type: "lawyer", sub_role: null, practice_kind: "consultant" },
};

/** Every card id, in the order of data.ts (signupMetadata.test.ts pins it). */
export const PROVIDER_TYPE_IDS = Object.keys(METADATA) as ProviderTypeId[];

/** user_type, sub_role and (for a consultant only) practice_kind, as a fresh object. */
export function providerSignupMetadata(type: ProviderTypeId): ProviderSignupMetadata {
  return { ...METADATA[type] };
}

/**
 * The card a `?type=` value names, or null. Exact match only: a typo, another
 * page's value (the pricing CTAs also send `?type=service`) or a user_type
 * such as `admin` preselects nothing.
 */
export function parseProviderTypeParam(v: string | null | undefined): ProviderTypeId | null {
  return typeof v === "string" && (PROVIDER_TYPE_IDS as string[]).includes(v) ? (v as ProviderTypeId) : null;
}

/** The consultant card is for consultants licensed in Saudi Arabia only. */
export const CONSULTANT_COUNTRY = "SA";

/**
 * The country a signup is filed under: always SA for a consultant, otherwise
 * the country chosen on step 2 (SA when none was chosen, as before).
 */
export function signupCountry(type: ProviderType, chosen: string | null | undefined): string {
  if (type === "consultant") return CONSULTANT_COUNTRY;
  return chosen || "SA";
}
