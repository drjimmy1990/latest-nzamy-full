/**
 * toolPointsDisplay.ts — what a screen says an AI tool costs, read from the
 * registry that charges it (tools.ts `price`, draftKinds.ts), never written by
 * hand. The /pricing list, the hub badges and the plan cards call this, so the
 * points a visitor sees are the points the run is charged (Wave 1 task 4).
 *
 * These are today's server prices. A repricing changes tools.ts or
 * draftKinds.ts only, and every label here follows.
 *
 * Pure: imports only src/lib/ai, so `node --test` runs it.
 */
import { AI_TOOLS, ASSISTANT_MESSAGES_PER_CONVERSATION } from "./tools.ts";
import { DRAFT_KIND_IDS } from "./draftKinds.ts";

/** The registry tools a screen may price (the echo tests are never shown). */
export type PricedAiToolId =
  | "communicate"
  | "najiz-optimizer"
  | "quick-answer"
  | "library-assistant"
  | "assistant"
  | "canvas-card"
  | "case-brief"
  | "brief-check"
  | "wargaming"
  | "analyze-strength"
  | "contract-drafter"
  | "legal-opinion-consult"
  | "legal-opinion-letter"
  | "contracts-pro"
  | "legal-drafter";

/** One tool, or several sold under one label (the legal opinion's consult and letter). */
export type PricedAiToolRef = PricedAiToolId | readonly PricedAiToolId[];

/**
 * Every price one run of the tool can be charged: the drafter once per kind,
 * a metered tool at one page and at its page limit, a conversation on its
 * first (paid) message.
 */
function chargedPrices(id: PricedAiToolId): number[] {
  const tool = AI_TOOLS[id];
  const inputs: Record<string, unknown>[] = id === "legal-drafter" ? DRAFT_KIND_IDS.map((kind) => ({ kind })) : [{}];
  const pages: Array<number | null> = tool.files ? [1, tool.files.maxPages] : [null];
  return inputs.flatMap((input) => pages.map((p) => tool.price(input, { pages: p, turn: 0 })));
}

/** The lowest and highest points one run charges; [n, n] for a flat price. */
export function aiToolPointRange(ref: PricedAiToolRef): readonly [number, number] {
  const ids: readonly PricedAiToolId[] = typeof ref === "string" ? [ref] : ref;
  const prices = ids.flatMap(chargedPrices);
  return [Math.min(...prices), Math.max(...prices)];
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** 1500 → "1,500". */
export function latinPoints(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 1500 → «١٬٥٠٠» (what toLocaleString("ar-SA") prints, without depending on ICU). */
export function arabicPoints(n: number): string {
  return latinPoints(n).replace(/,/g, "٬").replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/** «نقاط» after 3–10 («٥ نقاط»), «نقطة» otherwise («٢٥٠ نقطة»). */
export function pointsNounAr(n: number): string {
  return n >= 3 && n <= 10 ? "نقاط" : "نقطة";
}

/** The number alone, for a price column: «٢٥٠», «٥٠٠–١٬٥٠٠» / "250", "500–1,500". */
export function aiToolPointsLabel(ref: PricedAiToolRef, lang: "ar" | "en"): string {
  const fmt = lang === "ar" ? arabicPoints : latinPoints;
  const [min, max] = aiToolPointRange(ref);
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

/** What one price buys when it is not one run (the assistant: a conversation), or null. */
export function aiToolPriceUnit(ref: PricedAiToolRef, lang: "ar" | "en"): string | null {
  if (ref !== "assistant") return null;
  return lang === "ar"
    ? `لكل محادثة من ${arabicPoints(ASSISTANT_MESSAGES_PER_CONVERSATION)} رسائل`
    : `per conversation of ${ASSISTANT_MESSAGES_PER_CONVERSATION} messages`;
}

/**
 * The price as a phrase, for a plan card's bullet: «٢٥٠ نقطة», «من ٥٠٠ إلى
 * ١٬٥٠٠ نقطة», «١٠٠ نقطة لكل محادثة من ٥ رسائل» / "250 points",
 * "500 to 1,500 points".
 */
export function aiToolPriceText(ref: PricedAiToolRef, lang: "ar" | "en"): string {
  const [min, max] = aiToolPointRange(ref);
  const unit = aiToolPriceUnit(ref, lang);
  const text =
    lang === "ar"
      ? min === max
        ? `${arabicPoints(min)} ${pointsNounAr(min)}`
        : `من ${arabicPoints(min)} إلى ${arabicPoints(max)} ${pointsNounAr(max)}`
      : min === max
        ? `${latinPoints(min)} ${min === 1 ? "point" : "points"}`
        : `${latinPoints(min)} to ${latinPoints(max)} points`;
  return unit ? `${text} ${unit}` : text;
}
