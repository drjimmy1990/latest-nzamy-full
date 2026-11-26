/**
 * manualRequest.ts — what a signed-in buyer is told when online payment is
 * off and his click files an entitlement request instead (owner ٢٤٦), and the
 * discount code he may attach to it (batch l16, A-56 / A-59; owner 25 Nov
 * §7.7.1 and §7.7.3).
 *
 *   - the request's reference: the first 8 characters of its id, upper case
 *     («#3F2A9C1B») — what he quotes to support, never the whole id;
 *   - the confirmation names the reference and says online payment is paused;
 *   - a discount code rides on the request as one line of its note, after a
 *     shape check only: the admin who approves the request checks the code
 *     (its rules are read at approval, not here, so nothing is promised).
 *
 * Pure: no imports, so `node --test` loads it.
 */

/** «#3F2A9C1B» for a request id, or null for anything that is not a uuid. */
export function requestReference(id: unknown): string | null {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** The confirmation after a request is filed (with its reference when the server returned one). */
export function requestFiledAr(id: unknown): string {
  const ref = requestReference(id);
  return ref
    ? `تم إرسال طلبك للمراجعة — رقم الطلب ${ref}. الدفع الإلكتروني متوقف مؤقتاً، وسيُفعَّل طلبك بعد مراجعته.`
    : "تم إرسال طلبك للمراجعة. الدفع الإلكتروني متوقف مؤقتاً، وسيُفعَّل طلبك بعد مراجعته.";
}

/** A discount code's shape (A–Z, 0–9, «-», «_», 3–40 characters after trimming and upper-casing), or null. */
export function normalizeRequestCoupon(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9_-]{3,40}$/.test(code) ? code : null;
}

/** The note line that carries an attached code. */
export function couponNoteLine(code: string): string {
  return `كود خصم مرفق بالطلب: ${code}`;
}

/** The request note with the code's line appended; without a code the note is stored as sent. */
export function noteWithCoupon<T>(note: T, code: string | null): T | string | null {
  if (!code) return note ?? null;
  const base = typeof note === "string" ? note.trim() : "";
  return base ? `${base}\n${couponNoteLine(code)}` : couponNoteLine(code);
}

/**
 * l16 (A-59): the discount code the «تفعيل كود» box recognised, kept for this
 * tab only (sessionStorage) so the next activation request filed from a plan
 * card carries it. Shape-checked on the way in and out; a storage that throws
 * (private mode, blocked) keeps nothing.
 */
export const REQUEST_COUPON_KEY = "nz.requestCoupon";

export function saveRequestCoupon(storage: Pick<Storage, "setItem"> | null, code: unknown): boolean {
  const c = normalizeRequestCoupon(code);
  if (!storage || !c) return false;
  try {
    storage.setItem(REQUEST_COUPON_KEY, c);
    return true;
  } catch {
    return false;
  }
}

export function readRequestCoupon(storage: Pick<Storage, "getItem"> | null): string | null {
  if (!storage) return null;
  try {
    return normalizeRequestCoupon(storage.getItem(REQUEST_COUPON_KEY));
  } catch {
    return null;
  }
}
