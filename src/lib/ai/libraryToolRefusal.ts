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
 * on, so each page says it in its own tool's name, with the way to the plans.
 *
 * The tier is Pro or higher, NOT a library subscription: a library-only
 * subscriber gets the texts, not the AI (libraryAiAccess.ts). Nothing is
 * charged on either refusal.
 *
 * Pure, so `node --test` runs it.
 */

export const LIBRARY_TOOL_PLANS_HREF = "/pricing";

export interface LibraryToolRefusal {
  text: string;
  action: { label: string; href: string } | null;
}

/** The refusal in the tool's words, or null when `code` is not one of the library gate's. */
export function libraryToolRefusal(code: string | null | undefined, toolNameAr: string): LibraryToolRefusal | null {
  if (code === "library_tier") {
    return {
      text: `«${toolNameAr}» يجيب من نصوص مكتبة الأنظمة، فهو متاح لمشتركي باقات Pro أو أعلى؛ اشتراك المكتبة وحده يشمل النصوص دون أدوات الذكاء. لم تُخصم نقاطك.`,
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
