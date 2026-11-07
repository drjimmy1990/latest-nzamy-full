/**
 * libraryToolRefusal.ts — what a tool page says when POST /api/v1/ai/runs
 * refuses a library tool at the library's own gate (runs/route.ts
 * libraryAccess): `library_tier` (below Pro, owner ٢٠٦ / ٢٠٧ / ٢٠٩) or
 * `library_closed` (the library's switch is off).
 *
 * Owner ٤١٧ (7 Nov 2026) opened the AI tools to every registered account, but
 * a tool that searches the library (a spec with `retrieval`) still needs the
 * library AI's tier, which the run path checks before the charge. The gate's
 * own message names «المساعد الذكي للمكتبة», which is not the page the user is
 * on, so each page says it in its own tool's name.
 *
 * The tier is Pro or higher (TIER_RANK in src/lib/access-control.ts), NOT a
 * library subscription: a library-only subscriber gets the texts, not the AI
 * (libraryAiAccess.ts). Only some account types can buy a plan of that tier
 * today (proPlanOnSaleFor, read from the price book): the others are told it
 * is not available to their account type, with no link to plans that offer
 * them nothing. Nothing is charged on either refusal.
 *
 * Pure (relative imports only), so `node --test` runs it.
 */
import { isOnSale, PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";

export const LIBRARY_TOOL_PLANS_HREF = "/pricing";

/** The tiers at or above `pro` in TIER_RANK (access-control.ts): the library AI's rule. */
export const LIBRARY_AI_TIERS: ReadonlySet<string> = new Set(["pro", "max", "corp", "enterprise"]);

export interface LibraryToolRefusal {
  text: string;
  action: { label: string; href: string } | null;
}

/** Can an account of `userType` buy, today, a plan whose tier opens the library AI? */
export function proPlanOnSaleFor(
  userType: string | null | undefined,
  book: Readonly<Record<string, BookEntry>> = PRICE_BOOK,
): boolean {
  if (typeof userType !== "string" || userType === "") return false;
  return Object.values(book).some(
    (e) =>
      e.kind === "plan" &&
      typeof e.tier === "string" &&
      LIBRARY_AI_TIERS.has(e.tier) &&
      isOnSale(e) &&
      (e.buyers === "any" || e.buyers.includes(userType)),
  );
}

/** The refusal in the tool's words, or null when `code` is not one of the library gate's. */
export function libraryToolRefusal(
  code: string | null | undefined,
  toolNameAr: string,
  userType: string | null | undefined,
): LibraryToolRefusal | null {
  if (code === "library_tier") {
    if (userType === "admin") return null; // an admin passes the gate; never told to subscribe
    if (!proPlanOnSaleFor(userType)) {
      return {
        text: `«${toolNameAr}»: هذه الأداة تتطلب اشتراك المكتبة القانونية الكامل، وهو غير متاح لنوع حسابك حالياً — لم تُخصم نقاطك.`,
        action: null,
      };
    }
    return {
      text: `«${toolNameAr}» يجيب من نصوص مكتبة الأنظمة، فهو متاح لمشتركي باقات Pro أو أعلى؛ اشتراك المكتبة القانونية وحده لا يفتح أدوات الذكاء. لم تُخصم نقاطك.`,
      action: { label: "عرض الباقات", href: LIBRARY_TOOL_PLANS_HREF },
    };
  }
  if (code === "library_closed") {
    return {
      text: `مكتبة الأنظمة مغلقة الآن، فلا يعمل «${toolNameAr}». لم تُخصم نقاطك — حاول لاحقاً.`,
      action: null,
    };
  }
  return null;
}
