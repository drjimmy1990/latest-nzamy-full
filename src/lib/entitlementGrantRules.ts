/**
 * entitlementGrantRules.ts — the pure "may this plan grant replace what the
 * user already holds?" decision, split out of src/lib/entitlements.ts.
 *
 * Why a separate file: grantEntitlement() value-imports
 * "@/lib/supabase/server" (and through it next/headers), so entitlements.ts
 * cannot be loaded by `node --test` — the alias does not resolve outside the
 * bundler (re-verified 2026-09-22: ERR_MODULE_NOT_FOUND "Cannot find package
 * '@/lib'"). This module performs no I/O and imports nothing at runtime, so
 * the rule it holds is unit-testable, the same split src/lib/deadlineReminders.ts
 * uses for ./services/deadlineEngine.ts.
 *
 * Why the ranking is INJECTED (`ranks`) instead of imported HERE:
 * src/lib/access-control.ts now `export`s its TIER_RANK table (2026-09-22), but
 * that module value-imports "@/lib/supabase/server" as well. entitlements.ts may
 * import it — and does — because entitlements.ts only ever runs through the
 * bundler and is already unloadable by `node --test` for its own reasons. THIS
 * module is the one that must stay loadable, so the same import here would drag
 * the unresolvable alias back in and take its whole test file down with it. So
 * entitlements.ts imports TIER_RANK and hands it over as `ranks`. The
 * hand-maintained mirror of that table that used to live here, and the
 * source-parsing drift test that policed it, are both gone: there is exactly one
 * tier ranking on the server again.
 *
 * The rule (review 2026-09-21 A3/C01, tightened 2026-09-22):
 *   • a HIGHER-ranked active subscription is NEVER replaced, whatever its
 *     expiry. Buying days by cutting the tier is still a downgrade — until
 *     2026-09-22 a "max" row expiring tomorrow was destroyed by a 30-day "pro"
 *     grant.
 *   • at the SAME rank the longer window wins: an extension is applied, a
 *     re-redeemed invite that would shorten the plan is skipped.
 *   • a LOWER-ranked active row is replaced — that is an upgrade.
 * grantEntitlement used to cancel every active subscription before inserting
 * the new one, so a 14-day invite trial silently destroyed a live paid plan.
 *
 * The one caller that must move a user down on purpose — POST
 * /api/v1/admin/entitlements/grant, where "grant free" IS the revoke button —
 * passes `replaceActive` in src/lib/entitlements.ts and never reaches this
 * decision. Everyone else handles the `alreadyEntitled` answer instead,
 * including the admin route that decides entitlement REQUESTS: nobody requests
 * a downgrade, so there the override would only let an untouched "pro" selector
 * cancel a max subscription.
 */

import type { ServerTier } from "@/lib/access-control";

/**
 * The tier ranking this decision reads — src/lib/access-control.ts's exported
 * TIER_RANK, passed in by src/lib/entitlements.ts. `Partial` on purpose: the
 * lookups below take a raw `subscriptions.tier` string out of the database,
 * which may be a value no longer in the table.
 */
export type TierRankTable = Readonly<Partial<Record<ServerTier, number>>>;

/** The columns of an active `subscriptions` row this decision reads. */
export interface ActivePlanRow {
  id?: string | null;
  tier?: string | null;
  current_period_end?: string | null;
  [key: string]: unknown;
}

/** Rank of a tier string; -1 for null/unknown, so it never outranks a real tier. */
export function tierRank(
  tier: string | null | undefined,
  ranks: TierRankTable,
): number {
  if (!tier) return -1;
  const rank = ranks[tier as ServerTier];
  return typeof rank === "number" ? rank : -1;
}

/**
 * Milliseconds at which an active row stops covering the user.
 * A NULL `current_period_end` on an ACTIVE row is open-ended coverage, so it
 * is treated as +Infinity (protect it) rather than as 0 (silently cancel it) —
 * the asymmetry is deliberate: the wrong side of it destroys a paid plan.
 * An unparsable date is treated the same way.
 */
export function planEndsAtMs(row: ActivePlanRow): number {
  const raw = row.current_period_end;
  if (!raw) return Number.POSITIVE_INFINITY;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * The single row that dominates a set of active subscriptions: highest tier
 * first, then the one that runs longest. (More than one active row is a data
 * anomaly, but picking "whatever came back first" would make the guard depend
 * on PostgREST's row order.)
 */
export function dominantActivePlan<T extends ActivePlanRow>(
  rows: readonly T[] | null | undefined,
  ranks: TierRankTable,
): T | null {
  if (!rows || rows.length === 0) return null;
  let best: T | null = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const rank = tierRank(row.tier, ranks);
    const bestRank = tierRank(best.tier, ranks);
    if (rank > bestRank) best = row;
    else if (rank === bestRank && planEndsAtMs(row) > planEndsAtMs(best)) best = row;
  }
  return best;
}

export interface PlanGrantDecisionInput<T extends ActivePlanRow> {
  /** Every row with status='active' for the target user. */
  activeRows: readonly T[] | null | undefined;
  /** The tier about to be granted. */
  tier: ServerTier;
  /** When the new grant would end. */
  newPeriodEnd: Date;
  /** src/lib/access-control.ts's TIER_RANK, injected — see the header. */
  ranks: TierRankTable;
}

export interface PlanGrantDecision<T extends ActivePlanRow> {
  /** true → return `existing` untouched; do NOT cancel and do NOT insert. */
  keepExisting: boolean;
  /** The dominating active row, or null when the user holds none. */
  existing: T | null;
}

/**
 * Decide whether the caller's plan grant should be applied or skipped.
 * A caller that legitimately replaces a subscription (an admin deliberately
 * moving a user down, or a paid flow) passes its own override and never calls
 * this — see `replaceActive` in src/lib/entitlements.ts.
 *
 * The question is "would this grant destroy ANY coverage better than itself",
 * not "does the single best row survive the test": the cancel in
 * entitlements.ts is `.eq("status","active")` with no other filter, so it
 * takes EVERY active row with it. A user holding both max-until-tomorrow and
 * pro-until-next-year has BOTH protected from a 14-day pro trial — the max row
 * because it outranks the grant, the pro row because it outlives it.
 *
 * The cost of the "never replace a higher rank" half is real and deliberate: a
 * corp subscription expiring tomorrow now blocks a year-long pro grant, and
 * the user keeps the shorter, better plan. Extending such a user is an admin
 * decision, and POST /api/v1/admin/entitlements/grant takes it with
 * `replaceActive: true`.
 */
export function planGrantDecision<T extends ActivePlanRow>(
  input: PlanGrantDecisionInput<T>,
): PlanGrantDecision<T> {
  const rows = input.activeRows ?? [];
  const newEndMs = input.newPeriodEnd.getTime();
  const grantedRank = tierRank(input.tier, input.ranks);

  const qualifying = rows.filter((row) => {
    const rank = tierRank(row.tier, input.ranks);
    if (rank > grantedRank) return true; // a better tier is never traded for days
    if (rank < grantedRank) return false; // an upgrade: replace it
    return planEndsAtMs(row) > newEndMs; // same tier: the longer window wins
  });

  // Report the best of the rows that would have been destroyed; when nothing
  // qualifies, still report what the user holds (callers log it).
  const existing =
    dominantActivePlan(qualifying, input.ranks) ?? dominantActivePlan(rows, input.ranks);

  return { keepExisting: qualifying.length > 0, existing };
}
