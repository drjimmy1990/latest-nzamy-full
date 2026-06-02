"use client";

import { useUser } from "@/hooks/useUser";
import { getSettingsRolePolicy } from "@/constants/settingsReadiness";
import type { SettingsTabId } from "@/types/settingsBackendReady";

// ── Tab definition ────────────────────────────────────────────────────
export interface SettingsTabDef {
  id: SettingsTabId;
  labelAr: string;
  labelEn: string;
  /** Phosphor icon name — rendered in the parent */
  iconKey: TabIconKey;
}

export type TabIconKey =
  | "user-circle"
  | "buildings"
  | "users-three"
  | "shield-check"
  | "bell"
  | "lock"
  | "credit-card"
  | "crown-simple"
  | "gift"
  | "question"
  | "calendar"
  | "handshake"
  | "receipt"
  | "identification-badge"
  | "pen-nib"
  | "fingerprint"
  | "clock-counter-clockwise"
  | "scales"
  | "file-text";

// ── Settings tabs catalog ─────────────────────────────────────────────
const SETTINGS_TABS: Record<SettingsTabId, SettingsTabDef> = {
  profile:       { id: "profile",      labelAr: "الملف الشخصي",   labelEn: "Profile",       iconKey: "user-circle" },
  "role-scope":  { id: "role-scope",   labelAr: "صلاحياتي",       labelEn: "My Role",       iconKey: "shield-check" },
  entity:        { id: "entity",       labelAr: "إعدادات الكيان", labelEn: "Organization",  iconKey: "buildings" },
  team:          { id: "team",         labelAr: "الفريق والدعوات", labelEn: "Team & Invites", iconKey: "users-three" },
  profession:    { id: "profession",   labelAr: "إعدادات المهنة", labelEn: "Profession",    iconKey: "identification-badge" },
  signature:     { id: "signature",    labelAr: "التوقيع والختم", labelEn: "Signature",     iconKey: "pen-nib" },
  delegation:    { id: "delegation",   labelAr: "التفويض",        labelEn: "Delegation",    iconKey: "handshake" },
  nafath:        { id: "nafath",       labelAr: "نفاذ / الهوية",  labelEn: "Nafath ID",     iconKey: "fingerprint" },
  invoice:       { id: "invoice",      labelAr: "الفواتير",       labelEn: "Invoices",      iconKey: "receipt" },
  compliance:    { id: "compliance",   labelAr: "الامتثال",       labelEn: "Compliance",    iconKey: "scales" },
  security:      { id: "security",     labelAr: "الأمان",          labelEn: "Security",      iconKey: "shield-check" },
  notifications: { id: "notifications", labelAr: "الإشعارات",      labelEn: "Notifications", iconKey: "bell" },
  privacy:       { id: "privacy",      labelAr: "الخصوصية",        labelEn: "Privacy",       iconKey: "lock" },
  payments:      { id: "payments",     labelAr: "المدفوعات",       labelEn: "Payments",      iconKey: "credit-card" },
  subscription:  { id: "subscription", labelAr: "الخطة والحدود",   labelEn: "Plan & Limits", iconKey: "crown-simple" },
  referral:      { id: "referral",     labelAr: "دعوة الأصدقاء",   labelEn: "Referral",      iconKey: "gift" },
  help:          { id: "help",         labelAr: "المساعدة",        labelEn: "Help",          iconKey: "question" },
};

// ── The hook ──────────────────────────────────────────────────────────
export function useSettingsTabs() {
  const user = useUser();
  const policy = getSettingsRolePolicy(user);
  const tabs = policy.visibleTabs.map((id) => SETTINGS_TABS[id]).filter(Boolean);

  return { tabs, userType: user.userType, user, isAdmin: policy.canManageEntity || policy.canManageTeam, policy };
}
