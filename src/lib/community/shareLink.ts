/**
 * «مشاركة» a community question (owner TODO N05-C6) — pure apart from the
 * browser objects it is handed, so `node --test` can drive it.
 *
 *   1. The Web Share API (`navigator.share`) when the browser has one — the
 *      phone's own share sheet. A reader who closes the sheet (AbortError) has
 *      not hit an error: nothing more happens.
 *   2. Otherwise, or when the share call fails, the link is copied
 *      (`navigator.clipboard.writeText`).
 *   3. When both are missing or refused, the caller shows the link so it can
 *      be copied by hand ("manual") — the button never claims a copy that did
 *      not happen.
 */

export type ShareOutcome = "shared" | "cancelled" | "copied" | "manual";

interface ShareCapableNavigator {
  share?: (data: { title?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

export async function shareOrCopyLink(
  url: string,
  title: string,
  nav: ShareCapableNavigator | undefined = typeof navigator !== "undefined"
    ? (navigator as unknown as ShareCapableNavigator)
    : undefined,
): Promise<ShareOutcome> {
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title, url });
      return "shared";
    } catch (err) {
      if (err && typeof err === "object" && (err as { name?: unknown }).name === "AbortError") return "cancelled";
      // a refused share (not allowed here) falls through to the copy
    }
  }
  if (nav?.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      await nav.clipboard.writeText(url);
      return "copied";
    } catch {
      /* clipboard refused — show the link instead */
    }
  }
  return "manual";
}
