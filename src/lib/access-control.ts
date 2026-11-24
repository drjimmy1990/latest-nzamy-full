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
} from "@/lib/paymentGatewayPolicy";
import {
  isBillingCompanyComplete,
  resolveMoyasarConfig,
  type MoyasarConfigResult,
  type MoyasarEnv,
} from "@/lib/payments/moyasarConfig";
import { buildGatewayDiagnostic, type GatewayDiagnostic } from "@/lib/payments/gatewayDiagnostic";
import { isAuthUnavailable } from "@/lib/auth/apiAuth";
import { AUTH_UNAVAILABLE_AR } from "@/lib/auth/resolveAuthOutcome";
import { effectiveTier, type ActivePlanRow } from "@/lib/entitlementGrantRules";
import { fullLibraryAccess } from "@/lib/libraryAccessDecision";
import { activeLibraryGrantPlanRefs, hasActiveFounderInviteTrial } from "@/lib/libraryAccessServer";
import { FOUNDER_INVITE_TRIAL_PLAN_REF, libraryPointsGateDecision, libraryPointsLock, type LibraryPointsLock } from "@/lib/library/pointsGate";
import { readLibraryMinPoints, readLibraryPointsBalance } from "@/lib/library/pointsGateServer";
import type { StaffAction, StaffRole } from "@/lib/auth/staffRoles";
import { isMissingStaffTable, staffDecision } from "@/lib/auth/staffDecision";
import { currentAccessToken, recordStaffLogin, staffMfaGate } from "@/lib/auth/staffMfaServer";

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
  /** A machine code with some refusals (owner item 18: mfa_required, mfa_enrollment_required). */
  code?: string;
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

  // Owner item 18 (batch l7): an enrolled admin needs an aal2 session, and
  // with ADMIN_MFA_ENFORCE=required an unenrolled one is refused until he
  // enrols (src/lib/auth/staffMfa.ts). requireStaff inherits this.
  const accessToken = await currentAccessToken(supabase);
  const mfa = await staffMfaGate(supabase, user, accessToken);
  if (!mfa.ok) {
    return { isAdmin: false, userId: user.id, error: mfa.error, status: 403, code: mfa.code };
  }
  // The new-login alert's backstop (a sign-in that never called
  // /api/v1/auth/session, e.g. Google): once per session per process.
  void recordStaffLogin({ user, accessToken, trigger: "admin_api" });

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
// no row is an auditor (fail-closed): a refusal is the 403 STAFF_ONLY_AR. An
// admin whose row could not be read for any other reason is an auditor too,
// but a refusal is then a 503 STAFF_CHECK_UNAVAILABLE_AR, so an outage is not
// read as a permission problem (logged every time). Before 20261019_30 runs
// (the table is missing: 42P01 / PGRST205) every admin keeps today's access,
// logged once per process. That is no wider than production today, and a
// wrong run order cannot 403 every admin action. The role holds only while
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
      response: NextResponse.json(
        adminCheck.code ? { error: adminCheck.error, code: adminCheck.code } : { error: adminCheck.error },
        { status: adminCheck.status ?? 403 },
      ),
    };
  }

  const userId = adminCheck.userId;
  const { role, tableMissing, readFailed } = await readStaffRole(userId);
  const decision = staffDecision({ isAdmin: true, role, tableMissing, readFailed }, action);
  if (!decision.allowed) {
    // 403 STAFF_ONLY_AR when the role may not; 503 when it could not be read.
    return { ok: false, response: NextResponse.json({ error: decision.error }, { status: decision.status }) };
  }
  return { ok: true, userId, role: decision.role };
}

/** The admin's platform_staff.staff_role (null: no row). Never throws. */
async function readStaffRole(
  userId: string,
): Promise<{ role: unknown; tableMissing: boolean; readFailed: boolean }> {
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
        return { role: null, tableMissing: true, readFailed: false };
      }
      console.error(
        "[access-control] requireStaff: platform_staff read failed; treating the admin as auditor (503 on a refusal):",
        error.code,
        error.message,
      );
      return { role: null, tableMissing: false, readFailed: true };
    }
    return {
      role: (data as { staff_role?: unknown } | null)?.staff_role ?? null,
      tableMissing: false,
      readFailed: false,
    };
  } catch (err) {
    console.error(
      "[access-control] requireStaff: platform_staff read threw; treating the admin as auditor (503 on a refusal):",
      err instanceof Error ? err.message : err,
    );
    return { role: null, tableMissing: false, readFailed: true };
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

// ─── Full library access — a library grant, or an admin ──────────────────────
// Owner answers ٢٠٥ / ٢٠٩ (2026-10-18): the library subscription
// (public.library_access_grants) opens the whole library on its own, and so
// does a platform admin. Owner ٨٩ / ٩٣ (20 Nov 2026, batch l12): NOTHING
// else — no subscription tier (Pro, the consultant, the firm plans) opens it. The rule is fullLibraryAccess() in
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
 * True when the user has the full library: an active library grant or an
 * admin (owner ٨٩ / ٩٣, l12: no tier) — and, for a grant holder the 50-point gate applies to,
 * a balance at the minimum (libraryFullAccessState). A guest (null) never
 * does. The routes that shape official metadata on it call this; the
 * per-article paywall is checkLibraryAccess() below, which applies the same
 * rule.
 */
export async function hasFullLibraryAccess(userId: string | null, memo?: LibraryAccessMemo): Promise<boolean> {
  return (await memoFullState(userId, memo)).hasFullAccess;
}

// ─── O26 (batch l11): one set of access reads per request ─────────────────────
// A document route asks checkLibraryAccess() and hasFullLibraryAccess() (or
// getLibraryAccessForUser()) side by side, and each read the tier, the admin
// role, the library grants and — for a gated subscriber — the 50-point
// setting and the balance on its own: the same reads twice per request. A
// route now builds ONE memo per request and passes it to each call. The memo
// holds the in-flight PROMISES (the calls run in Promise.all, so a result
// cache would come too late), lives only as long as the request (no
// module-level TTL: an admin's change still applies on the next request,
// G39), and is ignored for another user id. Without a memo every function
// behaves exactly as before.

/** Per-request memo of the library access reads (O26). Build one per request. */
export interface LibraryAccessMemo {
  readonly userId: string | null;
  tier?: Promise<ServerTier>;
  full?: Promise<LibraryFullAccessState>;
}

/** A fresh memo for one request of `userId` (null = a guest). */
export function libraryAccessMemo(userId: string | null): LibraryAccessMemo {
  return { userId };
}

function usableMemo(memo: LibraryAccessMemo | undefined, userId: string | null): memo is LibraryAccessMemo {
  return !!memo && memo.userId === userId;
}

/** The viewer's tier (guest = free), once per memo. */
function memoTier(userId: string | null, memo?: LibraryAccessMemo): Promise<ServerTier> {
  const read = (): Promise<ServerTier> => (userId ? getUserTier(userId) : Promise.resolve("free" as ServerTier));
  if (!usableMemo(memo, userId)) return read();
  memo.tier ??= read();
  return memo.tier;
}

/** libraryFullAccessState(), once per memo (reusing the memo's tier). */
function memoFullState(userId: string | null, memo?: LibraryAccessMemo): Promise<LibraryFullAccessState> {
  if (!usableMemo(memo, userId)) return libraryFullAccessState(userId);
  memo.full ??= userId
    ? memoTier(userId, memo).then((tier) => libraryFullAccessState(userId, tier))
    : Promise.resolve(NO_FULL_LIBRARY);
  return memo.full;
}

/** The full-library answer with the 50-point lock that closed it, if any. */
export interface LibraryFullAccessState {
  hasFullAccess: boolean;
  /** Set only when a gated subscriber's balance is below library_min_points_to_browse. */
  pointsLock: LibraryPointsLock | null;
  /**
   * 06 ج6 (l12): set when the subscriber IS gated and still open — his
   * balance and the minimum, so the status route can warn him before the
   * question that would lock him. Absent for an admin, a guest, a locked or
   * an ungated account, or when the balance could not be read.
   */
  pointsGate?: { balance: number; minPoints: number } | null;
}

const NO_FULL_LIBRARY: LibraryFullAccessState = Object.freeze({ hasFullAccess: false, pointsLock: null }) as LibraryFullAccessState;
const FULL_LIBRARY: LibraryFullAccessState = Object.freeze({ hasFullAccess: true, pointsLock: null }) as LibraryFullAccessState;

/**
 * Owner ٢٠٥ / ٢٠٩ (who has the full library) + register 14 item 48 (batch
 * l9, the 50-point gate, src/lib/library/pointsGate.ts) + owner ٨٩ / ٩٣
 * (batch l12): an active library grant — any of them, the paid plans, the
 * founder, and the older trial / invitation / admin grants — opens the full
 * text only while the balance (founder library credits included) is at
 * least library_min_points_to_browse; only an admin is not gated, and no
 * subscription tier opens the library. Below the minimum the subscriber
 * reads what a visitor reads and `pointsLock` says why. `knownTier` is
 * accepted for the callers that pass it and no longer decides anything.
 */
export async function libraryFullAccessState(userId: string | null, knownTier?: ServerTier): Promise<LibraryFullAccessState> {
  void knownTier;
  if (!userId) return NO_FULL_LIBRARY;
  const [isAdmin, planRefs] = await Promise.all([
    isPlatformAdmin(userId),
    activeLibraryGrantPlanRefs(userId),
  ]);
  const grants = planRefs ?? [];
  if (!fullLibraryAccess({ isAdmin, hasLibraryGrant: grants.length > 0 })) return NO_FULL_LIBRARY;
  // Is the balance asked at all? (minPoints 1 stands for "a gate exists".)
  // Owner ٢٠١ (أ), batch l14: a running founder-invite library trial is
  // outside the gate — read only when a lib-trial grant is active at all.
  const founderInviteTrial = !isAdmin && grants.includes(FOUNDER_INVITE_TRIAL_PLAN_REF)
    ? await hasActiveFounderInviteTrial(userId)
    : false;
  if (!libraryPointsGateDecision({ isAdmin, planRefs: grants, balance: null, minPoints: 1, founderInviteTrial }).gated) {
    return FULL_LIBRARY;
  }
  const [minPoints, balance] = await Promise.all([readLibraryMinPoints(), readLibraryPointsBalance(userId)]);
  const decision = libraryPointsGateDecision({ isAdmin, planRefs: grants, balance, minPoints, founderInviteTrial });
  if (decision.locked && balance !== null) {
    return { hasFullAccess: false, pointsLock: libraryPointsLock(balance, minPoints) };
  }
  if (decision.gated && balance !== null) {
    return { hasFullAccess: true, pointsLock: null, pointsGate: { balance, minPoints } };
  }
  return FULL_LIBRARY;
}

/**
 * The same rule for a caller that has already read the tier: a guest reads
 * nothing more. (The tier no longer opens the library — owner ٨٩, l12.)
 */
async function fullLibraryAccessForTier(userId: string | null, tier: ServerTier, memo?: LibraryAccessMemo): Promise<boolean> {
  if (usableMemo(memo, userId)) return (await memoFullState(userId, memo)).hasFullAccess;
  return (await libraryFullAccessState(userId, tier)).hasFullAccess;
}

// ─── checkLibraryAccess — Library-specific paywall ────────────────────────────

export async function checkLibraryAccess(
  userId: string | null,
  itemId: string,
  articleIndex: number,
  contentType: LibraryFreeItemType = "laws",
  options: { includeExplicitFreeItem?: boolean; memo?: LibraryAccessMemo } = {},
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
  const currentTier: ServerTier = await memoTier(userId, options.memo);

  // 4. Full library access gets everything (owner ٢٠٥/٢٠٩, ٨٩/٩٣ l12): an
  // active library grant, or an admin — never a tier. currentTier stays the real tier.
  if (await fullLibraryAccessForTier(userId, currentTier, options.memo)) {
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
    message: allowed ? undefined : `المادة مقفلة — تتطلب اشتراك المكتبة القانونية`,
  };
}

// ─── getLibraryAccessForUser — one-shot library access context ────────────────
// For list/search routes that are NOT per-article-index (where checkLibraryAccess
// is the right call). Returns the user's tier + whether they have full library
// access (an active library grant or an admin — owner ٢٠٥/٢٠٩, ٨٩/٩٣ l12) +
// the whitelisted slugs and per-type free items so the route can mark rows
// free/locked. Guests (userId null) get tier "free".

export interface LibraryUserAccess {
  tier: ServerTier;
  hasFullAccess: boolean; // an active library grant, or an admin (never a tier: owner ٨٩, l12)
  whitelistedSlugs: string[]; // library_whitelisted_laws.slugs (law-slug-keyed)
  freeItemsByType: Record<string, string[]>; // library_free_items, keyed by content type
}

export async function getLibraryAccessForUser(
  userId: string | null,
  memo?: LibraryAccessMemo,
): Promise<LibraryUserAccess> {
  const adminClient = await createServiceClient();

  const tier: ServerTier = await memoTier(userId, memo);
  const hasFullAccess = await fullLibraryAccessForTier(userId, tier, memo);

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
  const points = await adminClient.rpc("points_balance", { p_user: userId });
  if (!points.error && Number.isSafeInteger(points.data)) {
    const currentBalance = points.data as number;
    const tier = await getUserTier(userId);
    return { allowed: tier === "enterprise" || tier === "corp" || currentBalance >= requiredCredits, currentBalance, required: requiredCredits };
  }
  // Only an unapplied migration falls back. A database outage must never
  // revive the old, non-expiring balance after lots became authoritative.
  if (!points.error || !["42P01","42703","42883","PGRST202","PGRST204","PGRST205"].includes(points.error.code)) {
    return { allowed: false, currentBalance: 0, required: requiredCredits };
  }
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
// Admin-controlled gate (platform_settings.payments_gateway), resolved through
// src/lib/paymentGatewayPolicy.ts:
//   - {status:"test", provider:"stub"} — local/staging with
//     NZAMY_ALLOW_STUB_PAYMENTS=true only (unchanged);
//   - {status:"test"|"live", provider:"moyasar"} — the server's Moyasar keys
//     must belong to that mode; live also needs a complete billing_company.
// Anything else, a read error or a missing row is "disabled".

/** Moyasar keys from the server environment. Never log or return them. */
function moyasarEnv(): MoyasarEnv {
  return {
    secretKey: process.env.MOYASAR_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY,
    webhookSecret: process.env.MOYASAR_WEBHOOK_SECRET,
  };
}

/**
 * payments_gateway and billing_company in one read. A read error leaves both
 * null (disabled / incomplete); a missing billing_company row (its migration
 * not applied yet) reads as incomplete, so live stays off and test still works.
 */
async function readPaymentSettings(): Promise<{ gateway: unknown; billingCompanyComplete: boolean }> {
  const adminClient = await createServiceClient();
  const { data, error } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", ["payments_gateway", "billing_company"]);

  if (error) {
    console.error("[payments_gateway] setting read failed; gateway remains disabled", error.message);
    return { gateway: null, billingCompanyComplete: false };
  }
  const byKey = new Map((data ?? []).map((row) => [row.key as string, row.value as unknown]));
  return {
    gateway: byKey.get("payments_gateway") ?? null,
    billingCompanyComplete: isBillingCompanyComplete(byKey.get("billing_company")),
  };
}

/** Public-safe: {status, provider, disabled} only — no key ever. */
export async function getPaymentGatewayStatus(): Promise<PaymentGatewayState> {
  const { gateway, billingCompanyComplete } = await readPaymentSettings();
  return resolvePaymentGatewayState(gateway, {
    deploymentEnvironment: process.env.NZAMY_DEPLOYMENT_ENV,
    allowStubPayments: process.env.NZAMY_ALLOW_STUB_PAYMENTS === "true",
    moyasar: moyasarEnv(),
    billingCompanyComplete,
  });
}

/**
 * Server-only: the Moyasar config (keys included) for createMoyasarClient, or
 * {enabled:false, reason}. The reason is for server logs and never names a
 * key; users see MOYASAR_DISABLED_MESSAGE_AR.
 */
export async function getMoyasarConfig(): Promise<MoyasarConfigResult> {
  const { gateway, billingCompanyComplete } = await readPaymentSettings();
  return resolveMoyasarConfig(gateway, moyasarEnv(), billingCompanyComplete);
}

/**
 * Server-only, for the admin settings page: the saved gateway, whether Moyasar
 * is really on and why not (Arabic), and each key's mode label — never a key.
 * Same read and env as getMoyasarConfig, but a read error is null (the route
 * answers 503) instead of a "disabled" that would look like a real verdict.
 */
export async function getPaymentGatewayDiagnostic(): Promise<GatewayDiagnostic | null> {
  const adminClient = await createServiceClient();
  const { data, error } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", ["payments_gateway", "billing_company"]);
  if (error) {
    console.error("[payments_gateway] diagnostic read failed", error.message);
    return null;
  }
  const byKey = new Map((data ?? []).map((row) => [row.key as string, row.value as unknown]));
  return buildGatewayDiagnostic(
    byKey.get("payments_gateway") ?? null,
    moyasarEnv(),
    isBillingCompanyComplete(byKey.get("billing_company")),
  );
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
