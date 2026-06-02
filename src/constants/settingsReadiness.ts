import type { UserSession } from "@/hooks/useUser";
import type { SettingsTabId } from "@/types/settingsBackendReady";

export const SETTINGS_BACKEND_READY_MESSAGE =
  "محلي وجاهز للباك إند: لا يوجد حفظ خادمي أو إرسال بريد أو RBAC إنتاجي في هذه المرحلة.";

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
  canUseNafath: boolean;
  canUseReferral: boolean;
  showPayments: boolean;
  showSubscription: boolean;
  visibleTabs: SettingsTabId[];
  seatPolicy?: SettingsSeatPolicy;
  inviteRoles: SettingsRoleOption[];
  personalOnlyNotice?: string;
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

const CORPORATE_INVITE_ROLES: SettingsRoleOption[] = [
  { value: "legal_manager", label: "مدير الشؤون القانونية", scope: "entity", seatType: "professional" },
  { value: "legal_staff", label: "أخصائي قانوني", scope: "department", seatType: "professional" },
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

function isCorporateEntityManager(role?: string): boolean {
  return ["owner", "legal_manager", "hr_manager"].includes(role ?? "owner");
}

function isCorporateBillingManager(role?: string): boolean {
  return ["owner", "finance_manager"].includes(role ?? "owner");
}

function isCorporateComplianceManager(role?: string): boolean {
  return ["owner", "legal_manager", "compliance_officer"].includes(role ?? "owner");
}

export function getSettingsRolePolicy(user: UserSession): SettingsRolePolicy {
  const { userType, tier, subRole, businessRole, governmentRole, affiliation } = user;
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
      canUseNafath: false,
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
      canUseNafath: false,
      canUseReferral: true,
      showPayments: true,
      showSubscription: false,
      visibleTabs: uniqueTabs(["profile", "security", "notifications", "privacy", "payments", "referral", "help"]),
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
      canUseNafath: false,
      canUseReferral: true,
      showPayments: true,
      showSubscription: true,
      visibleTabs: uniqueTabs([
        "profile", "profession", "signature", "delegation",
        ...(canInviteTeam ? ["team" as const] : []),
        "security", "notifications", "privacy", "payments", "subscription", "referral", "help",
      ]),
      seatPolicy: canInviteTeam
        ? { label: "مقاعد المساعدين", used: 2, included: 3, unit: "مقعد", overLimitMessage: "مقاعد المساعدين ممتلئة؛ تحتاج مقعداً إضافياً أو ترقية خطة." }
        : undefined,
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
      canUseNafath: false,
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
      canUseNafath: false,
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
      seatPolicy: { label: "مقاعد المكتب", used: 7, included: 10, unit: "مقعد", overLimitMessage: "المقاعد المضمنة ممتلئة؛ يمكن طلب مقعد إضافي من مدير الخطة." },
      inviteRoles: canManageTeam ? FIRM_INVITE_ROLES : [],
    };
  }

  if (userType === "corporate") {
    const canManageEntity = isCorporateEntityManager(businessRole);
    const canManageBilling = isCorporateBillingManager(businessRole);
    const canManageCompliance = isCorporateComplianceManager(businessRole);
    return {
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
      canUseNafath: false,
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
      seatPolicy: { label: "مقاعد الشركة", used: 12, included: 25, unit: "مستخدم", overLimitMessage: "وصلت الشركة إلى حد المقاعد؛ اطلب مقاعد إضافية من المالك أو مدير الفوترة." },
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
      canUseNafath: false,
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
      canUseNafath: true,
      canUseReferral: false,
      showPayments: false,
      showSubscription: false,
      visibleTabs: uniqueTabs([
        "profile", "role-scope",
        ...(canManageEntity ? ["entity" as const, "team" as const, "delegation" as const, "compliance" as const] : []),
        "nafath", "security", "notifications", "privacy", "help",
      ]),
      seatPolicy: { label: "مستخدمي الجهة", used: 28, included: 50, unit: "مستخدم", overLimitMessage: "عدد المستخدمين الحكوميين يحتاج موافقة عقد/SSO من أدمن نظامي." },
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
      canUseNafath: false,
      canUseReferral: false,
      showPayments: false,
      showSubscription: true,
      visibleTabs: uniqueTabs(["profile", "role-scope", "entity", "team", "delegation", "compliance", "subscription", "security", "notifications", "privacy", "help"]),
      seatPolicy: { label: "أعضاء ومتطوعون", used: 5, included: 10, unit: "عضو", overLimitMessage: "الحد الحالي للأعضاء ممتلئ؛ تحتاج تفعيل خطة مؤسسية أو زيادة حد المتطوعين." },
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
    canUseNafath: false,
    canUseReferral: false,
    showPayments: false,
    showSubscription: false,
    visibleTabs: ALWAYS_SIMPLE,
    inviteRoles: [],
  };
}
