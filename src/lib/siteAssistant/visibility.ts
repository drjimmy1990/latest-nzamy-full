/**
 * visibility.ts — where the «مساعد نظامي» button is NOT drawn (O20 / A21,
 * batch l11-misc). Pure, so node --test pins it.
 *
 *   - sign-up, sign-in and account-recovery screens, and the onboarding flow
 *     (the task: hidden on sign-up pages);
 *   - checkout and the payment result pages (hidden on payment pages), and the
 *     library's subscribe page;
 *   - every dashboard (dashboard actions stay unobstructed — the same rule the
 *     WhatsApp button keeps, FloatingButtons.tsx FAB_SUPPRESSED_PREFIXES);
 *   - the readers (a law, a ruling collection, a fiqh book) and the AI tools'
 *     own pages: they already carry floating controls and a chat box of their
 *     own (owner N02-3/4: nothing more floating over the text). The library
 *     home (/laws) and the tools' home (/ai) keep it.
 */

const HIDDEN_PREFIXES = [
  "/register",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/onboarding",
  "/verify",
  "/join",
  "/invite",
  "/checkout",
  "/payments",
  "/dashboard",
  "/demo-login",
  "/account-frozen",
  "/account-suspended",
] as const;

/** Subtrees hidden below their home page (the home itself keeps the button). */
const HIDDEN_BELOW = ["/laws", "/precedents", "/book", "/ai"] as const;

export function siteAssistantHiddenOn(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const under = (p: string) => path === p || path.startsWith(p + "/");
  if (HIDDEN_PREFIXES.some(under)) return true;
  return HIDDEN_BELOW.some((p) => path.startsWith(p + "/"));
}
