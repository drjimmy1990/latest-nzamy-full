/**
 * profileShareTargets.ts — what ShareProfileModal shows: whether the lawyer's
 * profile is published (and so has a link worth handing out), the share text,
 * the three share links, and the QR file name (T28-29b; owner Q151). Pure, so
 * profileShareTargets.test.ts can pin all of it.
 *
 * WhatsApp is `https://wa.me/?text=` with NO number: the lawyer picks the
 * recipient in WhatsApp itself. A number here would be a platform contact
 * literal, which src/lib/contactPolicy.test.ts forbids for anything but the
 * platform's own line — and it would be the wrong recipient anyway.
 */

import { buildPublicProfileUrl } from "../../../../lib/services/publicProfileLink.ts";

/** The formal sentence sent with the link (the lawyer speaking, first person). */
export const PROFILE_SHARE_TEXT =
  "يسعدني أن أشارككم ملفي المهني على منصة نظامي، للاطلاع على خبراتي ومجالات ممارستي والتواصل معي لطلب الخدمات القانونية.";

export type ProfileShareTargetId = "whatsapp" | "x" | "linkedin";

export interface ProfileShareTarget {
  id: ProfileShareTargetId;
  label: string;
  href: string;
}

export function buildProfileShareTargets(url: string, text: string = PROFILE_SHARE_TEXT): ProfileShareTarget[] {
  const u = encodeURIComponent(url);
  return [
    { id: "whatsapp", label: "واتساب", href: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}` },
    { id: "x", label: "إكس", href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${u}` },
    { id: "linkedin", label: "لينكدإن", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  ];
}

// ─── Is there anything to share? ─────────────────────────────────────────────

/**
 * - `published`  — the public page will open: hand out the link and the QR.
 * - `unpublished` — the page would 404 (/lawyers/[slug]/layout.tsx). Say which
 *   of the two conditions is missing; never show a link or a QR.
 * - `no_profile` — the record was read and there is none yet: say so and
 *   point to the editor.
 * - `unknown`    — the professional record was not read (failed, or no
 *   signed-in id): nothing may be asserted either way.
 */
export type ProfileShareState =
  | { kind: "published"; url: string }
  | { kind: "unpublished"; verified: boolean; visible: boolean }
  | { kind: "no_profile" }
  | { kind: "unknown" };

export interface ProfileShareInput {
  origin: string;
  userId: string | null | undefined;
  slug: string | null | undefined;
  /** `lawyer_profiles` was read AND held a row. */
  hasRoleProfile: boolean;
  /** The `lawyer_profiles` read failed (not the same as "no row"). */
  roleProfileReadFailed: boolean;
  verificationStatus: string | null;
  marketplaceVisible: boolean;
}

/**
 * "Published" is exactly the public gate — `verification_status = 'verified'`
 * AND `marketplace_visible = true`, the two checks in
 * GET /api/v1/lawyers/[id] and /lawyers/[slug]/layout.tsx. Verification is
 * set by the platform's admins only; visibility is the lawyer's own toggle in
 * the profile editor.
 */
export function profileShareState(input: ProfileShareInput): ProfileShareState {
  const userId = (input.userId ?? "").trim();
  if (!userId || input.roleProfileReadFailed) return { kind: "unknown" };
  if (!input.hasRoleProfile) return { kind: "no_profile" };
  const verified = input.verificationStatus === "verified";
  const visible = input.marketplaceVisible === true;
  if (!verified || !visible) return { kind: "unpublished", verified, visible };
  return { kind: "published", url: buildPublicProfileUrl(input.origin, input.slug, userId) };
}

/** «nezamy-profile-ahmad-k.png» — the downloaded QR, named after the link's last segment. */
export function profileQrFileName(url: string): string {
  const last = url.split("/").filter(Boolean).pop() ?? "";
  let segment = last;
  try { segment = decodeURIComponent(last); } catch { /* keep it encoded */ }
  const safe = segment.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `nezamy-profile${safe ? `-${safe}` : ""}.png`;
}
