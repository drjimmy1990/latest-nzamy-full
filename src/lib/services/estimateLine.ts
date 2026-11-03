/**
 * estimateLine.ts — the admin queue's one line about what a client was quoted
 * (S6-T6, owner q327). The team charges service requests by hand today
 * (ReceiptPanel on /dashboard/admin/service-orders); this line shows the
 * catalogue estimate the server stamped on the request (serviceEstimate.ts)
 * and whose price it is — business («أعمال») or individuals («أفراد») — so
 * a company is quoted the business price. It is an estimate, never a charge.
 *
 * Null when there is no positive numeric `originalPrice`. A request stored
 * before the stamp has no `priceAudience`: the amount alone, no label.
 *
 * Pure, relative `.ts` imports only (node --test).
 */
import { formatClientServicePrice } from "../pricingRepository.ts";

const AUDIENCE_AR: Record<string, string> = { corporate: "أعمال", individual: "أفراد" };

export function estimateLineAr(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  const price = m.originalPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const mode = m.priceMode === "starting_from" || m.priceMode === "per_page" ? "starting_from" : "fixed";
  const amount = formatClientServicePrice({ basePrice: price, priceMode: mode });
  const audience = typeof m.priceAudience === "string" ? AUDIENCE_AR[m.priceAudience] : undefined;
  return `السعر التقديري: ${amount}${audience ? ` (${audience})` : ""}`;
}
