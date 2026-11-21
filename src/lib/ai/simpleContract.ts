/**
 * simpleContract.ts — «صائغ العقود المبسّط» for individuals and businesses
 * (owner ١٢٣, raw log parts [25] and [67], 20 Nov 2026; batch l12 simpledraft).
 *
 *  - Built for the individual and the business account only; a lawyer or a law
 *    firm never sees it (they have «محترف العقود»). An admin passes every tool.
 *  - Every contract it writes ends with the fixed guidance line below, written
 *    by the app, never by the model, with the link to /services/contracts.
 *  - Its price in points is an admin setting (platform_settings
 *    `simple_contract_price` = {"points": n}); the owner has not fixed 100 or
 *    150 yet (q١٢٣), so the default is 100 until he does.
 *
 * Pure and import-free: tools.ts, runCore.ts, the admin settings route and the
 * page all read it, and `node --test` runs it.
 */

/** The registry id (tools.ts AI_TOOLS) and the n8n webhook's last segment. */
export const SIMPLE_CONTRACT_TOOL = "simple-contract";
/** The page that runs it. */
export const SIMPLE_CONTRACT_PAGE = "/ai/simple-contract";

/**
 * «الفرد والمنشأة»: the same two account types owner ٢٦ named «فرد» and
 * «منشأة» (the client request form's individual and corporate). Whether
 * «منشأة» also covers the small-business account (micro) is not settled: it is
 * left out until the owner says so.
 */
export const SIMPLE_CONTRACT_ROLES = ["individual", "corporate"] as const;

/** platform_settings key of the price. */
export const SIMPLE_CONTRACT_PRICE_KEY = "simple_contract_price";
/** The price until the owner fixes it (q١٢٣: 100 or 150). */
export const SIMPLE_CONTRACT_DEFAULT_PRICE = 100;
/** The highest price the setting accepts. */
export const SIMPLE_CONTRACT_PRICE_MAX = 5000;

/** Where a professional contract is ordered from a lawyer on the platform. */
export const SIMPLE_CONTRACT_SERVICES_HREF = "/services/contracts";

/**
 * The fixed guidance line at the end of every simplified contract: the owner's
 * word «استرشادي» ([67]) and the sentence that goes with it, in the wording of
 * [25] (no «لا يُعتد به»).
 */
export const SIMPLE_CONTRACT_NOTICE_AR =
  "هذا نموذج مبسّط استرشادي، ولا يغني عن عقد احترافي يراجعه محامٍ. وللحصول على عقد احترافي استعن بمحامٍ من نظامي.";
export const SIMPLE_CONTRACT_LINK_LABEL_AR = "اطلب صياغة عقد من محامٍ";

/** The stored value → points, or null when it is missing or malformed (the default then applies). */
export function simpleContractPriceFrom(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const points = (value as Record<string, unknown>).points;
  return typeof points === "number" && Number.isInteger(points) && points >= 1 && points <= SIMPLE_CONTRACT_PRICE_MAX
    ? points
    : null;
}

/** The price a run is charged: the setting when it is valid, else the default. */
export function simpleContractPrice(value: unknown): number {
  return simpleContractPriceFrom(value) ?? SIMPLE_CONTRACT_DEFAULT_PRICE;
}

/** The admin settings validator for `simple_contract_price`: an error string, or null. */
export function simpleContractPriceIssue(value: unknown): string | null {
  return simpleContractPriceFrom(value) === null
    ? `قيمة ${SIMPLE_CONTRACT_PRICE_KEY} يجب أن تكون بالشكل {"points": عدد صحيح من 1 إلى ${SIMPLE_CONTRACT_PRICE_MAX}}`
    : null;
}

/**
 * The draft as plain text to copy or print, the guidance line and the link
 * always last: a copied contract never loses them.
 */
export function simpleContractText(
  draft: { title: string; preamble: string; sections: ReadonlyArray<{ heading: string; body: string }> },
  siteOrigin = "",
): string {
  const parts = [draft.title, draft.preamble, ...draft.sections.map((s) => `${s.heading}\n${s.body}`)].filter((p) => p && p.trim());
  parts.push(`${SIMPLE_CONTRACT_NOTICE_AR}\n${siteOrigin}${SIMPLE_CONTRACT_SERVICES_HREF}`);
  return parts.join("\n\n");
}
