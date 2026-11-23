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
// l12 simpledraft: simple-contract's price is an admin setting, which this
// module (registry prices only) does not read; its 402 opens the top-up instead.
const PRICE_HIDDEN_TOOLS = ["contract-review", "contract-negotiator", "simple-contract"] as const;
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
  /** The points this tool may spend (points_available_for_tool, l13); null when it could not be read. */
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
 * Owner ١٦٥ (batch l13): the tools whose screen shows «المتاح لهذه العملية»
 * beside the price — every priced tool but the two whose price is not shown
 * before they are live (q296). The answer carries no price, so a founder-credit
 * tool or simple-contract (admin-set price) may ask too.
 */
export type PointsAvailableTool = Exclude<PricedAiToolId, "contract-review" | "contract-negotiator">;

export function isPointsAvailableTool(v: unknown): v is PointsAvailableTool {
  return isPricedAiToolId(v) && v !== "contract-review" && v !== "contract-negotiator";
}

/**
 * What one tool can spend for the signed-in user now.
 *   charged   — false when this run charges no points at all (an admin, or
 *               points_enforcement off): ai_start_run's own rule;
 *   available — the points the tool may spend: points_available_for_tool
 *               (20261203_10), which applies debit_points' wallet rule (a
 *               library-assistant lot only for the library assistant). Null
 *               when it could not be read, or when nothing is charged.
 */
export interface ToolPoints {
  charged: boolean;
  available: number | null;
}

/** PostgREST / Postgres "no such function": the migration has not run yet. */
function isMissingFunction(code: unknown): boolean {
  return code === "PGRST202" || code === "42883";
}

const isPointCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/**
 * points_available_for_tool for the user's own lots (the user's client). Before
 * 20261203_10 runs it falls back to points_balance (the whole balance). Null
 * on any other failure: the screen then shows nothing rather than a guess.
 */
export async function pointsAvailableFor(rls: SupabaseClient, userId: string, tool: string): Promise<number | null> {
  const read = await rls.rpc("points_available_for_tool", { p_user: userId, p_tool: tool });
  if (!read.error) return isPointCount(read.data) ? read.data : null;
  if (!isMissingFunction(read.error.code)) return null;
  const balance = await rls.rpc("points_balance", { p_user: userId });
  return !balance.error && isPointCount(balance.data) ? balance.data : null;
}

/**
 * The signed-in user's points for one tool, or null when the profile or the
 * setting could not be read.
 * `rls` is the user's client (own profile row, own points);
 * `admin` the service client, for the platform setting only.
 */
export async function toolPointsWith(
  rls: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  tool: PointsAvailableTool,
): Promise<ToolPoints | null> {
  try {
    const profile = await rls.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    if (profile.error) return null;
    const exempt = (profile.data as { user_type?: unknown } | null)?.user_type === "admin";
    if (exempt) return { charged: false, available: null };

    const setting = await admin.from("platform_settings").select("value").eq("key", "points_enforcement").maybeSingle();
    if (setting.error) return null;
    // `value = 'true'::jsonb` in the SQL: only a JSON true is on.
    const enforced = (setting.data as { value?: unknown } | null)?.value === true;
    if (!enforced) return { charged: false, available: null };

    return { charged: true, available: await pointsAvailableFor(rls, userId, tool) };
  } catch {
    return null;
  }
}

/** The SQL's charge rule against the points THIS tool may spend (not the whole balance). */
export function standingFrom(points: ToolPoints | null, tool: PointsStandingTool): PointsStanding {
  if (!points) return NOT_SHORT;
  const price = aiToolPointRange(tool)[0];
  const facts: PointsFacts = { enforced: points.charged, exempt: false, balance: points.available, price };
  return pointsShort(facts) ? { short: true, balance: facts.balance as number, price } : NOT_SHORT;
}

/**
 * The signed-in user's standing for one tool. Since batch l13 the "balance" is
 * what this tool may spend (a general tool cannot spend library-assistant
 * points), so the banner no longer says "enough" to a user the start refuses.
 * `rls` is the user's client; `admin` the service client (the setting only).
 */
export async function pointsStandingWith(
  rls: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  tool: PointsStandingTool,
): Promise<PointsStanding> {
  return standingFrom(await toolPointsWith(rls, admin, userId, tool), tool);
}
