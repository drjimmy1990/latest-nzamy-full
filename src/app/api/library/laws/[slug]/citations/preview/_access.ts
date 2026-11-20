/**
 * _access.ts — whether the links box's text preview may carry an item's text
 * (owner message 18 Nov, item 6 §4–5). Pure: `node --test` runs _access.test.ts.
 *
 *   - An article of a law: the law reader's own rule, never looser — full
 *     library access (a subscriber, an admin) or a whitelisted law opens it;
 *     otherwise only an article inside that law's free preview window (its
 *     position in the law, order_index then id, below effectiveFreeLimit — the
 *     same global index the law route locks by). A box must never be a way
 *     round the paywall.
 *   - A principle, a ruling or a fiqh text: «تظهر عناوينها لغير المشترك فقط» —
 *     full library access only, whatever the collection's free first items
 *     (owner item 6 §5; batch-8 decision: fiqh like principles).
 *   - A decree or a whole law: never text here; the preview names it and
 *     links to it.
 */
import type { RefKind } from "../_shape.ts";

export type PreviewLock = "subscribe" | null;

export interface ArticleAccessInput {
  isSubscriber: boolean;
  /** checkLibraryAccess(...).isWhitelisted / freeLimit === -1 for this law. */
  lawOpen: boolean;
  /** effectiveFreeLimit for the law (−1 = unlimited). */
  freeLimit: number;
  /** 0-based position of the article in its law; null when it could not be counted. */
  position: number | null;
}

export function articleTextOpen(a: ArticleAccessInput): boolean {
  if (a.isSubscriber || a.lawOpen || a.freeLimit === -1) return true;
  return a.position !== null && a.position >= 0 && a.position < a.freeLimit;
}

export interface PrincipleAccessInput {
  isSubscriber: boolean;
  /** isFreeLibraryItem: the admin marked this principle free (library_free_items.principles). */
  explicitFree: boolean;
  /**
   * collectionFreeCount for its collection: the first N items a non-subscriber
   * reads in full on the collection page (public_full_rulings_per_collection,
   * an admin per-collection override wins; −1 = unlimited).
   */
  freeLimit: number;
  /** 0-based position in its collection (order_index, then id); null when it could not be counted. */
  position: number | null;
}

/**
 * O16 (b), batch l11-misc: a principle / ruling opens in the box exactly when
 * the collection page shows it in full — a subscriber, an explicitly free item,
 * or one of the collection's first free items (register 14 item 13). Never
 * looser than the page (precedents/[slug]/route.ts isPrincipleLocked): an
 * uncounted position stays locked.
 */
export function principleTextOpen(a: PrincipleAccessInput): boolean {
  if (a.isSubscriber || a.explicitFree || a.freeLimit === -1) return true;
  return a.position !== null && a.position >= 0 && a.position < a.freeLimit;
}

/**
 * Kinds whose text is for subscribers only, in the box — beyond the free items
 * a non-subscriber already reads on the page (principleTextOpen).
 */
export function subscriberOnlyKind(kind: RefKind): boolean {
  return kind === "principle" || kind === "feqh";
}

/** Kinds the preview never carries text for (it names them and links to them). */
export function titleOnlyKind(kind: RefKind): boolean {
  return kind === "law" || kind === "decree";
}
