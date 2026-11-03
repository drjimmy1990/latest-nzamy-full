/**
 * estimateLine.ts — the admin queue's one line about what a client was quoted
 * (S6-T6, owner q327). The team charges service requests by hand today
 * (ReceiptPanel on /dashboard/admin/service-orders); this line shows the
 * catalogue estimate the server stamped on the request (serviceEstimate.ts)
 * and whose price it is — business («أعمال») or individuals («أفراد») — so
 * a company is quoted the business price. It is an estimate, never a charge.
 *
 * Printed ONLY for an estimate the server stamped (`quoteSource === "server"`,
 * fix round 1, review I-1/I-2): a browser-written figure — a service the
 * stamp does not price, the WhatsApp chat's own 50/700 (service
 * "whatsapp_widget"), a request filed before S6-T5, or a stamp skipped for an
 * unknown audience — prints nothing rather than look like the server's quote.
 * Null too when there is no positive numeric `originalPrice`.
 *
 * Pure, relative `.ts` imports only (node --test).
 */
import { formatClientServicePrice } from "../pricingRepository.ts";

const AUDIENCE_AR: Record<string, string> = { corporate: "أعمال", individual: "أفراد" };

export function estimateLineAr(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  if (m.quoteSource !== "server") return null;
  const price = m.originalPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const mode = m.priceMode === "starting_from" || m.priceMode === "per_page" ? "starting_from" : "fixed";
  const amount = formatClientServicePrice({ basePrice: price, priceMode: mode });
  const audience = typeof m.priceAudience === "string" ? AUDIENCE_AR[m.priceAudience] : undefined;
  return `السعر التقديري: ${amount}${audience ? ` (${audience})` : ""}`;
}
