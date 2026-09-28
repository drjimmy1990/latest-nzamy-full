/**
 * profileShareTargets.ts — the share text and the three share links behind
 * ShareProfileModal (T28-29b). Pure, so profileShareTargets.test.ts can pin
 * the URLs.
 *
 * WhatsApp is `https://wa.me/?text=` with NO number: the lawyer picks the
 * recipient in WhatsApp itself. A number here would be a platform contact
 * literal, which src/lib/contactPolicy.test.ts forbids for anything but the
 * platform's own line — and it would be the wrong recipient anyway.
 */

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
