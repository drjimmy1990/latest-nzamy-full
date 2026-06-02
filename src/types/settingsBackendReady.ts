import type {
  AffiliationRole,
  BusinessRole,
  GovernmentRole,
  ProviderRole,
  SubRole,
  UserTier,
  UserType,
} from "@/hooks/useUser";

export type SettingsReadinessStatus = "UI Working" | "Backend-ready" | "Missing UI" | "Risk";

export type SettingsTabId =
  | "profile"
  | "role-scope"
  | "entity"
  | "team"
  | "profession"
  | "signature"
  | "delegation"
  | "nafath"
  | "invoice"
  | "compliance"
  | "security"
  | "notifications"
  | "privacy"
  | "payments"
  | "subscription"
  | "referral"
  | "help";

export interface SettingsProfileContract {
  userId: string;
  userType: UserType;
  subRole?: SubRole;
  businessRole?: BusinessRole;
  governmentRole?: GovernmentRole;
  activeRoles?: ProviderRole[];
  affiliationRole?: AffiliationRole;
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  professionalLicenseNumber?: string;
  specializationTags?: string[];
  status: SettingsReadinessStatus;
}

export interface SettingsEntityContract {
  entityId: string;
  entityType: Exclude<UserType, "individual" | "lawyer" | "provider" | "admin" | null>;
  displayName: string;
  licenseNumber?: string;
  crNumber?: string;
  taxNumber?: string;
  officialEmail?: string;
  seatsIncluded?: number;
  seatsUsed?: number;
  planName?: string;
  status: SettingsReadinessStatus;
}

export interface SettingsTeamInviteContract {
  inviteId: string;
  entityId?: string;
  inviterUserId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  scope: "personal" | "entity" | "department" | "case";
  seatType: "assistant" | "member" | "professional";
  expiresAt: string;
  status: "draft" | "pending" | "accepted" | "expired" | "revoked";
  statusNote: SettingsReadinessStatus;
}

export interface SettingsRoleVisibilityContract {
  userType: UserType;
  businessRole?: BusinessRole;
  governmentRole?: GovernmentRole;
  affiliationRole?: AffiliationRole;
  visibleTabs: SettingsTabId[];
  canManageEntity: boolean;
  canManageTeam: boolean;
  canManageBilling: boolean;
  canManageCompliance: boolean;
  status: SettingsReadinessStatus;
}

export interface SettingsPreferenceContract {
  userId: string;
  language: "ar" | "en";
  theme: "light" | "dark";
  calendarType: "hijri" | "miladi" | "both";
  notificationChannels: Array<"email" | "sms" | "whatsapp" | "in_app">;
  privacyLevel: "simple" | "professional" | "entity";
  tier?: UserTier;
}

export interface SettingsAuditEvent {
  eventId: string;
  actorUserId: string;
  entityId?: string;
  targetType: "profile" | "entity" | "team_invite" | "role" | "billing" | "security" | "preferences";
  targetId?: string;
  action: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  status: SettingsReadinessStatus;
}
