/**
 * Art. 18 of نظام المحاماة: an independent legal consultant (مستشار قانوني)
 * may not plead or manage hearings. `lawyer_profiles.practice_kind` says which
 * of the two a lawyer is, and the paths below are the tools a consultant may
 * not open.
 *
 * Pure, with no imports, so `node --test` can load it through a relative `.ts`
 * import and every gate shares one list.
 */
export type PracticeKind = "advocate" | "consultant";

/** Anything but the exact value 'consultant' reads as 'advocate' (today's behaviour). */
export function toPracticeKind(v: unknown): PracticeKind {
  return v === "consultant" ? "consultant" : "advocate";
}

export const CONSULTANT_BLOCKED_PREFIXES = [
  "/dashboard/lawyer/hearings",
  "/dashboard/lawyer/deadlines",
  "/ai/najiz-optimizer",
  "/ai/wargaming",
  "/ai/brief-check",
  // Ruling R1 (owner ٤٠٩, 7 Nov 2026): the strength analysis is part of the simulator.
  "/ai/analyze-strength",
] as const;

/**
 * Segment-exact: a path matches a prefix when it equals it or continues with
 * "/". A query, a hash and trailing slashes are dropped first, so
 * "/ai/wargaming/?x" is blocked and "/ai/brief-checker" is not. Case-sensitive,
 * because Next routes are lowercase.
 */
export function isConsultantBlockedPath(pathname: string): boolean {
  if (typeof pathname !== "string") return false;
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return CONSULTANT_BLOCKED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export const CONSULTANT_BLOCKED_MESSAGE =
  "هذه الأداة للمحامي المرخّص بالترافع؛ المستشار القانوني لا يترافع ولا يدير الجلسات (المادة ١٨ من نظام المحاماة).";

/**
 * Owner ١٤٦ (register 14 #19, batch l12): the legal opinion and contract
 * drafting are not pleading, so their refusal does not cite Art. 18. They are
 * reserved for the licensed advocate and the law firm until the consultant's
 * account type opens.
 */
export const CONSULTANT_RESERVED_MESSAGE =
  "هذه الأداة مقصورة حالياً على المحامي المرخّص بالترافع ومكتب المحاماة، وتُفتح للمستشار القانوني حين يُفتح نوع حسابه.";
