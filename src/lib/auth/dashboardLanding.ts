/**
 * dashboardLanding — where GET /dashboard sends a signed-in account (owner
 * package 25-Nov, D-33). There was no /dashboard page at all, yet the «تم
 * استلام طلبك» notification, the lawyer-approval notification, PaywallGate,
 * StepConfirm, LeaveFirmCard, payments/result and account-frozen all link to
 * it: a signed-in user landed on a 404.
 *
 * The same rules as every other landing, composed — never a new table:
 *   1. an unfinished account → /onboarding (needsOnboarding, shared with
 *      src/proxy.ts and the OAuth callback);
 *   2. an active firm member who is a lawyer/individual → /dashboard/firm
 *      (firmLandingFor, as GET /api/v1/auth/session answers /login);
 *   3. otherwise the type's own dashboard (dashboardPathFor; an unknown type
 *      → FALLBACK_DASHBOARD_PATH "/", never a guessed path).
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { needsOnboarding } from "./onboardingGate.ts";
import { defaultDashboardPathFor } from "./firmLanding.ts";

export interface DashboardLandingInput {
  /** `profiles.user_type`; null/undefined when the row is missing. */
  userType: string | null | undefined;
  /** `profiles.onboarding_completed`, as read. */
  onboardingCompleted: unknown;
  /** `profiles.phone`, as read. */
  phone: unknown;
  /** An `active` firm_members row of the caller (own-row RLS read). */
  isActiveFirmMember: boolean;
}

export function dashboardLandingFor(input: DashboardLandingInput): string {
  const userType = typeof input.userType === "string" ? input.userType : "";
  // Non-empty after trimming, as the OAuth callback counts it.
  const hasPhone = typeof input.phone === "string" && input.phone.trim() !== "";
  if (needsOnboarding({ userType, onboardingCompleted: input.onboardingCompleted, hasPhone })) {
    return "/onboarding";
  }
  return defaultDashboardPathFor(userType, input.isActiveFirmMember);
}
