"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { getSettingsRolePolicy } from "@/constants/settingsReadiness";
import type { SettingsTabId } from "@/types/settingsBackendReady";
import {
  INITIAL_SETTINGS_TAB_STATE,
  nextSettingsTab,
  selectSettingsTab,
} from "./settingsActiveTab";

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
  | "clock-counter-clockwise"
  | "scales"
  | "file-text";

// ── Settings tabs catalog ─────────────────────────────────────────────
//
// `Partial<Record<…>>`, not a total Record: `SettingsTabId` still carries
// "nafath" (src/types/settingsBackendReady.ts, a shared contract file this
// change does not own) but the tab itself was deleted on 2026-09-02 — it
// simulated a Nafath link with a setTimeout and a hard-coded challenge code.
// An id with no entry here resolves to `undefined` and is dropped by the
// type-guarded filter below, so it renders nowhere rather than crashing.
const SETTINGS_TABS: Partial<Record<SettingsTabId, SettingsTabDef>> = {
  profile:       { id: "profile",      labelAr: "الملف الشخصي",   labelEn: "Profile",       iconKey: "user-circle" },
  "role-scope":  { id: "role-scope",   labelAr: "صلاحياتي",       labelEn: "My Role",       iconKey: "shield-check" },
  entity:        { id: "entity",       labelAr: "إعدادات الكيان", labelEn: "Organization",  iconKey: "buildings" },
  team:          { id: "team",         labelAr: "الفريق والدعوات", labelEn: "Team & Invites", iconKey: "users-three" },
  profession:    { id: "profession",   labelAr: "إعدادات المهنة", labelEn: "Profession",    iconKey: "identification-badge" },
  signature:     { id: "signature",    labelAr: "التوقيع والختم", labelEn: "Signature",     iconKey: "pen-nib" },
  delegation:    { id: "delegation",   labelAr: "التفويض",        labelEn: "Delegation",    iconKey: "handshake" },
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
//
// T28-34. Returns the tab list AND which tab is open, because the two can only
// be decided together: the open tab must never be chosen from a policy the
// session has not actually resolved (see settingsActiveTab.ts for the rules).
//
// `ready` is false until useUser() has resolved the session once. `loading`
// comes straight off useUser()'s return value — `{ ...session, isDemoBypass,
// loading }` (src/hooks/useUser.ts, end of useUser): it starts true, is
// released once the mount has read the user + profile (or found none), and is
// raised again only when a DIFFERENT user signs in after mount. A token
// refresh for the same user never raises it. While `ready` is false the page
// renders a skeleton, so the GUEST_SESSION the hook starts on — whose null
// userType maps to the eight-tab client policy — never reaches the screen.
export function useSettingsTabs() {
  const user = useUser();
  const {
    loading, isLoggedIn, userType, tier, subRole, businessRole, governmentRole,
    membershipState, profileState,
  } = user;
  const affiliationRole = user.affiliation?.role;

  // Memoised on exactly the fields getSettingsRolePolicy() reads
  // (settingsReadiness.ts, the destructuring at the top of that function).
  // It used to be recomputed on every render, and `user` itself is a fresh
  // object every render, so the policy — and the tab list built from it — had
  // a new identity each time. `affiliation?.role`, not `affiliation`: the
  // object is rebuilt on every profile re-read even when nothing changed.
  // If getSettingsRolePolicy() ever reads another session field, add it here.
  const policy = useMemo(
    () => getSettingsRolePolicy(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userType, tier, subRole, businessRole, governmentRole, affiliationRole, membershipState],
  );

  const tabs = useMemo(
    () =>
      policy.visibleTabs
        .map((id) => SETTINGS_TABS[id])
        .filter((tab): tab is SettingsTabDef => Boolean(tab)),
    [policy],
  );
  const tabIds = useMemo(() => tabs.map((tab) => tab.id as string), [tabs]);
  const tabKey = tabIds.join("|");

  // A degraded or failed role read says nothing about the role. The open tab
  // is not reset on one (useUser carries the previous type forward for the
  // same reason); the policy it produced is still what the page shows.
  const uncertain =
    profileState === "unavailable" ||
    membershipState === "degraded" ||
    membershipState === "unavailable";

  const [tabState, setTabState] = useState(INITIAL_SETTINGS_TAB_STATE);

  // ?tab=<id> is read here, after mount, from window.location — NOT through
  // useSearchParams(), which would force this statically rendered page under
  // a Suspense boundary (the wrapper src/app/marketplace/page.tsx and
  // src/app/ai/contracts/page.tsx carry for exactly that reason). Linked to by
  // name from /dashboard/client («الملف الشخصي» → ?tab=profile) and the
  // business readiness panel (?tab=entity). nextSettingsTab() applies it only
  // once the role is known and only to a tab that role has.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    setTabState((prev) =>
      nextSettingsTab(prev, { loading, isLoggedIn, uncertain, allowed: tabIds, requested }),
    );
    // tabKey stands in for tabIds: same content, stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn, uncertain, tabKey]);

  const selectTab = useCallback(
    (tabId: string) => setTabState((prev) => selectSettingsTab(prev, tabId, tabIds)),
    [tabIds],
  );

  return {
    /** False until the session has resolved once — render a skeleton. */
    ready: tabState.activeTab !== null,
    activeTab: tabState.activeTab,
    selectTab,
    tabs,
    policy,
    loading,
    userType,
    user,
    isAdmin: policy.canManageEntity || policy.canManageTeam,
  };
}
