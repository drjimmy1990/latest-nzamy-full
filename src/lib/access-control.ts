/**
 * access-control.ts — Server-side access control
 * ─────────────────────────────────────────────────────────
 * Provides server-side enforcement of subscription tier
 * gating, library paywall, and AI credit checks.
 *
 * Usage in API routes:
 *   import { requireAdmin, checkLibraryAccess, checkCreditBalance } from "@/lib/access-control";
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isExplicitlyFreeLibraryItem, type LibraryFreeItemType } from "@/lib/library-item-access";
import {
  resolvePaymentGatewayState,
  type PaymentGatewayState,
  type PaymentGatewayStatus,
} from "@/lib/paymentGatewayPolicy";
import { isAuthUnavailable } from "@/lib/auth/apiAuth";
import { AUTH_UNAVAILABLE_AR } from "@/lib/auth/resolveAuthOutcome";
import { effectiveTier, type ActivePlanRow } from "@/lib/entitlementGrantRules";
import { fullLibraryAccess } from "@/lib/libraryAccessDecision";
import { hasActiveLibraryGrant } from "@/lib/libraryAccessServer";
import type { StaffAction, StaffRole } from "@/lib/auth/staffRoles";
import { STAFF_ONLY_AR, isMissingStaffTable, staffDecision } from "@/lib/auth/staffDecision";

export type { PaymentGatewayState, PaymentGatewayStatus } from "@/lib/paymentGatewayPolicy";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServerTier = "free" | "shield" | "ai" | "pro" | "max" | "corp" | "enterprise";

export interface AccessResult {
  allowed: boolean;
  currentTier: ServerTier;
  requiredTier: ServerTier | null;
  message?: string;
}

export interface LibraryAccessResult {
  allowed: boolean;
  isWhitelisted: boolean;
  freeLimit: number;
  /**
   * Where a positive freeLimit came from: an admin per-document override, or
   * the platform default — which a document route turns into the owner's
   * preview formula (src/lib/library/previewLimit.ts, owner answer ١٨٤).
   */
  freeLimitSource?: "override" | "default";
  currentTier: ServerTier;
  message?: string;
}

export interface CreditCheckResult {
  allowed: boolean;
  currentBalance: number;
  required: number;
  message?: string;
}

export interface AdminCheckResult {
  isAdmin: boolean;
  userId: string | null;
  error?: string;
  status?: number;
}

// ─── Tier ranking (mirrors client-side useSubscription) ────────────────────────

export const TIER_RANK: Record<ServerTier, number> = {
  free:       0,
  shield:     1,
  ai:         2,
  pro:        3,
  max:        4,
  corp:       5,
  enterprise: 6,
};

// ─── Feature gates (server-side mirror of client FEATURE_GATES) ────────────────

const SERVER_FEATURE_GATES: Record<string, ServerTier> = {
  // Library access
  "library-full-access":  "pro",
  "library-advanced-search": "ai",

  // AI features
  "ai-consult":         "free",
  "ai-contracts":       "shield",
  "ai-wargaming":       "pro",

  // Case management
  "cases-unlimited":    "pro",
  "contracts-unlimited":"max",

  // Core features
  governance:           "corp",
  "health-check":       "pro",
  marketplace:          "shield",
  finance:              "pro",
  reports:              "shield",
};

// ─── Helper: Get user's active tier ───────────────────────────────────────────

export async function getUserTier(userId: string): Promise<ServerTier> {
  const adminClient = await createServiceClient();

  // Every active row with its end date: a row whose current_period_end has
  // passed no longer counts (nothing flips it to 'expired'), and among the
  // running rows the highest tier wins — see effectiveTier().
  const { data: subs } = await adminClient
    .from("subscriptions")
    .select("tier, current_period_end")
    .eq("user_id", userId)
    .eq("status", "active");

  return effectiveTier((subs as ActivePlanRow[] | null) ?? [], Date.now(), TIER_RANK);
}

// ─── requireAdmin — Auth + admin check for API routes ─────────────────────────

export async function requireAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // 503, not 401: every caller re-serves `error`/`status` verbatim, so a
  // transport failure has to be distinguishable from "not signed in" here or
  // it reaches the browser as a sign-out (UAT-LIVE-SESSION-001).
  if (isAuthUnavailable(user, authError)) {
    return { isAdmin: false, userId: null, error: AUTH_UNAVAILABLE_AR, status: 503 };
  }

  if (!user) {
    return { isAdmin: false, userId: null, error: "غير مصرح — يرجى تسجيل الدخول", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return { isAdmin: false, userId: user.id, error: "غير مصرح — صلاحيات المسؤول مطلوبة", status: 403 };
  }

  return { isAdmin: true, userId: user.id };
}

// ─── requireStaff — admin + staff role for a destructive admin write ─────────
// Owner answer ٢١٠: each admin is a super_admin, operations or auditor
// (public.platform_staff, 20261019_30), and the matrix in
// src/lib/auth/staffRoles.ts says which role may do which action. A route
// calls requireStaff("<action>") before it validates or writes anything, and
// logAdminAction() (src/lib/auth/adminAudit.ts) after the write succeeds.
//
// The role is read with the service client from platform_staff. An admin with
// no row is an auditor (fail-closed), and so is an admin whose row could not be
// read for any other reason (logged every time). Before 20261019_30 runs (the
// table is missing: 42P01 / PGRST205) every admin keeps today's access, logged
// once per process. That is no wider than production today, and a wrong run
// order cannot 403 every admin action. The role holds only while
// profiles.user_type = 'admin', which requireAdmin() has already checked.

export type StaffCheckResult =
  | { ok: true; userId: string; role: StaffRole }
  | { ok: false; response: NextResponse };

let staffTableMissingLogged = false;

export async function requireStaff(action: StaffAction): Promise<StaffCheckResult> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.isAdmin || !adminCheck.userId) {
    // requireAdmin's 503 / 401 / 403, unchanged.
    return {
      ok: false,
      response: NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status ?? 403 }),
    };
  }

  const userId = adminCheck.userId;
  const { role, tableMissing } = await readStaffRole(userId);
  const decision = staffDecision({ isAdmin: true, role, tableMissing }, action);
  if (!decision.allowed) {
    return { ok: false, response: NextResponse.json({ error: STAFF_ONLY_AR }, { status: 403 }) };
  }
  return { ok: true, userId, role: decision.role };
}

/** The admin's platform_staff.staff_role (null: no row or unreadable). Never throws. */
async function readStaffRole(userId: string): Promise<{ role: unknown; tableMissing: boolean }> {
  try {
    const adminClient = await createServiceClient();
    const { data, error } = await adminClient
      .from("platform_staff")
      .select("staff_role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingStaffTable(error.code)) {
        if (!staffTableMissingLogged) {
          staffTableMissingLogged = true;
          console.warn(
            "[access-control] requireStaff: public.platform_staff does not exist yet (20261019_30 not applied); every admin keeps full access",
          );
        }
        return { role: null, tableMissing: true };
      }
      console.error(
        "[access-control] requireStaff: platform_staff read failed; treating the admin as auditor:",
        error.code,
        error.message,
      );
      return { role: null, tableMissing: false };
    }
    return { role: (data as { staff_role?: unknown } | null)?.staff_role ?? null, tableMissing: false };
  } catch (err) {
    console.error(
      "[access-control] requireStaff: platform_staff read threw; treating the admin as auditor:",
      err instanceof Error ? err.message : err,
    );
    return { role: null, tableMissing: false };
  }
}

// ─── checkAccess — Generic feature access check ───────────────────────────────

export async function checkAccess(
  userId: string,
  featureKey: string,
): Promise<AccessResult> {
  const currentTier = await getUserTier(userId);
  const currentRank = TIER_RANK[currentTier] ?? 0;

  const requiredTier = SERVER_FEATURE_GATES[featureKey];
  if (!requiredTier) {
    // Unknown feature = unrestricted
    return { allowed: true, currentTier, requiredTier: null };
  }

  const requiredRank = TIER_RANK[requiredTier] ?? 0;
  const allowed = currentRank >= requiredRank;

  return {
    allowed,
    currentTier,
    requiredTier: allowed ? null : requiredTier,
    message: allowed ? undefined : `يتطلب اشتراك ${requiredTier} أو أعلى`,
  };
}

// ─── Full library access — Pro+, a library grant, or an admin ────────────────
// Owner answers ٢٠٥ / ٢٠٩ (2026-10-18): the library subscription
// (public.library_access_grants) opens the whole library on its own, and so
// does a platform admin. The rule is fullLibraryAccess() in
// ./libraryAccessDecision.ts; these are its reads. getUserTier() is unchanged,
// so everything keyed on the tier alone (credits, feature gates) keeps its answer.

/**
 * True when the user is a platform admin (profiles.user_type = 'admin'), read
 * with the service client. A null id, no row, or any failure is false; never
 * throws.
 */
export async function isPlatformAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const adminClient = await createServiceClient();
    const { data, error } = await adminClient
      .from("profiles")
      .select("user_type")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[access-control] isPlatformAdmin read failed:", error.code, error.message);
      return false;
    }
    return (data as { user_type?: unknown }).user_type === "admin";
  } catch (err) {
    console.error("[access-control] isPlatformAdmin failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * True when the user has the full library: a Pro+ tier, an active library
 * grant, or an admin. A guest (null) never does. The routes that shape
 * official metadata on it call this; the per-article paywall is
 * checkLibraryAccess() below, which applies the same rule.
 */
export async function hasFullLibraryAccess(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [tier, isAdmin, hasLibraryGrant] = await Promise.all([
    getUserTier(userId),
    isPlatformAdmin(userId),
    hasActiveLibraryGrant(userId),
  ]);
  return fullLibraryAccess({ tier, isAdmin, hasLibraryGrant }, TIER_RANK);
}

/**
 * The same rule for a caller that has already read the tier: a guest reads
 * nothing more, and a Pro+ tier skips the admin and grant reads (same answer).
 */
async function fullLibraryAccessForTier(userId: string | null, tier: ServerTier): Promise<boolean> {
  if (!userId) return false;
  if (fullLibraryAccess({ tier, isAdmin: false, hasLibraryGrant: false }, TIER_RANK)) return true;
  const [isAdmin, hasLibraryGrant] = await Promise.all([isPlatformAdmin(userId), hasActiveLibraryGrant(userId)]);
  return fullLibraryAccess({ tier, isAdmin, hasLibraryGrant }, TIER_RANK);
}

// ─── checkLibraryAccess — Library-specific paywall ────────────────────────────

export async function checkLibraryAccess(
  userId: string | null,
  itemId: string,
  articleIndex: number,
  contentType: LibraryFreeItemType = "laws",
  options: { includeExplicitFreeItem?: boolean } = {},
): Promise<LibraryAccessResult> {
  const adminClient = await createServiceClient();

  // 1. Fetch platform settings
  const { data: settings } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "library_whitelisted_laws",
      "library_free_article_limit",
      "library_free_law_overrides",
      "library_free_items",
    ]);

  const settingsMap: Record<string, unknown> = {};
  settings?.forEach((s: { key: string; value: unknown }) => {
    settingsMap[s.key] = s.value;
  });

  const whitelistedSlugs: string[] =
    (settingsMap.library_whitelisted_laws as { slugs?: string[] })?.slugs ?? [];
  const globalFreeLimit: number =
    (settingsMap.library_free_article_limit as { default?: number })?.default ?? 5;
  const overrides: Record<string, number> =
    (settingsMap.library_free_law_overrides as { overrides?: Record<string, number> })?.overrides ?? {};

  // Per-content-type "always free" slugs/ids written by the admin "free items" toggle.
  // `principles` is the canonical key for judicial-principle IDs.
  const freeItemsMap = (settingsMap.library_free_items as Record<string, string[]>) ?? {};

  // 2. Check an exact item's explicit entitlement.  The law whitelist is
  // law-only; a colliding non-law id must remain locked.  A collection route
  // can disable this item check while it computes its existing first-N policy.
  const isWhitelisted = options.includeExplicitFreeItem !== false && isExplicitlyFreeLibraryItem({
    contentType,
    itemId,
    freeItemsByType: freeItemsMap,
    whitelistedLawSlugs: whitelistedSlugs,
  });
  if (isWhitelisted) {
    return {
      allowed: true,
      isWhitelisted: true,
      freeLimit: -1, // unlimited
      currentTier: "free",
    };
  }

  // 3. Get user tier (guest = free)
  const currentTier: ServerTier = userId ? await getUserTier(userId) : "free";

  // 4. Full library access gets everything (owner ٢٠٥/٢٠٩): a Pro+ tier, an
  // active library grant, or an admin. currentTier stays the real tier.
  if (await fullLibraryAccessForTier(userId, currentTier)) {
    return {
      allowed: true,
      isWhitelisted: false,
      freeLimit: -1,
      currentTier,
    };
  }

  // 5. Check free limit (per-law override or global default)
  const hasOverride = typeof overrides[itemId] === "number";
  const freeLimit = hasOverride ? overrides[itemId] : globalFreeLimit;
  const allowed = articleIndex < freeLimit; // 0-indexed

  return {
    allowed,
    isWhitelisted: false,
    freeLimit,
    freeLimitSource: hasOverride ? "override" : "default",
    currentTier,
    message: allowed ? undefined : `المادة مقفلة — تتطلب اشتراك المكتبة أو باقة Pro فما فوق`,
  };
}

// ─── getLibraryAccessForUser — one-shot library access context ────────────────
// For list/search routes that are NOT per-article-index (where checkLibraryAccess
// is the right call). Returns the user's tier + whether they have full library
// access (a Pro+ tier, an active library grant, or an admin — owner ٢٠٥/٢٠٩) +
// the whitelisted slugs and per-type free items so the route can mark rows
// free/locked. Guests (userId null) get tier "free".

export interface LibraryUserAccess {
  tier: ServerTier;
  hasFullAccess: boolean; // Pro+ tier, an active library grant, or an admin
  whitelistedSlugs: string[]; // library_whitelisted_laws.slugs (law-slug-keyed)
  freeItemsByType: Record<string, string[]>; // library_free_items, keyed by content type
}

export async function getLibraryAccessForUser(
  userId: string | null,
): Promise<LibraryUserAccess> {
  const adminClient = await createServiceClient();

  const tier: ServerTier = userId ? await getUserTier(userId) : "free";
  const hasFullAccess = await fullLibraryAccessForTier(userId, tier);

  const { data: settings } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", ["library_whitelisted_laws", "library_free_items"]);

  const settingsMap: Record<string, unknown> = {};
  settings?.forEach((s: { key: string; value: unknown }) => {
    settingsMap[s.key] = s.value;
  });

  const whitelistedSlugs: string[] =
    (settingsMap.library_whitelisted_laws as { slugs?: string[] })?.slugs ?? [];
  const freeItemsByType =
    (settingsMap.library_free_items as Record<string, string[]>) ?? {};

  return { tier, hasFullAccess, whitelistedSlugs, freeItemsByType };
}

// ─── checkCreditBalance — AI credit check ─────────────────────────────────────

export async function checkCreditBalance(
  userId: string,
  requiredCredits: number = 1,
): Promise<CreditCheckResult> {
  const adminClient = await createServiceClient();

  // Try lawyer_profiles first (has credit_balance column)
  const { data: lawyer } = await adminClient
    .from("lawyer_profiles")
    .select("credit_balance")
    .eq("user_id", userId)
    .maybeSingle();

  let currentBalance = lawyer?.credit_balance ?? 0;

  // If no lawyer profile, calculate from credit_transactions
  if (!lawyer) {
    const { data: lastTx } = await adminClient
      .from("credit_transactions")
      .select("balance_after")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    currentBalance = lastTx?.balance_after ?? 0;
  }

  // Check tier for unlimited credits (enterprise)
  const tier = await getUserTier(userId);
  if (tier === "enterprise" || tier === "corp") {
    return { allowed: true, currentBalance, required: requiredCredits };
  }

  const allowed = currentBalance >= requiredCredits;

  return {
    allowed,
    currentBalance,
    required: requiredCredits,
    message: allowed
      ? undefined
      : `رصيد النقاط غير كافٍ — لديك ${currentBalance} وتحتاج ${requiredCredits}`,
  };
}

// ─── Payment gateway status ─────────────────────────────────────────────────────
// Admin-controlled gate (platform_settings.payments_gateway). Until a real
// payment provider is decided, the admin keeps status = "disabled" and payment
// call-sites block submit. "test" runs the stub adapter; "live" is reserved for
// the future real provider.

export async function getPaymentGatewayStatus(): Promise<PaymentGatewayState> {
  const adminClient = await createServiceClient();
  const { data: setting, error } = await adminClient
    .from("platform_settings")
    .select("value")
    .eq("key", "payments_gateway")
    .maybeSingle();

  if (error) {
    console.error("[payments_gateway] setting read failed; gateway remains disabled", error.message);
  }

  return resolvePaymentGatewayState(error ? null : setting?.value, {
    deploymentEnvironment: process.env.NZAMY_DEPLOYMENT_ENV,
    allowStubPayments: process.env.NZAMY_ALLOW_STUB_PAYMENTS === "true",
  });
}

// ─── Legal library open/close switch ──────────────────────────────────────────
// Admin-controlled global gate (platform_settings.library_status). Lets the whole
// library be taken offline in one click — no redeploy — during a content rebuild
// or if bad data ships. Independent of the per-tier paywall in
// checkLibraryAccess, which continues to apply normally while status is "open".

export type LibraryStatus = "open" | "closed";

export interface LibraryStatusState {
  status: LibraryStatus;
  /** Optional owner-authored notice shown to visitors while closed. */
  message: string | null;
  /** True when the library is closed to the public. */
  closed: boolean;
}

/** Shown when the owner has not written a custom closure message. */
export const LIBRARY_CLOSED_DEFAULT_MESSAGE =
  "المكتبة القانونية مغلقة مؤقتاً — نعمل على تحديث المحتوى وسنعيد فتحها قريباً.";

export async function getLibraryStatus(): Promise<LibraryStatusState> {
  try {
    const adminClient = await createServiceClient();
    const { data: setting, error } = await adminClient
      .from("platform_settings")
      .select("value")
      .eq("key", "library_status")
      .maybeSingle();

    // Fail OPEN, loudly. A settings-lookup outage must not black out the whole
    // library: the tier paywall is a separate check that already degrades toward
    // MORE locking on failure, so an unreadable flag cannot leak paid content.
    if (error) {
      console.error("[library-status] settings lookup failed, failing open:", error.message);
      return { status: "open", message: null, closed: false };
    }

    const value = (setting?.value as { status?: string; message?: string | null }) ?? {};
    // Anything that is not exactly "closed" is treated as open, so a typo can
    // never take the library offline by accident. The reverse (a typo silently
    // leaving it OPEN when the owner meant to close it) is prevented at the
    // write path — see ALLOWED_SETTINGS_VALUES in api/v1/admin/settings.
    const status: LibraryStatus = value.status === "closed" ? "closed" : "open";

    return {
      status,
      message: value.message ?? null,
      closed: status === "closed",
    };
  } catch (err) {
    console.error("[library-status] unexpected error, failing open:", err);
    return { status: "open", message: null, closed: false };
  }
}

// ─── checkTierLimit — Generic tier limit check (cases, contracts) ──────────────

export async function checkTierLimit(
  userId: string,
  limitKey: "cases" | "contracts" | "ai_credits",
  currentCount: number,
): Promise<{ allowed: boolean; limit: number; current: number; message?: string }> {
  const adminClient = await createServiceClient();

  // Get tier limits from platform settings
  const { data: setting } = await adminClient
    .from("platform_settings")
    .select("value")
    .eq("key", "tier_limits")
    .single();

  const tier = await getUserTier(userId);
  const limits = (setting?.value as Record<string, Record<string, number>>) ?? {};
  const tierLimits = limits[tier] ?? { cases: 5, contracts: 3, ai_credits: 20 };
  const limit = tierLimits[limitKey] ?? 0;

  // -1 means unlimited
  if (limit === -1) {
    return { allowed: true, limit: -1, current: currentCount };
  }

  const allowed = currentCount < limit;

  return {
    allowed,
    limit,
    current: currentCount,
    message: allowed
      ? undefined
      : `وصلت للحد الأقصى (${limit}) — قم بترقية اشتراكك لفتح المزيد`,
  };
}
