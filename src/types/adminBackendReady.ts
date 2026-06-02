export type AdminReadinessStatus = "UI Working" | "Backend-ready" | "Missing UI" | "Risk";

export type AdminDiscountType = "percentage" | "fixed";
export type AdminCouponStatus = "active" | "scheduled" | "expired" | "disabled";
export type AdminCouponType = "discount" | "points" | "free_plan";
export type AdminEligibleRole =
  | "client"
  | "business"
  | "micro"
  | "lawyer"
  | "firm"
  | "provider"
  | "government"
  | "ngo";

/** سجل استخدام واحد لكوبون — Backend-ready */
export interface CouponUsageRecord {
  usedBy: string;
  usedByRole: AdminEligibleRole;
  usedAt: string;
  usedFromDevice: string; // "Desktop Chrome" — no IP
  appliedTo: string;
  discountApplied: number;
}

export interface AdminCoupon {
  code: string;
  discountType: AdminDiscountType;
  value: number;
  usageLimit: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string;
  status: AdminCouponStatus;
  eligibleRoles: AdminEligibleRole[];
  // 🆕 حقول التتبع — Backend-ready
  couponType?: AdminCouponType;
  pointsGranted?: number;
  planGranted?: string;
  createdAt?: string;
  createdByAdmin?: string;
  createdFromDevice?: string;
  usageLog?: CouponUsageRecord[];
}

// ─── روابط ترويجية لمقدمي الخدمات ───────────────────────────────────────────

export type PromoLinkStatus = "active" | "paused" | "expired" | "depleted";
export type PromoLinkType = "percentage_off" | "fixed_off" | "free";

/** سجل استخدام رابط ترويجي — Backend-ready */
export interface PromoLinkUsage {
  clientName: string;
  clientId: string;
  usedAt: string;
  serviceBooked: string;
  originalPrice: number;
  finalPrice: number;
  isNewClient: boolean;
}

/**
 * رابط ترويجي يُنشئه محامي/مزود ويروّج به لخدماته — Backend-ready.
 * المزود لا يدفع شيئاً؛ الخصم يطبّق على حصة المنصة أو يُتفق عليه.
 */
export interface ProviderPromoLink {
  id: string;
  slug: string;
  fullUrl: string;
  // المزود
  providerId: string;
  providerName: string;
  providerType: "lawyer" | "firm" | "provider";
  // العرض
  promoType: PromoLinkType;
  value: number;
  targetService: string;
  targetServiceLabel: string;
  // الحدود
  maxUses: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string;
  status: PromoLinkStatus;
  // التتبع
  createdAt: string;
  createdFromDevice?: string;
  usageLog: PromoLinkUsage[];
  // إحصائيات
  totalClicks: number;
  conversionRate: number;
}

export type AdminTeamAccessLevel =
  | "Super Admin"
  | "Legal Reviewer"
  | "Content Editor"
  | "Community Moderator"
  | "Support Agent";

export type AdminTeamMemberStatus = "active" | "suspended" | "pending";

export interface AdminTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  accessLevel: AdminTeamAccessLevel;
  permissions: string[];
  status: AdminTeamMemberStatus;
  lastActive: string;
}

export type PlatformContentType = "article" | "law" | "page";
export type PlatformContentStatus = "published" | "draft" | "review" | "archived";

export interface PlatformContentItem {
  id: string;
  type: PlatformContentType;
  title: string;
  status: PlatformContentStatus;
  seoScore?: number;
  author: string;
  revision: number;
  publishedAt?: string;
}

export interface LegalLibrarySystem {
  id: string;
  title: string;
  category: string;
  sourceUrl: string;
  articlesCount: number;
  amendmentsCount: number;
  status: Extract<PlatformContentStatus, "published" | "draft" | "archived">;
  lastUpdated: string;
}

export type CommunityModerationStatus = "pending" | "approved" | "rejected" | "escalated";

export interface CommunityModerationItem {
  id: string;
  postId: string;
  postTitle: string;
  reportReason: string;
  reporter: string;
  assignedModerator?: string;
  status: CommunityModerationStatus;
  createdAt: string;
}

export interface AdminAuditEvent {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
}

export type AdminPricingScope =
  | "individual"
  | "business"
  | "micro"
  | "lawyer"
  | "firm"
  | "provider"
  | "government"
  | "ngo"
  | "platform";

export type AdminPricingStatus = "live" | "beta" | "draft" | "disabled";
export type AdminPricingModel = "one_time" | "monthly" | "annual" | "annual_seats_points" | "points_topup" | "hybrid_annual_points" | "commission_tiered" | "platform_fee" | "custom_contract";

export interface AdminPricingItem {
  id: string;
  scope: AdminPricingScope;
  name: string;
  priceMonthly: number;
  priceYearly?: number;
  includedCredits?: number;
  pricingModel?: AdminPricingModel;
  baseSeats?: number;
  minMonthlyCommitment?: number;
  extraSeatPrice?: number;
  maxSeats?: number | null;
  billingMetric?: "seat" | "points" | "case" | "service" | "percentage" | "custom";
  platformFeePct?: number;
  status: AdminPricingStatus;
  betaLocked: boolean;
  notes: string;
}

export type AdminFeatureEnvironment = "production" | "staging" | "beta";
export type AdminFeatureCategory = "AI" | "Marketplace" | "Beta" | "Core" | "Billing" | "Content";

export interface AdminFeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  category: AdminFeatureCategory;
  environments: Record<AdminFeatureEnvironment, boolean>;
  teardownNote: string;
}
