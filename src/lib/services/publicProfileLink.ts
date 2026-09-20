/**
 * publicProfileLink.ts — the one place that decides what a lawyer's public
 * profile URL is, whether it may be shared yet, and how it reaches the
 * clipboard (WP-4 item G4).
 * ─────────────────────────────────────────────────────────
 * Two screens hand this link out — `/dashboard/lawyer` («مشاركة ملفي المهني»)
 * and `/dashboard/lawyer/profile` («مشاركة») — and until now each carried its
 * own private copy of all three decisions. They had already drifted: the
 * profile page preferred the Phase-7 `lawyer_profiles.slug` and fell back to
 * the user id, while the dashboard home still built `/lawyers/${userId}`
 * unconditionally, handing the lawyer a UUID link written before the slug
 * column existed (docs/audits/2026-09-20-profiles-uat/04-lawyer-profile-audit
 * .md §G). Two copies of a rule is one copy of the rule and one bug waiting.
 *
 * `/api/v1/lawyers/[id]` resolves EITHER form — that is why the fallback is
 * safe — but the slug is the one a lawyer can read out over the phone, so it
 * wins whenever it exists.
 *
 * `buildPublicProfileUrl` and `canShareProfile` are pure (no DOM, no clock, no
 * network) so `node --test` can run them directly; `copyToClipboard` is the
 * browser half and is deliberately kept in the same module so a caller cannot
 * pick up the URL rule without the copy behaviour that goes with it.
 */

/**
 * The public profile URL for a lawyer.
 *
 * `slug || userId`: an empty, whitespace-only or absent slug falls back to the
 * user id rather than producing `/lawyers/` — a link to the directory index,
 * which is not this lawyer and (in beta) not reachable at all.
 *
 * The path segment is percent-encoded. A stored slug is already constrained to
 * `^[a-z0-9-]+$` by SLUG_RE and a DB CHECK (20260907_phase7…:54-61), so this
 * changes nothing for a valid slug; it matters for the fallback and for any
 * row that predates the CHECK.
 */
export function buildPublicProfileUrl(
  origin: string,
  slug: string | null | undefined,
  userId: string,
): string {
  const path = (slug ?? "").trim() || userId;
  return `${origin}/lawyers/${encodeURIComponent(path)}`;
}

/**
 * Whether the «مشاركة» button may hand the link out at all.
 *
 * Two conditions, both of which are false for some sessions today:
 *   1. there is a signed-in id — guests and demo sessions carry none, so there
 *      is nothing per-user to link to;
 *   2. the public directory is open — under BETA_MONOPOLY_MODE the whole
 *      `/lawyers` subtree redirects to `/services/lawyers`
 *      (src/app/lawyers/layout.tsx:27), so a copied link would land the
 *      recipient on the firm's intake page instead of on this lawyer.
 *
 * `betaMonopolyMode` is a parameter, not a module import, so this stays pure
 * and testable in both positions; both call sites pass the BETA_MONOPOLY_MODE
 * constant from src/lib/betaConfig.ts.
 *
 * A third condition is NOT gated from here and cannot be: `/api/v1/lawyers/[id]`
 * requires `verification_status = 'verified'` AND `marketplace_visible = true`,
 * and in production every lawyer row is still «pending». Flipping
 * BETA_MONOPOLY_MODE on its own would turn this button into a link to a «not
 * found» page — the lawyer's own profile, publicly missing, handed to a client.
 * Verification has to land before that flip, or with it.
 */
export function canShareProfile(userId: string | null | undefined, betaMonopolyMode: boolean): boolean {
  return Boolean(userId) && !betaMonopolyMode;
}

/**
 * Copy `text` to the clipboard, reporting whether it actually landed there.
 *
 * Two tiers, because `navigator.clipboard` is unavailable on insecure origins
 * (plain http, which is how the dashboard is reached on the office LAN) and
 * rejects outright when the permission is denied. The textarea +
 * `execCommand("copy")` tier still works in those cases; it is deprecated but
 * not removed, and it returns a boolean the caller must honour rather than
 * assume.
 *
 * The caller shows a success tick ONLY on `true` — a silent failure that still
 * ticked would send the lawyer off to paste an empty clipboard. On `false`
 * both call sites fall back to putting the URL on screen in a selectable field.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Insecure origin, denied permission, or an unfocused document — fall through.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    // Off-screen rather than hidden: `display:none` / `visibility:hidden`
    // elements cannot be selected, so the copy would silently do nothing.
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}
