/**
 * draftKinds.ts — L14 الصائغ القانوني (plan §5 wave 5): the pleadings the AI
 * writes and what each costs. One work is one subject, one stage and one
 * output, so the price keys on the kind, never on the main type alone:
 * 500 for a claim and the memos of the first instance, 1,000 for an appeal,
 * 1,500 for cassation and a petition for review.
 *
 * The wizard's main type and sub-type (src/components/draft/draftConstants.ts)
 * map onto a kind here; the specialist modes (arbitration, notary, report,
 * minutes) have none and stay a team order.
 *
 * Pure: no imports, so `node --test` runs it and tools.ts may use it.
 */

export const DRAFT_KINDS = {
  claim: { label: "لائحة دعوى", price: 500, challenge: false },
  reply: { label: "مذكرة رد", price: 500, challenge: false },
  rejoinder: { label: "مذكرة تعقيب", price: 500, challenge: false },
  supplementary: { label: "مذكرة إلحاقية", price: 500, challenge: false },
  closing: { label: "مذكرة ختامية", price: 500, challenge: false },
  appeal: { label: "لائحة اعتراض بالاستئناف", price: 1000, challenge: true },
  cassation: { label: "مذكرة اعتراض بطلب النقض", price: 1500, challenge: true },
  petition: { label: "التماس إعادة النظر", price: 1500, challenge: true },
} as const;

export type DraftKindId = keyof typeof DRAFT_KINDS;
export const DRAFT_KIND_IDS = Object.keys(DRAFT_KINDS) as DraftKindId[];

export function isDraftKind(v: unknown): v is DraftKindId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(DRAFT_KINDS, v);
}

/** The price in points; 0 for anything that is not a kind (the validator refuses it first). */
export function draftKindPrice(kind: unknown): number {
  return isDraftKind(kind) ? DRAFT_KINDS[kind].price : 0;
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
