/**
 * modelPrices.ts — owner ١٥٦ (batch l13): the ONE price table the admin AI
 * usage page turns tokens into money with («التكلفة الحقيقية لكل أداة»).
 *
 * USD per 1,000,000 tokens, the provider's paid Standard tier. A model that is
 * not in the table has no price: the page says «سعر النموذج غير مضبوط» for its
 * runs instead of guessing a number.
 *
 * To add or correct a model: copy the provider's published price here, with the
 * page and the date you read it, and keep the id exactly as the workflows
 * report it in `usage.model` (n8n/ai/workflows.mjs MODEL_ID, without "models/").
 *
 * Token meaning (n8n/ai/workflows.mjs USAGE_OF, from Gemini's usageMetadata):
 *   input_tokens       = promptTokenCount (it INCLUDES the cached part)
 *   cache_read_tokens  = cachedContentTokenCount
 *   output_tokens      = candidatesTokenCount + thoughtsTokenCount (both billed as output)
 *
 * Pure: `node --test` runs it.
 */

export interface ModelPrice {
  /** USD per 1M input tokens (text / image / video). */
  inputUsdPerM: number;
  /** USD per 1M output tokens, thinking included. */
  outputUsdPerM: number;
  /** USD per 1M cached input tokens; null = billed as ordinary input. */
  cachedUsdPerM: number | null;
  /** Where and when the price was read. */
  source: string;
}

/** The Saudi riyal's fixed peg to the US dollar. */
export const SAR_PER_USD = 3.75;

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  // Every AI tool's workflow since 2026-11-24 (n8n/ai/workflows.mjs MODEL): Google refused
  // gemini-3.1-flash-lite ("Service unavailable") on 2026-11-23/24, so all workflows moved here.
  "gemini-3.5-flash-lite": {
    inputUsdPerM: 0.3,
    outputUsdPerM: 2.5,
    cachedUsdPerM: 0.03,
    source: "https://aistudio.google.com/docs/pricing (Standard paid tier, read 2026-11-24; cached price assumed 10% of input as for 3.1)",
  },
  // The model before 2026-11-24 — kept so older runs are still priced.
  "gemini-3.1-flash-lite": {
    inputUsdPerM: 0.25,
    outputUsdPerM: 1.5,
    cachedUsdPerM: 0.025,
    source: "https://aistudio.google.com/docs/pricing (Standard paid tier, read 2026-11-23)",
  },
});

/** The table's entry for a reported model id ("models/…" prefix tolerated), or null. */
export function modelPriceOf(model: string | null | undefined): ModelPrice | null {
  if (typeof model !== "string" || !model) return null;
  const id = model.trim().replace(/^models\//, "");
  return Object.prototype.hasOwnProperty.call(MODEL_PRICES, id) ? MODEL_PRICES[id] : null;
}

export interface TokenUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_tokens?: unknown;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** True when the run reported any token at all (every run before batch l13 reported 0 / 0). */
export function hasTokens(usage: TokenUsage | null | undefined): boolean {
  return !!usage && (n(usage.input_tokens) > 0 || n(usage.output_tokens) > 0);
}

/** The run's provider cost in USD at `price`; the cached part of the prompt at the cache rate. */
export function usageCostUsd(usage: TokenUsage, price: ModelPrice): number {
  const input = n(usage.input_tokens);
  const cached = Math.min(n(usage.cache_read_tokens), input);
  const cachedRate = price.cachedUsdPerM ?? price.inputUsdPerM;
  return ((input - cached) * price.inputUsdPerM + cached * cachedRate + n(usage.output_tokens) * price.outputUsdPerM) / 1_000_000;
}
