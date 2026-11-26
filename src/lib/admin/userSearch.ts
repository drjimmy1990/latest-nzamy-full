/**
 * userSearch.ts — the admin member search (/dashboard/admin/users and
 * /dashboard/admin/entitlements, both through GET /api/v1/admin/users).
 *
 * Owner answer ٢٣٥ §4 (27 Nov 2026): the admin finds a member by name, e-mail
 * OR mobile. profiles.phone stores the Saudi mobile as E.164 (+9665XXXXXXXX,
 * CHECK profiles_phone_e164_saudi_mobile), while the admin types it the way
 * people write it — 05…, 5…, 9665…, +966 5…, 00966…, in Arabic digits, with
 * spaces or dashes. Every spelling is folded to its national digits (5XXXXXXXX,
 * or the part typed) and matched with `ilike %…%`, so a whole number and its
 * last few digits both find the account.
 *
 * Pure (relative imports only): `node --test` loads it.
 */
import { toAsciiDigits } from "../services/saudiMobile.ts";

/** Fewer digits than this are not treated as a phone search (too many hits). */
export const PHONE_SEARCH_MIN_DIGITS = 4;

/**
 * The digits to look for inside profiles.phone, or null when the term is not
 * a phone number. Only a term made of digits (any script), spaces, dashes,
 * dots, parentheses and one leading «+» qualifies: «مكتب 5» stays a name.
 */
export function phoneSearchDigits(raw: string): string | null {
  const ascii = toAsciiDigits(raw).replace(/[\s ​‎‏().\-_/]/g, "");
  if (!/^\+?[0-9]+$/.test(ascii)) return null;
  let digits = ascii.replace(/^\+/, "");
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.length >= PHONE_SEARCH_MIN_DIGITS ? digits : null;
}

/**
 * The PostgREST `or=` clause for a free-text search, or `null` when there is
 * nothing to search for.
 *
 * The term is stripped of the characters that terminate, nest or quote a
 * PostgREST filter token — `,` `(` `)` `\` and `"` — before it is
 * interpolated. Without that, a comma typed into the search box splits one
 * `ilike` into two malformed filters and the whole request comes back 400.
 * Stripping rather than escaping is deliberate: none of them can appear in an
 * e-mail address or a phone number, and a display name containing one still
 * matches on the rest of the term, because both ends are wrapped in `%`.
 *
 * Used twice by the route — the page of users and the per-type counts — so the
 * two can never disagree about what "search" means.
 */
export function adminUserSearchClause(search: string | null | undefined): string | null {
  const term = (search ?? "").replace(/[,()\\"]/g, "").trim();
  if (!term) return null;
  const arms = [
    `display_name.ilike.%${term}%`,
    `display_name_en.ilike.%${term}%`,
    `email.ilike.%${term}%`,
  ];
  const digits = phoneSearchDigits(term);
  if (digits) arms.push(`phone.ilike.%${digits}%`);
  return arms.join(",");
}
