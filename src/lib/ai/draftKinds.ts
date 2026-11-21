/**
 * draftKinds.ts — L14 الصائغ القانوني (plan §5 wave 5): the pleadings the AI
 * writes and what each costs. One work is one subject, one stage and one
 * output, so the price keys on the kind, never on the main type alone
 * (owner decision ٩, 17 Nov 2026): 500 for a claim and for the memos of the
 * first instance (reply, rejoinder, supplementary, closing), 800 for an
 * appeal, 1,500 for cassation and a petition for review. Founder members pay
 * none of it for their six included works (credits, not points).
 *
 * The wizard's main type and sub-type (src/components/draft/draftConstants.ts)
 * map onto a kind here; the specialist modes (arbitration, notary, report,
 * minutes) have none and stay a team order.
 *
 * Batch l12 (owner N6, RAW[5][60][78], 20 Nov 2026): the prices are an ADMIN
 * SETTING, platform_settings 'ai_draft_prices' = {"<kind>": points}, seeded
 * by 20261202_10 with 200 for a claim (was 500), 500 for reply /
 * rejoinder / supplementary / closing, 800 for an appeal, 1,500 for
 * cassation and a petition. The `price` below is the code default, used
 * when the row is missing, malformed or unreadable (never 0); runCore reads
 * the setting for every legal-drafter run (readDraftPrices) and the wizard
 * shows the server's prices (GET /api/v1/pricing/draft-prices), sending the
 * one it showed as expectedPrice.
 *
 * Pure: type-only imports, so `node --test` runs it and tools.ts may use it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DRAFT_KINDS = {
  claim: { label: "لائحة دعوى", price: 200, challenge: false },
  reply: { label: "مذكرة رد", price: 500, challenge: false },
  rejoinder: { label: "مذكرة تعقيب", price: 500, challenge: false },
  supplementary: { label: "مذكرة إلحاقية", price: 500, challenge: false },
  closing: { label: "مذكرة ختامية", price: 500, challenge: false },
  appeal: { label: "لائحة اعتراض بالاستئناف", price: 800, challenge: true },
  cassation: { label: "مذكرة اعتراض بطلب النقض", price: 1500, challenge: true },
  petition: { label: "التماس إعادة النظر", price: 1500, challenge: true },
} as const;

export type DraftKindId = keyof typeof DRAFT_KINDS;
export const DRAFT_KIND_IDS = Object.keys(DRAFT_KINDS) as DraftKindId[];

export function isDraftKind(v: unknown): v is DraftKindId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(DRAFT_KINDS, v);
}

export type DraftPrices = Readonly<Record<DraftKindId, number>>;

/** platform_settings key of the admin-edited prices (20261202_10). */
export const DRAFT_PRICES_KEY = "ai_draft_prices";
/** The highest price an admin may set on one kind (points). */
export const MAX_DRAFT_PRICE = 100_000;

/** The code defaults (what 20261202_10 seeds). */
export const DEFAULT_DRAFT_PRICES: DraftPrices = Object.freeze(
  Object.fromEntries(DRAFT_KIND_IDS.map((k) => [k, DRAFT_KINDS[k].price])) as Record<DraftKindId, number>,
);

/** null = acceptable, else the Arabic reason (PATCH /api/v1/admin/settings). A kind left out keeps its default. */
export function draftPricesIssue(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `قيمة ${DRAFT_PRICES_KEY} يجب أن تكون كائناً من الشكل {"claim": عدد النقاط}`;
  }
  for (const [k, n] of Object.entries(value)) {
    if (!isDraftKind(k)) return `نوع غير معروف في ${DRAFT_PRICES_KEY}: "${k}" — المسموح: ${DRAFT_KIND_IDS.join(", ")}`;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_DRAFT_PRICE) {
      return `سعر "${k}" في ${DRAFT_PRICES_KEY} يجب أن يكون عدد نقاط صحيحاً بين 1 و${MAX_DRAFT_PRICE}`;
    }
  }
  return null;
}

/** The stored prices over the defaults; the defaults alone when absent or malformed. Never 0. */
export function parseDraftPrices(value: unknown): DraftPrices {
  if (value === undefined || value === null || draftPricesIssue(value) !== null) return DEFAULT_DRAFT_PRICES;
  return Object.freeze({ ...DEFAULT_DRAFT_PRICES, ...(value as Partial<Record<DraftKindId, number>>) });
}

/**
 * The price in points: the admin's prices when given (runCore passes them),
 * else the code default; 0 for anything that is not a kind (the validator
 * refuses it first).
 */
export function draftKindPrice(kind: unknown, prices?: Readonly<Partial<Record<string, number>>>): number {
  if (!isDraftKind(kind)) return 0;
  const set = prices && Object.hasOwn(prices, kind) ? prices[kind] : undefined;
  return typeof set === "number" && Number.isInteger(set) && set > 0 ? set : DRAFT_KINDS[kind].price;
}

/** The prices from platform_settings; the defaults on any failure. Never throws. */
export async function readDraftPrices(admin: SupabaseClient): Promise<DraftPrices> {
  try {
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", DRAFT_PRICES_KEY).maybeSingle();
    if (error) return DEFAULT_DRAFT_PRICES;
    return parseDraftPrices((data as { value?: unknown } | null)?.value);
  } catch {
    return DEFAULT_DRAFT_PRICES;
  }
}

/**
 * The wizard's choice → the kind the AI writes, or null when it is not a
 * pleading (a specialist mode) or the sub-type is not chosen yet. Matched on
 * the sub-type's own words, so the committee lists map the same way.
 */
export function draftKindFromMemo(memoType: string, memoSubType: string): DraftKindId | null {
  const sub = memoSubType.trim();
  if (!sub) return null;
  if (memoType === "case") return "claim";
  if (memoType === "reply") {
    if (sub.includes("تعقيب")) return "rejoinder";
    if (sub.includes("إلحاقية")) return "supplementary";
    if (sub.includes("ختامية")) return "closing";
    return "reply";
  }
  if (memoType === "appeal") {
    if (sub.includes("نقض")) return "cassation";
    if (sub.includes("التماس")) return "petition";
    if (sub.includes("استئناف")) return "appeal";
    return null;
  }
  return null;
}
