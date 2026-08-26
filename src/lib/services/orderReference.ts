/**
 * The short order reference — owner item ٤.
 *
 * «رقم الطلب طويل جداً (UUID) ولا يمكن للعميل قراءته في الواتساب» — and the
 * app agreed with him in three different ways at once: `describeRequestEvent`
 * printed `#8f14e45f` (8 lowercase hex), the lawyer dashboard printed the same
 * thing with a different prefix, and the leads endpoint built
 * `.replace(/-/g,"").slice(0,8).toUpperCase()`. Three formats for one row means
 * a client quotes a reference the admin cannot find, which is the failure this
 * exists to prevent. One helper, one format, everywhere.
 *
 * DERIVED, NOT STORED. There is no `reference` column and this adds none: a
 * stored short code needs uniqueness enforcement, a backfill for every
 * existing row, and a migration — for a string whose only job is to be read
 * aloud. The UUID stays the identifier.
 *
 * SIX hex characters, not the four in the owner's «#ORD-7E43» example. Four is
 * 65,536 values, at which two orders share a reference around the 300th order
 * (birthday collision); six is 16.7 million, and still short enough to read
 * over a phone. The reference is a LOOKUP AID, never an identifier — every
 * consumer must resolve it against the real id, and a search that returns two
 * rows for one reference is a correct outcome, not a bug.
 */
const PREFIX = "ORD-";
const LENGTH = 6;
/** Shortest bare fragment (no «ORD-») that may prefix-match an order. */
const MIN_LOOSE_MATCH = 4;

/**
 * `ORD-8F14E4` for the order whose id starts `8f14e45f-…`.
 * Returns "" for a missing id so a caller can render a dash rather than
 * «ORD-» with nothing after it.
 */
export function orderReference(requestId: string | null | undefined): string {
  if (typeof requestId !== "string") return "";
  // Hyphens dropped before slicing: a v4 UUID's first block is 8 characters so
  // this never actually reaches one, but an id in any other shape (the leads
  // endpoint, a legacy row) must not produce «ORD-8F14E-».
  const hex = requestId.replace(/-/g, "").trim();
  if (!hex) return "";
  return PREFIX + hex.slice(0, LENGTH).toUpperCase();
}

/**
 * Does what a human typed identify this order?
 *
 * Accepts the full UUID, any prefix of it at least MIN_LOOSE_MATCH long, the
 * short reference with or without the `ORD-` prefix, and either case — because
 * all of those are things people actually paste. Support pasting «ORD-8F14E4»
 * and support pasting «8f14e45f-ceea-467a» have to reach the same row.
 */
export function matchesOrderReference(
  requestId: string | null | undefined,
  typed: string,
): boolean {
  if (typeof requestId !== "string" || !requestId) return false;
  const needle = typed.trim().toUpperCase().replace(/^#/, "");
  if (!needle) return false;

  const hex = requestId.replace(/-/g, "").toUpperCase();
  const prefixed = needle.startsWith(PREFIX);
  const bare = prefixed ? needle.slice(PREFIX.length) : needle;
  // The typed value is compared against the HYPHEN-STRIPPED id, so a paste of
  // «8f14e45f-ceea» matches after its own hyphens come out too.
  const bareHex = bare.replace(/-/g, "");
  if (!bareHex) return false;

  // A MINIMUM before the prefix branch will fire. Without it a bare «A» —
  // the first keystroke in a live-filtered search box — prefix-matches about
  // one order in sixteen, and the admin is shown an arbitrary subset that
  // looks exactly like a real result set. Anything typed WITH the «ORD-»
  // prefix is unambiguous at any length, because nobody types that by
  // accident; anything without it has to be long enough to mean something.
  //
  // There is deliberately NO free-substring fallback here. One used to sit
  // beside this test (`requestId.includes(needle)`) and it made the minimum
  // meaningless — «8» is a substring of almost every UUID, so it matched
  // anyway. The admin queue keeps its own separate substring search over the
  // raw id for free-form lookups; this function answers the narrower question
  // its name asks, and answers it precisely.
  const longEnough = prefixed || bareHex.length >= MIN_LOOSE_MATCH;
  return longEnough && hex.startsWith(bareHex);
}
