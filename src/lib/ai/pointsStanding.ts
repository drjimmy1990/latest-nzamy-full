/**
 * pointsStanding.ts — whether a run of a tool would be refused for lack of
 * points, for the «رصيدك من النقاط لا يكفي» banner (owner package LIVE-06).
 *
 * The banner used to read `user.credits` (user_metadata.credit_balance), a
 * field nothing writes, so it was always 0 and the banner showed to everyone,
 * admins included. This decides it the way the server charges: ai_start_run
 * (migration 20261027_10) debits only when
 *   points_enforcement is on  AND  the caller is not exempt  AND  price > 0,
 * and runCore passes `p_exempt: isAdmin`. So an admin, or anybody while
 * enforcement is off, is never short. Every failed read means "not short":
 * a wrong banner is the defect this replaces.
 *
 * Pure apart from the two clients it is handed, so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiToolPointRange, PRICED_AI_TOOL_IDS, type PricedAiToolId } from "./toolPointsDisplay.ts";
import { FOUNDER_DRAFTER_TOOL, FOUNDER_OUTPUT_TOOLS, type FounderOutputTool } from "../membership/founderPlan.ts";

export function isPricedAiToolId(v: unknown): v is PricedAiToolId {
  return typeof v === "string" && (PRICED_AI_TOOL_IDS as readonly string[]).includes(v);
}

/**
 * The tools this module may answer for: priced, and with no founder-credit
 * path. On legal-drafter and the four founder output tools a founder credit
 * pays instead of points (founderPlan.creditKindForRun, runCore), and the
 * rule below knows nothing of credits: it would call a founder who holds
 * credits "short". Restricting the list is simpler and safer than teaching it
 * credits; a credit tool that wants the banner must add the credit read first.
 */
export type PointsStandingTool = Exclude<PricedAiToolId, typeof FOUNDER_DRAFTER_TOOL | FounderOutputTool | PriceHiddenTool>;

/**
 * Owner q296: the price of these is not shown until they are live, and a "short"
 * reply here carries the price to anyone who asks. Their screens never read it.
 */
const PRICE_HIDDEN_TOOLS = ["contract-review"] as const;
type PriceHiddenTool = (typeof PRICE_HIDDEN_TOOLS)[number];

export function isPointsStandingTool(v: unknown): v is PointsStandingTool {
  return (
    isPricedAiToolId(v) &&
    v !== FOUNDER_DRAFTER_TOOL &&
    !(FOUNDER_OUTPUT_TOOLS as readonly string[]).includes(v) &&
    !(PRICE_HIDDEN_TOOLS as readonly string[]).includes(v)
  );
}

export interface PointsFacts {
  /** platform_settings.points_enforcement, read as ai_start_run reads it. */
  enforced: boolean;
  /** An admin: runCore's only exempt caller. */
  exempt: boolean;
  /** points_balance(user); null when it could not be read. */
  balance: number | null;
  /** The cheapest run of the tool, from the registry that charges it. */
  price: number;
}

/** The SQL's charge rule, then the balance against the price. */
export function pointsShort(f: PointsFacts): boolean {
  if (!f.enforced || f.exempt || !(f.price > 0)) return false;
  if (f.balance === null || !Number.isSafeInteger(f.balance)) return false;
  return f.balance < f.price;
}

export type PointsStanding = { short: false } | { short: true; balance: number; price: number };

const NOT_SHORT: PointsStanding = { short: false };

/**
 * The signed-in user's standing for one tool.
 * `rls` is the user's client (own profile row, points_balance for auth.uid());
 * `admin` the service client, for the platform setting only.
 */
export async function pointsStandingWith(
  rls: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  tool: PointsStandingTool,
): Promise<PointsStanding> {
  try {
    const profile = await rls.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    if (profile.error) return NOT_SHORT;
    const exempt = (profile.data as { user_type?: unknown } | null)?.user_type === "admin";
    if (exempt) return NOT_SHORT;

    const setting = await admin.from("platform_settings").select("value").eq("key", "points_enforcement").maybeSingle();
    if (setting.error) return NOT_SHORT;
    // `value = 'true'::jsonb` in the SQL: only a JSON true is on.
    const enforced = (setting.data as { value?: unknown } | null)?.value === true;
    if (!enforced) return NOT_SHORT;

    const balance = await rls.rpc("points_balance", { p_user: userId });
    if (balance.error || !Number.isSafeInteger(balance.data)) return NOT_SHORT;

    const price = aiToolPointRange(tool)[0];
    const facts: PointsFacts = { enforced, exempt, balance: balance.data as number, price };
    return pointsShort(facts) ? { short: true, balance: facts.balance as number, price } : NOT_SHORT;
  } catch {
    return NOT_SHORT;
  }
}
