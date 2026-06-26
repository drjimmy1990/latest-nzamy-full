/**
 * access-control.ts — Server-side access control
 * ─────────────────────────────────────────────────────────
 * Provides server-side enforcement of subscription tier
 * gating, library paywall, and AI credit checks.
 *
 * Usage in API routes:
 *   import { requireAdmin, checkLibraryAccess, checkCreditBalance } from "@/lib/access-control";
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";

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

const TIER_RANK: Record<ServerTier, number> = {
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

  const { data: sub } = await adminClient
    .from("subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (sub?.tier as ServerTier) ?? "free";
}

// ─── requireAdmin — Auth + admin check for API routes ─────────────────────────

export async function requireAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
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

// ─── checkLibraryAccess — Library-specific paywall ────────────────────────────

export async function checkLibraryAccess(
  userId: string | null,
  lawSlug: string,
  articleIndex: number,
): Promise<LibraryAccessResult> {
  const adminClient = await createServiceClient();

  // 1. Fetch platform settings
  const { data: settings } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", ["library_whitelisted_laws", "library_free_article_limit", "library_free_law_overrides"]);

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

  // 2. Check if law is whitelisted (always free)
  const isWhitelisted = whitelistedSlugs.includes(lawSlug);
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
  const tierRank = TIER_RANK[currentTier] ?? 0;

  // 4. Pro+ gets full access
  if (tierRank >= TIER_RANK.pro) {
    return {
      allowed: true,
      isWhitelisted: false,
      freeLimit: -1,
      currentTier,
    };
  }

  // 5. Check free limit (per-law override or global default)
  const freeLimit = overrides[lawSlug] ?? globalFreeLimit;
  const allowed = articleIndex < freeLimit; // 0-indexed

  return {
    allowed,
    isWhitelisted: false,
    freeLimit,
    currentTier,
    message: allowed ? undefined : `المادة مقفلة — يتطلب اشتراك Pro أو أعلى`,
  };
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
