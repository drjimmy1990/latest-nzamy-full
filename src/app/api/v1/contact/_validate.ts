/**
 * _validate.ts — the ONE validation pass for POST /api/v1/contact.
 *
 * Pure: no `next/server`, no Supabase client, no env. `route.ts` calls
 * `validateContactPayload(body)` and either answers 400 with `error` or
 * inserts `value`. Same pattern as src/app/api/v1/tickets/_shared.ts.
 *
 * UAT-CONTACT-001 (docs/audits/2026-09-20-profiles-uat/03-registration-phone-audit.md
 * §6): the route trimmed the payload and checked the e-mail only. `phone` went
 * into `public.contact_messages` — and on to the n8n WhatsApp workflow —
 * completely unvalidated, and `name` / `subject` / `message` had no length cap
 * at all, on a route the anon key can reach (`contact_insert_any … with check
 * (true)`, 20260706_content_and_ops.sql:62-63).
 */

import { normalizeSaudiMobile, saudiMobileMessage } from "../../../../lib/services/saudiMobile.ts";

/** Column limits. `contact_messages` stores text, so these are ours, not the DB's. */
export const CONTACT_LIMITS = { name: 120, subject: 200, message: 5000 } as const;

export const CONTACT_AR = {
  required: "البريد الإلكتروني والرسالة مطلوبان",
  badEmail: "البريد الإلكتروني غير صحيح",
  nameTooLong: "الاسم طويل جداً.",
  subjectTooLong: "الموضوع طويل جداً.",
  messageTooLong: "الرسالة طويلة جداً.",
} as const;

export interface ContactPayload {
  name: string;
  email: string;
  /** E.164 (`+9665XXXXXXXX`) or `null` — never the raw string the caller sent. */
  phoneE164: string | null;
  subject: string;
  message: string;
  kind: "contact" | "partner";
}

export type ContactValidation =
  | { ok: true; value: ContactPayload }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Validates and normalises a contact/partner payload.
 *
 * `phone` is optional — an empty or absent value yields `phoneE164: null` — but
 * a non-empty one must be a dialable Saudi mobile, and what comes back is the
 * E.164 form, so the row and the n8n dispatch carry one shape only.
 */
export function validateContactPayload(body: unknown): ContactValidation {
  const source = (body ?? {}) as Record<string, unknown>;

  const name = str(source.name);
  const email = str(source.email);
  const phone = str(source.phone);
  const subject = str(source.subject);
  const message = str(source.message);
  const kind = source.kind === "partner" ? "partner" : "contact";

  if (!email || !message) return { ok: false, error: CONTACT_AR.required };
  if (!EMAIL_RE.test(email)) return { ok: false, error: CONTACT_AR.badEmail };

  let phoneE164: string | null = null;
  if (phone) {
    const parsed = normalizeSaudiMobile(phone);
    if (!parsed.ok) return { ok: false, error: saudiMobileMessage(parsed) };
    phoneE164 = parsed.e164;
  }

  if (name.length > CONTACT_LIMITS.name) return { ok: false, error: CONTACT_AR.nameTooLong };
  if (subject.length > CONTACT_LIMITS.subject) return { ok: false, error: CONTACT_AR.subjectTooLong };
  if (message.length > CONTACT_LIMITS.message) return { ok: false, error: CONTACT_AR.messageTooLong };

  return { ok: true, value: { name, email, phoneE164, subject, message, kind } };
}
