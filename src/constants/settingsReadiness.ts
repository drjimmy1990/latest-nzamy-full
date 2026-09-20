import type { UserSession } from "@/hooks/useUser";
import type { SettingsTabId } from "@/types/settingsBackendReady";

/**
 * The amber notice on the «صلاحياتي» tab — ONE render site, and it is the
 * only thing this constant is: `RoleScopeTab.tsx:40`
 * (`grep -rn "SETTINGS_BACKEND_READY_MESSAGE" src`). InvoiceTab and
 * SignatureTab pass <BackendReadyNotice> their own wording and never read this.
 *
 * WHAT IT USED TO SAY AND WHY THAT BECAME FALSE. It read
 * «محلي وجاهز للباك إند: لا يوجد حفظ خادمي أو إرسال بريد أو RBAC إنتاجي
 * في هذه المرحلة.» — a blanket claim over the whole of /settings, written for a
 * developer and left standing after the tabs under it grew real backends:
 * ProfileTab and ProfessionTab PATCH /api/v1/profile, EntitySettingsTab writes
 * `business_profiles` + `metadata.settings` through the same route, and
 * Security/Notifications/Privacy PUT /api/v1/settings. A client who reads
 * «لا يوجد حفظ خادمي» and therefore does not bother saving their phone
 * number is being misled by a banner, which is the same class of defect as a
 * mock drawn as data.
 *
 * IT IS NARROWED, NOT DELETED, because its first clause is still true and is
 * this tab's real disclosure: `getSettingsRolePolicy()` below computes the role
 * label and every capability flag in the browser from `user_type`/`sub_role` —
 * there is no server-side permission store to read, and nothing on that tab
 * changes anything.
 *
 * The two tabs named in it are the ones that still store nothing a user types:
 * «التوقيع والختم» (no signature storage at all) and «الفواتير» (fields that
 * are format hints only). Both say so themselves as well. The remaining tabs
 * — الامتثال، التفويض، المدفوعات، الخطة والحدود، دعوة الأصدقاء — accept no
 * input to lose (EmptyPanel), and «الفريق والدعوات» reads the real
 * firm_members roster and links out for every write. If either named tab gets a
 * backend, take it out of this sentence — do not widen the claim again.
 */
export const SETTINGS_BACKEND_READY_MESSAGE =
  "ما تراه هنا من دور وصلاحيات تحسبه الواجهة من نوع حسابك، لا من نظام صلاحيات على الخادم، " +
  "ولا يُعدَّل من هذه الصفحة. أما التبويبات التي تقبل التعديل فتُحفظ تغييراتها على الخادم فعلاً، " +
  "عدا «التوقيع والختم» و«الفواتير» فلا يُحفظ منهما شيء.";

export interface SettingsRoleOption {
  value: string;
  label: string;
  scope: "personal" | "entity" | "department" | "case";
  seatType: "assistant" | "member" | "professional";
}

export interface SettingsSeatPolicy {
  label: string;
  used: number;
  included: number;
  unit: string;
  overLimitMessage: string;
}

export interface SettingsRolePolicy {
  roleLabel: string;
  entityLabel?: string;
  canManageEntity: boolean;
  canManageTeam: boolean;
  canManageBilling: boolean;
  canManageCompliance: boolean;
  canInviteTeam: boolean;
  canUseProfession: boolean;
  canUseSignature: boolean;
  canUseDelegation: boolean;
  canUseReferral: boolean;
  showPayments: boolean;
  showSubscription: boolean;
  visibleTabs: SettingsTabId[];
  /**
   * NEVER POPULATED. Five literals lived here, one per account type:
   * «مقاعد المكتب ٧/١٠», «مقاعد الشركة ١٢/٢٥», «مستخدمي الجهة ٢٨/٥٠»,
   * «أعضاء ومتطوعون ٥/١٠» (all four removed 2026-08-27) and «مقاعد المساعدين
   * ٢/٣» (removed 2026-09-02, the lawyer branch below). Every corporate
   * account in the country was shown the same "12 of 25 seats used" progress
   * bar as its own live figure.
   *
   * Nothing counts seats. There is no seat table, no plan quota anywhere in
   * the schema, and no query behind any of those numbers. The type is kept —
   * both consumers already branch on its absence (RoleScopeTab, and
   * TeamManagementTab which falls back to the length of its own list) — so
   * that the day a real count exists it has somewhere to go.
   *
   * Do not "restore" one of these as a placeholder, and do not zero-fill it:
   * a rendered «٠ / ٠ مقعد» is not an empty state, it is a quota of zero, and
   * TeamManagementTab would read it as seats-full and refuse every invite.
   */
  seatPolicy?: SettingsSeatPolicy;
  inviteRoles: SettingsRoleOption[];
  personalOnlyNotice?: string;
  /**
   * True when a permission below is `false` because the session could not READ
   * this account's entity role, not because the account does not have it —
   * WP-6 B-9. The screen must say so; a silent denial over an unread role is
   * the mirror image of the fail-open this replaced.
   */
  roleUnavailable?: boolean;
}

const ALWAYS_SIMPLE: SettingsTabId[] = ["profile", "security", "notifications", "privacy", "help"];

const LAWYER_INVITE_ROLES: SettingsRoleOption[] = [
  { value: "legal_assistant", label: "مساعد قانوني", scope: "personal", seatType: "assistant" },
  { value: "trainee", label: "متدرب", scope: "case", seatType: "assistant" },
  { value: "legal_secretary", label: "سكرتير قانوني", scope: "personal", seatType: "assistant" },
  { value: "collaborating_lawyer", label: "محام مشارك", scope: "case", seatType: "professional" },
];

const FIRM_INVITE_ROLES: SettingsRoleOption[] = [
  { value: "partner", label: "شريك", scope: "entity", seatType: "professional" },
  { value: "senior_lawyer", label: "محام أول", scope: "department", seatType: "professional" },
  { value: "lawyer", label: "محام", scope: "department", seatType: "professional" },
  { value: "trainee", label: "متدرب", scope: "case", seatType: "assistant" },
  { value: "legal_secretary", label: "سكرتير قانوني", scope: "department", seatType: "assistant" },
  { value: "finance_manager", label: "مدير مالي", scope: "entity", seatType: "member" },
];

// The EIGHT invitable roles of the `business_members` role CHECK
// (20260603_phase1_002_entities.sql:303-307) — the ninth, `owner`, is set by
// the ensure_business_owner_membership trigger from
// business_profiles.owner_user_id and is not something a person is invited as.
//
// `compliance_officer` and `seconded` were missing until WP-6 B-5 even though
// isCorporateComplianceManager() below branches on the first and the team page
// renders labels for both. With POST /api/v1/business/members now validating
// against the same eight, a role absent from this list was a role the product
// admitted existed and offered no way to assign.
export const CORPORATE_INVITE_ROLES: SettingsRoleOption[] = [
  { value: "legal_manager", label: "مدير الشؤون القانونية", scope: "entity", seatType: "professional" },
  { value: "legal_staff", label: "أخصائي قانوني", scope: "department", seatType: "professional" },
  { value: "compliance_officer", label: "مسؤول الامتثال", scope: "entity", seatType: "professional" },
  { value: "seconded", label: "مستشار منتدب", scope: "case", seatType: "professional" },
  { value: "department_head", label: "مدير قسم", scope: "department", seatType: "member" },
  { value: "hr_manager", label: "مدير موارد بشرية", scope: "department", seatType: "member" },
  { value: "finance_manager", label: "مدير مالي", scope: "entity", seatType: "member" },
  { value: "employee", label: "موظف", scope: "department", seatType: "member" },
];

const GOVERNMENT_INVITE_ROLES: SettingsRoleOption[] = [
  { value: "judge", label: "قاضي", scope: "department", seatType: "professional" },
  { value: "prosecutor", label: "عضو نيابة/ادعاء", scope: "department", seatType: "professional" },
  { value: "officer", label: "ضابط/محقق", scope: "department", seatType: "professional" },
  { value: "gov_counsel", label: "مستشار حكومي", scope: "entity", seatType: "professional" },
];

const NGO_INVITE_ROLES: SettingsRoleOption[] = [
  { value: "board_member", label: "عضو مجلس", scope: "entity", seatType: "member" },
  { value: "ceo", label: "مدير تنفيذي", scope: "entity", seatType: "member" },
  { value: "program_manager", label: "مدير برنامج", scope: "department", seatType: "member" },
  { value: "legal", label: "مسؤول قانوني", scope: "department", seatType: "professional" },
  { value: "volunteer", label: "متطوع", scope: "case", seatType: "assistant" },
];

function uniqueTabs(tabs: SettingsTabId[]): SettingsTabId[] {
  return Array.from(new Set(tabs));
}

function isLawyerTeamAllowed(tier: UserSession["tier"]): boolean {
  return ["ai", "pro", "max", "enterprise"].includes(tier);
}

function isFirmManager(role?: string): boolean {
  if (!role) return true;
  return ["managing_partner", "partner", "office_admin", "hr_manager"].includes(role);
}

function isFirmBillingManager(role?: string): boolean {
  if (!role) return true;
  return ["managing_partner", "partner", "finance_manager", "office_admin"].includes(role);
}

// ── Corporate role predicates — DENY BY DEFAULT (WP-6 B-9) ─────────────────
//
// All three used to read `role ?? "owner"`, so a corporate account whose
// `businessRole` was unknown was treated as the company OWNER and shown
// «إعدادات الكيان», «الفريق», billing and compliance. `businessRole` is
// `memberships.business?.role ?? meta.business_role` (useUser.ts) and NO
// signup writes that metadata key, so "unknown" was not an edge case: it was
// every corporate account whose membership read had failed — precisely the
// 42P17 population of UAT-TEAM-001, fail-open in exactly the wrong direction.
//
// An unknown role is now DENIED. The pairing that makes that safe is WP-6 B-8:
// a real owner gets `role: "owner"` from the owned-`business_profiles`
// fallback, which survives a failing `business_members` read instead of being
// discarded with it. And when the reads were only partial, `roleUnavailable`
// below says so out loud rather than letting the denial read as «you have no
// permissions».
function isCorporateEntityManager(role?: string): boolean {
  return role ? ["owner", "legal_manager", "hr_manager"].includes(role) : false;
}

function isCorporateBillingManager(role?: string): boolean {
  return role ? ["owner", "finance_manager"].includes(role) : false;
}

function isCorporateComplianceManager(role?: string): boolean {
  return role ? ["owner", "legal_manager", "compliance_officer"].includes(role) : false;
}

export function getSettingsRolePolicy(user: UserSession): SettingsRolePolicy {
  const { userType, tier, subRole, businessRole, governmentRole, affiliation, membershipState } = user;
  const affiliationRole = affiliation?.role;

  if (userType === "admin") {
    return {
      roleLabel: "مدير منصة",
      canManageEntity: false,
      canManageTeam: false,
      canManageBilling: false,
      canManageCompliance: false,
      canInviteTeam: false,
      canUseProfession: false,
      canUseSignature: false,
      canUseDelegation: false,
      canUseReferral: false,
      showPayments: false,
      showSubscription: false,
      visibleTabs: ALWAYS_SIMPLE,
      inviteRoles: [],
      personalOnlyNotice: "إعدادات الأدمن هنا شخصية فقط؛ إعدادات المنصة الثقيلة في لوحة الأدمن.",
    };
  }

  if (userType === "individual" || !userType) {
    return {
      roleLabel: "عميل فرد",
      canManageEntity: false,
      canManageTeam: false,
      canManageBilling: false,
      canManageCompliance: false,
      canInviteTeam: false,
      canUseProfession: false,
      canUseSignature: false,
      canUseDelegation: false,
      canUseReferral: true,
      showPayments: true,
      showSubscription: true,
      visibleTabs: uniqueTabs(["profile", "security", "notifications", "privacy", "payments", "subscription", "referral", "help"]),
      inviteRoles: [],
    };
  }

  if (userType === "lawyer") {
    const canInviteTeam = isLawyerTeamAllowed(tier);
    return {
      roleLabel: "محامي",
      canManageEntity: false,
      canManageTeam: canInviteTeam,
      canManageBilling: true,
      canManageCompliance: false,
      canInviteTeam,
      canUseProfession: true,
      canUseSignature: true,
      canUseDelegation: true,
      canUseReferral: true,
      showPayments: true,
      showSubscription: true,
      visibleTabs: uniqueTabs([
        "profile", "profession", "signature", "delegation",
        ...(canInviteTeam ? ["team" as const] : []),
        "security", "notifications", "privacy", "payments", "subscription", "referral", "help",
      ]),
      // 2026-09-02 — the fifth and last seat literal is gone with the other
      // four. It read «مقاعد المساعدين: ٢ / ٣ مقعد» under a progress bar two
      // thirds full, and every lawyer on a plan that can invite a team saw
      // that same «٢ من ٣» as their own count — including one who had never
      // invited anyone. It also *blocked*: `seatsFull` in TeamManagementTab
      // compared against the invented `included`, so a third invitation was
      // refused with «مقاعد المساعدين ممتلئة؛ تحتاج مقعداً إضافياً أو ترقية
      // خطة» — an upsell driven by a number nothing had counted.
      //
      // Nothing counts seats. Both consumers branch on absence, so the field
      // is simply left unset; see the note on `seatPolicy` above.
      inviteRoles: canInviteTeam ? LAWYER_INVITE_ROLES : [],
    };
  }

  if (userType === "provider") {
    const canUseSignature = subRole === "notary";
    return {
      roleLabel: subRole === "notary" ? "موثق" : subRole === "arbitrator" ? "محكم" : "مزود خدمة",
      canManageEntity: false,
      canManageTeam: false,
      canManageBilling: true,
      canManageCompliance: false,
      canInviteTeam: false,
      canUseProfession: true,
      canUseSignature,
      canUseDelegation: true,
      canUseReferral: true,
      showPayments: true,
      showSubscription: true,
      visibleTabs: uniqueTabs([
        "profile", "profession",
        ...(canUseSignature ? ["signature" as const] : []),
        "delegation", "security", "notifications", "privacy", "payments", "subscription", "referral", "help",
      ]),
      inviteRoles: [],
    };
  }

  if (userType === "firm") {
    const canManageTeam = isFirmManager(affiliationRole);
    const canManageBilling = isFirmBillingManager(affiliationRole);
    return {
      roleLabel: affiliationRole ? "موظف مكتب محاماة" : "إدارة مكتب محاماة",
      entityLabel: "مكتب/شركة محاماة",
      canManageEntity: canManageTeam,
      canManageTeam,
      canManageBilling,
      canManageCompliance: canManageTeam,
      canInviteTeam: canManageTeam,
      canUseProfession: false,
      canUseSignature: true,
      canUseDelegation: true,
      canUseReferral: false,
      showPayments: canManageBilling,
      showSubscription: canManageBilling,
      visibleTabs: uniqueTabs([
        "profile", "role-scope",
        ...(canManageTeam ? ["entity" as const, "team" as const, "compliance" as const] : []),
        "signature", "delegation",
        ...(canManageBilling ? ["invoice" as const, "payments" as const, "subscription" as const] : []),
        "security", "notifications", "privacy", "help",
      ]),
      inviteRoles: canManageTeam ? FIRM_INVITE_ROLES : [],
    };
  }

  if (userType === "corporate") {
    const canManageEntity = isCorporateEntityManager(businessRole);
    const canManageBilling = isCorporateBillingManager(businessRole);
    const canManageCompliance = isCorporateComplianceManager(businessRole);
    // The denial above is honest only if the reason reaches the user. A role
    // we never managed to read is not the same fact as a role that grants
    // nothing — see MembershipState in src/hooks/useUser.ts.
    const roleUnavailable = !businessRole && membershipState !== undefined && membershipState !== "ok";
    return {
      roleUnavailable,
      roleLabel: "موظف شركة تجارية",
      entityLabel: "شركة تجارية",
      canManageEntity,
      canManageTeam: canManageEntity,
      canManageBilling,
      canManageCompliance,
      canInviteTeam: canManageEntity,
      canUseProfession: false,
      canUseSignature: false,
      canUseDelegation: canManageEntity || businessRole === "legal_manager",
      canUseReferral: false,
      showPayments: canManageBilling,
      showSubscription: canManageBilling,
      visibleTabs: uniqueTabs([
        "profile", "role-scope",
        ...(canManageEntity ? ["entity" as const, "team" as const] : []),
        ...(canManageEntity || businessRole === "legal_manager" ? ["delegation" as const] : []),
        ...(canManageBilling ? ["invoice" as const, "payments" as const, "subscription" as const] : []),
        ...(canManageCompliance ? ["compliance" as const] : []),
        "security", "notifications", "privacy", "help",
      ]),
      inviteRoles: canManageEntity ? CORPORATE_INVITE_ROLES : [],
    };
  }

  if (userType === "micro") {
    return {
      roleLabel: "صاحب منشأة صغيرة",
      entityLabel: "منشأة صغيرة",
      canManageEntity: true,
      canManageTeam: false,
      canManageBilling: true,
      canManageCompliance: false,
      canInviteTeam: false,
      canUseProfession: false,
      canUseSignature: false,
      canUseDelegation: false,
      canUseReferral: false,
      showPayments: true,
      showSubscription: true,
      visibleTabs: uniqueTabs(["profile", "entity", "invoice", "security", "notifications", "privacy", "payments", "subscription", "help"]),
      inviteRoles: [],
    };
  }

  if (userType === "government") {
    const canManageEntity = governmentRole === "gov_counsel";
    return {
      roleLabel: governmentRole === "judge" ? "قاضي" : governmentRole === "prosecutor" ? "عضو نيابة/ادعاء" : governmentRole === "officer" ? "ضابط/محقق" : "مستشار حكومي",
      entityLabel: "جهة حكومية",
      canManageEntity,
      canManageTeam: canManageEntity,
      canManageBilling: false,
      canManageCompliance: canManageEntity,
      canInviteTeam: canManageEntity,
      canUseProfession: false,
      canUseSignature: false,
      canUseDelegation: canManageEntity,
      canUseReferral: false,
      showPayments: false,
      showSubscription: false,
      visibleTabs: uniqueTabs([
        "profile", "role-scope",
        ...(canManageEntity ? ["entity" as const, "team" as const, "delegation" as const, "compliance" as const] : []),
        // 2026-09-02 — «نفاذ / الهوية» was here. The tab it named ran a
        // setTimeout: type any national ID, watch a hard-coded «74» appear as
        // the Nafath challenge code, and four seconds later the header read
        // «نفاذ مربوط بنجاح» over four invented identity rows. No Nafath/SSO
        // integration exists and the platform has no authority to claim one,
        // least of all to the government accounts this tab was mandatory for.
        // Identity is verified by hand — see the note in ProfileTab.
        "security", "notifications", "privacy", "help",
      ]),
      inviteRoles: canManageEntity ? GOVERNMENT_INVITE_ROLES : [],
    };
  }

  if (userType === "ngo") {
    return {
      roleLabel: "إدارة جمعية/وقف",
      entityLabel: "جمعية/وقف",
      canManageEntity: true,
      canManageTeam: true,
      canManageBilling: true,
      canManageCompliance: true,
      canInviteTeam: true,
      canUseProfession: false,
      canUseSignature: false,
      canUseDelegation: true,
      canUseReferral: false,
      showPayments: false,
      showSubscription: true,
      visibleTabs: uniqueTabs(["profile", "role-scope", "entity", "team", "delegation", "compliance", "subscription", "security", "notifications", "privacy", "help"]),
      inviteRoles: NGO_INVITE_ROLES,
    };
  }

  return {
    roleLabel: "مستخدم",
    canManageEntity: false,
    canManageTeam: false,
    canManageBilling: false,
    canManageCompliance: false,
    canInviteTeam: false,
    canUseProfession: false,
    canUseSignature: false,
    canUseDelegation: false,
    canUseReferral: false,
    showPayments: false,
    showSubscription: false,
    visibleTabs: ALWAYS_SIMPLE,
    inviteRoles: [],
  };
}
