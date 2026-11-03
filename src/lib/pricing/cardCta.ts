/**
 * cardCta.ts — the button a /pricing card shows a SIGNED-IN member (backlog
 * UX14, owner package of 30 Oct 2026: «إرسال الحساب المسجل لإدارة خطته»).
 *
 * A card whose button is a sign-up («سجّل مجاناً» — the free micro and
 * provider tiers) asks a member who already has an account to register
 * again; PricingCards' subscribe handler even turned that click into an
 * entitlement request for a free plan. For a signed-in member such a button
 * becomes «إدارة باقتي» → the subscription tab of the settings. Every other
 * button (subscribe, top up, contact sales) is left alone: the subscribe
 * handler already sends a member to checkout or files the request.
 *
 * Pure: no imports, so `node --test` loads it (cardCta.test.ts).
 */

export const MANAGE_PLAN_HREF = "/settings?tab=subscription";

const SIGN_UP_LABEL = /سجّل|سجل|إنشاء حساب|sign\s*up|register/i;

export function signedInCta(
  card: { cta: string; ctaHref: string },
  signedIn: boolean,
  isAr: boolean,
): { cta: string; ctaHref: string } {
  if (!signedIn || !SIGN_UP_LABEL.test(card.cta)) return { cta: card.cta, ctaHref: card.ctaHref };
  return { cta: isAr ? "إدارة باقتي" : "Manage my plan", ctaHref: MANAGE_PLAN_HREF };
}
