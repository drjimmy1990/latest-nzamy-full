/**
 * _privacyFields.ts — pure helpers for PrivacyTab.
 *
 * The old tab rendered a per-user-type list of toggles (`show_profile`,
 * `search_index`, `pdpl_consent`, `strict_data`, …) that started at a literal
 * `defaultOn` in `useState` and were never read from or written to anything —
 * flipping one changed nothing on the server, including the corporate/ngo
 * "PDPL consent" switch, which started ON in memory for every account whether
 * or not that account had ever actually consented.
 *
 * `user_settings` has exactly four real, allowlisted privacy/consent columns:
 * `data_sharing_consent`, `analytics_consent`, `marketing_emails`, `newsletter`
 * (src/app/api/v1/settings/route.ts). Every toggle this tab shows now maps to
 * one of those four — nothing else is offered, because nothing else has
 * anywhere to be saved. `data_sharing_consent` is the PDPL consent for
 * corporate/ngo accounts (obs: legalUpdateCategory in NotificationsTab.tsx is
 * the same "one key, role-following sentence" pattern) and a general
 * data-sharing toggle for everyone else — one column, one meaning per role,
 * never two rows driving the same switch.
 */

export type PrivacyToggleKey =
  | "data_sharing_consent"
  | "analytics_consent"
  | "marketing_emails"
  | "newsletter";

export interface PrivacyToggleDef {
  key: PrivacyToggleKey;
  label: string;
  description: string;
}

/** All four keys start `false` — never assumed consented before the server says so. */
export const PRIVACY_DEFAULT_STATES: Record<PrivacyToggleKey, boolean> = {
  data_sharing_consent: false,
  analytics_consent: false,
  marketing_emails: false,
  newsletter: false,
};

function dataSharingConsentToggle(userType: string | null): PrivacyToggleDef {
  switch (userType) {
    case "corporate":
    case "ngo":
      return {
        key: "data_sharing_consent",
        label: "الموافقة على معالجة البيانات (PDPL)",
        description: "موافقتكم الصريحة على معالجة بيانات الجهة وفق نظام حماية البيانات الشخصية",
      };
    default:
      return {
        key: "data_sharing_consent",
        label: "مشاركة بياناتي مع أطراف ثالثة",
        description: "يسمح لنظامي بمشاركة بياناتك مع شركاء موثوقين لتقديم الخدمة",
      };
  }
}

/** The four privacy/consent toggles this tab renders, in display order. */
export function getPrivacyToggles(userType: string | null): PrivacyToggleDef[] {
  return [
    dataSharingConsentToggle(userType),
    {
      key: "analytics_consent",
      label: "المشاركة في تحليلات الاستخدام",
      description: "بيانات استخدام مجهولة الهوية لتحسين المنصة",
    },
    {
      key: "marketing_emails",
      label: "رسائل تسويقية عبر البريد",
      description: "عروض وتحديثات تسويقية من نظامي",
    },
    {
      key: "newsletter",
      label: "النشرة الإخبارية",
      description: "نشرة نظامي الدورية بمستجدات المنصة والمحتوى القانوني",
    },
  ];
}

/** The subset of the settings envelope this tab reads. */
export interface PrivacySettingsSource {
  data_sharing_consent?: boolean | null;
  analytics_consent?: boolean | null;
  marketing_emails?: boolean | null;
  newsletter?: boolean | null;
}

/**
 * The switch positions to render from a loaded settings row. Deliberately does
 * NOT take a `defaultOn` per key — every column defaults to `false` until the
 * server says otherwise, which is the whole fix: the corporate/ngo PDPL switch
 * must never read as consented before it has actually loaded.
 */
export function readPrivacyStates(
  settings: PrivacySettingsSource | null | undefined,
): Record<PrivacyToggleKey, boolean> {
  return {
    data_sharing_consent: settings?.data_sharing_consent ?? false,
    analytics_consent: settings?.analytics_consent ?? false,
    marketing_emails: settings?.marketing_emails ?? false,
    newsletter: settings?.newsletter ?? false,
  };
}
