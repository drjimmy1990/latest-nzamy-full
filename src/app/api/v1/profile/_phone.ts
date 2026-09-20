/**
 * _phone.ts — the phone decision for PATCH /api/v1/profile, as a pure
 * function so it can be unit-tested without a Request, a session or Supabase.
 *
 * `route.ts` imports `next/server` and calls `getUser()` at module scope of
 * the handler, so nothing can import it to make a claim about what it does
 * with a phone number. Everything the phone block decides lives here instead;
 * the route keeps the `NextResponse.json` that carries the decision out.
 *
 * Contract:
 *   no `phone` key            → { action: "skip" }
 *   unusable value            → { action: "reject", message: "<Arabic reason>" }  → 400
 *   anything dialable         → { action: "store", e164: "+9665XXXXXXXX" }
 *
 * The 400 message is now the specific reason (empty / letters / length /
 * prefix) rather than one catch-all string — appendix 03 §(a),
 * docs/audits/2026-09-20-profiles-uat/03-registration-phone-audit.md.
 */

import {
  normalizeSaudiMobile,
  saudiMobileMessage,
} from "../../../../lib/services/saudiMobile.ts";

export type ProfilePhoneDecision =
  | { action: "skip" }
  | { action: "reject"; message: string }
  | { action: "store"; e164: string };

/**
 * Decides what the PATCH should do with `body.phone`.
 *
 * Presence is what triggers the check, not truthiness: `{ phone: "" }` is an
 * attempt to blank the number, and blanking it is refused here rather than
 * stored — `profiles.phone` is the only number the outbound WhatsApp payload
 * can carry (src/lib/n8n/payload.ts), and the onboarding gate reads the same
 * column. A caller that wants to leave the phone alone omits the key; the
 * settings form already does exactly that (OMIT_WHEN_EMPTY_KEYS in
 * src/lib/services/profileFormTransform.ts:37).
 */
export function profilePhoneDecision(body: Record<string, unknown>): ProfilePhoneDecision {
  if (!("phone" in body)) return { action: "skip" };

  const parsed = normalizeSaudiMobile(body.phone);
  if (!parsed.ok) return { action: "reject", message: saudiMobileMessage(parsed) };

  // Store one shape, whatever was typed.
  return { action: "store", e164: parsed.e164 };
}
