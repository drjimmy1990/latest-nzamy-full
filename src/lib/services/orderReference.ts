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
 * aloud. The id stays the identifier.
 *
 * TWO ID SHAPES REACH THIS FILE, and only one of them needs shortening.
 * `service_requests.id` is a TEXT primary key, not a uuid. The server mints a
 * uuid when a caller supplies no id, but eleven client intake paths supply
 * their own — `createWorkflowId("REQ")` and friends, shaped
 * `REQ-MTJFH6ZF-B5OQ`. Those are already short references and pass through
 * untouched; see `SHORT_HUMAN_ID` for the regression that shortening them
 * caused.
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
 * The ONLY id shape this function may shorten.
 *
 * `service_requests.id` is a TEXT primary key with no default
 * (api/v1/service-requests/route.ts:230), so a uuid is what the *server*
 * mints when a caller supplies nothing — not what every row carries.
 */
const UUID_SHAPED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An id that is ALREADY a short human reference and must never be shortened.
 *
 * THE REGRESSION THIS EXISTS TO END. `createWorkflowId(prefix)`
 * (clientWorkflowRepository.ts:92) builds `PREFIX-<base36 ms>-<4 random>` —
 * `REQ-MTJFH6ZF-B5OQ`. Eleven intake paths mint their own id that way and pass
 * it to POST /api/v1/service-requests, which stores it verbatim. Stripping the
 * hyphens and taking six characters off the front of that yields `ORD-REQMTJ`
 * for EVERY request filed in the same base36 window — about 16.8 hours, since
 * `Date.now().toString(36)` only turns its sixth character over once per
 * 36^2 × 1000 ms. Verified by execution: `REQ-MTJFH6ZF-B5OQ` and
 * `REQ-MTJFH6ZF-HFN2` both produced `ORD-REQMTJ`, so a client with three
 * requests saw one «رقم الطلب» three times and the admin queue's search
 * returned all three for any of them.
 *
 * Such an id is already short (16 characters), already unique (it carries the
 * millisecond and four random characters) and already readable aloud. There is
 * nothing for this module to do to it, so it passes through untouched — and
 * NOT wearing an extra «ORD-», which would print `ORD-REQ-MTJFH6ZF-B5OQ`.
 *
 * UPPERCASE ONLY, deliberately. `[A-Za-z]{2,10}-` would also match the first
 * block of a lowercase uuid whose eight hex characters happen to all be a–f
 * (`deadbeef-…`, roughly one uuid in 2,500), and that uuid would then be
 * printed in full as a 36-character «reference». `UUID_SHAPED` is tested first
 * for the same reason, so an uppercased uuid cannot slip through either.
 *
 * PREFIXES IN USE TODAY: REQ, CON, AIC, BIZ, SRV, WA, CTR, MICRO, GOV-DRAFT,
 * NGO-CTR, and the `NZ` default. `orderReference.test.ts` pins that list — a
 * new prefix longer than ten letters, or a lowercase one, would silently fall
 * back into the shortening branch and bring the collision back.
 */
const SHORT_HUMAN_ID = /^[A-Z]{2,10}-/;

/**
 * The order's reference, as a human reads it aloud.
 *
 * `ORD-8F14E4` for the uuid `8f14e45f-…`; `REQ-MTJFH6ZF-B5OQ` unchanged for an
 * id that was already a short reference when it was minted.
 *
 * Returns "" for a missing id so a caller can render a dash rather than
 * «ORD-» with nothing after it.
 */
export function orderReference(requestId: string | null | undefined): string {
  if (typeof requestId !== "string") return "";
  // Trimmed BEFORE the shape tests, not after the hyphens come out: an id that
  // arrived with whitespace («  REQ-MTJFH6ZF-B5OQ») has to be recognised as the
  // short reference it is, not dropped into the shortening branch.
  const id = requestId.trim();
  if (!id) return "";

  if (!UUID_SHAPED.test(id) && SHORT_HUMAN_ID.test(id)) return id;

  // Hyphens dropped before slicing: a v4 UUID's first block is 8 characters so
  // this never actually reaches one, but an id in any other shape (the leads
  // endpoint, a legacy row) must not produce «ORD-8F14E-».
  const hex = id.replace(/-/g, "");
  if (!hex) return "";
  return PREFIX + hex.slice(0, LENGTH).toUpperCase();
}

/**
 * Does what a human typed identify this order?
 *
 * Accepts the reference exactly as `orderReference()` prints it — whichever of
 * the two shapes that is for this id — plus, for a uuid, the full uuid, any
 * prefix of it at least MIN_LOOSE_MATCH long, and the short form with or
 * without the `ORD-` prefix, in either case. All of those are things people
 * actually paste: support pasting «ORD-8F14E4» and support pasting
 * «8f14e45f-ceea-467a» have to reach the same row.
 *
 * A DELIBERATE ONE-TO-MANY. A client whose screenshot predates the collision
 * fix quotes `ORD-REQMTJ` — the reference every request in that 16.8-hour
 * window used to be given. That still matches all of them, because
 * hyphen-stripped `REQMTJFH6ZFB5OQ` starts with `REQMTJ`. That is the right
 * answer, not a leftover bug: the client really was shown that string, and the
 * file header already states the rule — the reference is a LOOKUP AID, and a
 * search returning two rows for one reference is a correct outcome. Do not
 * "fix" it by anchoring the match; you would strand every reference quoted
 * before the fix shipped.
 */
export function matchesOrderReference(
  requestId: string | null | undefined,
  typed: string,
): boolean {
  if (typeof requestId !== "string" || !requestId) return false;
  const needle = typed.trim().toUpperCase().replace(/^#/, "");
  if (!needle) return false;

  // The invariant, asserted rather than left to coincidence: whatever
  // `orderReference()` prints for this id identifies this id. Both shapes go
  // through here, so the two functions cannot drift apart — a future shape
  // added to one is matched by the other for free.
  const printed = orderReference(requestId).toUpperCase();
  if (printed && printed === needle) return true;

  const hex = requestId.trim().replace(/-/g, "").toUpperCase();
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
