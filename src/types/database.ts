/**
 * Database types matching the Supabase schema.
 * Generated from Phase 1 migrations (001-005).
 *
 * These types are used throughout the application for type-safe
 * database queries with the Supabase client.
 */

// ============================================================
// ENUMS (matching CHECK constraints)
// ============================================================

export type UserType = 'individual' | 'lawyer' | 'firm' | 'corporate' | 'micro' | 'provider' | 'government' | 'ngo' | 'admin';

export type SubscriptionTier = 'free' | 'ai' | 'pro' | 'corp' | 'max';

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing';

export type BillingCycle = 'monthly' | 'yearly' | 'custom';

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export type ProviderSubRole = 'notary' | 'arbitrator' | 'bailiff';

export type CreditTransactionKind = 'purchase' | 'usage' | 'expiry' | 'refund' | 'promo' | 'admin_adjustment';

export type CouponDiscountType = 'percentage' | 'fixed' | 'points_grant' | 'plan_upgrade';

export type EscrowStatus = 'held' | 'released' | 'disputed' | 'refunded' | 'cancelled';

export type CommunityCategory = 'general' | 'labor' | 'commercial' | 'criminal' | 'family' | 'real_estate' | 'administrative' | 'intellectual_property' | 'international' | 'other';

export type CommunityVisibility = 'public' | 'lawyers_only' | 'private';

export type ChatRoomType = 'direct' | 'group' | 'service' | 'case' | 'consultation';

export type ChatMessageType = 'text' | 'file' | 'image' | 'audio' | 'system' | 'ai_response';

export type MarketplaceListingType = 'need' | 'offer' | 'collaboration';

export type AuditActorType = 'user' | 'admin' | 'system' | 'n8n' | 'api';

export type LegalSystem = 'civil' | 'common' | 'islamic' | 'mixed' | 'hybrid';

export type JurisdictionReadiness = 'live_research' | 'partial_db' | 'full_presence';

// Firm member roles
export type FirmRole =
  | 'managing_partner' | 'partner' | 'senior_lawyer' | 'lawyer'
  | 'trainee' | 'legal_secretary' | 'office_admin' | 'finance_manager'
  | 'hr_manager' | 'compliance_manager' | 'external_of_counsel'
  | 'legal_consultant' | 'in_house_counsel';

// Business member roles
export type BusinessRole =
  | 'owner' | 'legal_manager' | 'legal_staff' | 'compliance_officer'
  | 'seconded' | 'department_head' | 'hr_manager' | 'finance_manager' | 'employee';

// Government member roles
export type GovernmentRole = 'judge' | 'prosecutor' | 'officer' | 'counsel' | 'clerk' | 'admin';

// NGO member roles
export type NgoRole = 'director' | 'board_member' | 'legal_advisor' | 'program_manager' | 'volunteer_coordinator' | 'admin' | 'volunteer';

// ============================================================
// TABLE TYPES
// ============================================================

/** Extended user profile linked to auth.users */
export interface Profile {
  id: string; // uuid, FK to auth.users
  user_type: UserType;
  display_name: string;
  display_name_en: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  country_code: string;
  language: 'ar' | 'en';
  calendar_type: 'hijri' | 'miladi' | 'both';
  theme: 'light' | 'dark' | 'system';
  verified_at: string | null;
  nafath_verified: boolean;
  onboarding_completed: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Lawyer-specific profile data */
export interface LawyerProfile {
  user_id: string;
  license_number: string | null;
  license_expiry: string | null;
  bar_association: string | null;
  specialties: string[];
  years_experience: number;
  bio_ar: string;
  bio_en: string;
  hourly_rate: number | null;
  credit_balance: number;
  credit_package: string | null;
  credit_expiry: string | null;
  free_briefs_remaining: number;
  marketplace_visible: boolean;
  is_accepting_clients: boolean;
  city: string | null;
  active_roles: string[];
  display_mode: 'full' | 'light';
  verification_status: VerificationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Service provider profile (notary, arbitrator, bailiff) */
export interface ProviderProfile {
  user_id: string;
  sub_role: ProviderSubRole;
  license_number: string | null;
  license_expiry: string | null;
  service_areas: string[];
  availability: {
    days: string[];
    hours: { start: string; end: string };
  };
  hourly_rate: number | null;
  verification_status: VerificationStatus;
  marketplace_visible: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Micro/small business profile */
export interface MicroProfile {
  user_id: string;
  business_name: string;
  business_type: string | null;
  employee_count: number;
  license_count: number;
  requirements_score: number;
  litigation_boundary: 'advisory_only' | 'marketplace_escalation' | 'case_tracking';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Law firm entity */
export interface FirmProfile {
  id: string;
  owner_user_id: string;
  name_ar: string;
  name_en: string;
  license_number: string | null;
  license_expiry: string | null;
  size: 'solo' | 'small' | 'medium' | 'large' | 'enterprise';
  structure: 'single_office' | 'multi_branch' | 'virtual' | 'hybrid';
  practice_model: 'general' | 'specialized' | 'boutique' | 'full_service';
  branches: unknown[];
  departments: unknown[];
  plan_id: string | null;
  annual_points_budget: number;
  points_spent: number;
  max_seats: number;
  display_mode: 'full' | 'light';
  verification_status: VerificationStatus;
  branding: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Firm membership record */
export interface FirmMember {
  id: string;
  firm_id: string;
  user_id: string;
  role: FirmRole;
  department: string | null;
  permissions: string[];
  status: 'invited' | 'active' | 'suspended' | 'removed';
  invited_at: string;
  accepted_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Corporate entity */
export interface BusinessProfile {
  id: string;
  owner_user_id: string;
  company_name_ar: string;
  company_name_en: string;
  cr_number: string | null;
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  legal_structure: 'sole_proprietorship' | 'llc' | 'closed_jsc' | 'listed_jsc' | 'partnership' | 'branch_foreign' | 'holding' | 'government_owned';
  service_model: 'internal' | 'external' | 'hybrid';
  has_legal_dept: boolean;
  plan_id: string | null;
  verification_status: VerificationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Business membership record */
export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessRole;
  department: string | null;
  permissions: string[];
  status: 'invited' | 'active' | 'suspended' | 'removed';
  invited_at: string;
  accepted_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Government entity */
export interface GovernmentProfile {
  id: string;
  owner_user_id: string;
  entity_name_ar: string;
  entity_name_en: string;
  entity_type: 'court' | 'prosecution' | 'ministry' | 'authority' | 'commission' | 'municipality' | 'other';
  role: GovernmentRole;
  verification_status: VerificationStatus;
  integrations: unknown[];
  restricted_from: string[];
  plan_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** NGO entity */
export interface NgoProfile {
  id: string;
  owner_user_id: string;
  org_name_ar: string;
  org_name_en: string;
  org_type: 'charity' | 'waqf' | 'foundation' | 'campaign' | 'association' | 'other';
  volunteer_count: number;
  program_count: number;
  board_seats: number;
  compliance_status: 'pending' | 'compliant' | 'warning' | 'non_compliant';
  reporting_cycle: 'monthly' | 'quarterly' | 'biannual' | 'annual';
  plan_id: string | null;
  verification_status: VerificationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Subscription plan catalog entry */
export interface SubscriptionPlan {
  id: string;
  tier: SubscriptionTier;
  audience: UserType;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  price_monthly: number;
  price_yearly: number;
  features: Array<{
    key: string;
    label_ar: string;
    label_en?: string;
    included: boolean;
  }>;
  limits: {
    ai_queries_per_day?: number;
    storage_gb?: number;
    team_seats?: number;
    [key: string]: unknown;
  };
  sort_order: number;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Active user subscription */
export interface Subscription {
  id: string;
  user_id: string;
  entity_id: string | null;
  entity_type: 'firm' | 'business' | 'government' | 'ngo' | null;
  plan_id: string;
  tier: SubscriptionTier;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  started_at: string;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at: string | null;
  cancelled_at: string | null;
  auto_renew: boolean;
  payment_method_id: string | null;
  external_subscription_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Credit package catalog */
export interface CreditPackage {
  id: string;
  name_ar: string;
  name_en: string;
  price_sar: number;
  credits: number;
  bonus_pct: number;
  total_credits: number;
  validity_months: number;
  sort_order: number;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Credit transaction ledger entry */
export interface CreditTransaction {
  id: number;
  user_id: string;
  package_id: string | null;
  amount: number;
  kind: CreditTransactionKind;
  balance_after: number;
  service_id: string | null;
  request_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Promotional coupon */
export interface Coupon {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  points_granted: number;
  plan_granted: string | null;
  min_order_amount: number;
  eligible_user_types: string[];
  eligible_plan_tiers: string[];
  max_uses: number | null;
  max_uses_per_user: number;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Escrow transaction for marketplace */
export interface EscrowTransaction {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  platform_fee: number;
  currency: string;
  status: EscrowStatus;
  released_at: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Community Q&A post */
export interface CommunityPost {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: CommunityCategory;
  visibility: CommunityVisibility;
  status: 'active' | 'closed' | 'moderated' | 'deleted';
  is_pinned: boolean;
  vote_count: number;
  answer_count: number;
  view_count: number;
  accepted_answer_id: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Community Q&A answer */
export interface CommunityAnswer {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  is_lawyer_verified: boolean;
  vote_count: number;
  status: 'active' | 'moderated' | 'deleted';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Chat room */
export interface ChatRoom {
  id: string;
  request_id: string | null;
  case_id: string | null;
  name: string;
  room_type: ChatRoomType;
  status: 'active' | 'archived' | 'closed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Chat message */
export interface ChatMessage {
  id: number;
  room_id: string;
  sender_id: string;
  body: string;
  message_type: ChatMessageType;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Marketplace listing */
export interface MarketplaceListing {
  id: string;
  owner_id: string;
  owner_type: 'lawyer' | 'firm' | 'corporate';
  title: string;
  description: string;
  category: string;
  specialty: string[];
  listing_type: MarketplaceListingType;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  deadline: string | null;
  status: 'draft' | 'active' | 'matched' | 'completed' | 'cancelled' | 'expired';
  visibility: 'public' | 'verified_only' | 'invited_only';
  views_count: number;
  offers_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Jurisdiction registry entry */
export interface Jurisdiction {
  id: string;
  name_ar: string;
  name_en: string;
  flag_emoji: string;
  legal_system: LegalSystem;
  phase: 1 | 2 | 3;
  readiness: JurisdictionReadiness;
  currency: string;
  timezone: string;
  disclaimer_ar: string;
  disclaimer_en: string;
  trusted_sources: unknown[];
  sub_jurisdictions: unknown[];
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Service review */
export interface Review {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  request_id: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  is_anonymous: boolean;
  status: 'pending' | 'active' | 'moderated' | 'deleted';
  response: string | null;
  response_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Feature flag */
export interface FeatureFlag {
  id: string;
  category: 'AI' | 'Marketplace' | 'Beta' | 'Core' | 'Billing' | 'Content' | 'Security';
  label_ar: string;
  label_en: string;
  enabled_production: boolean;
  enabled_staging: boolean;
  enabled_beta: boolean;
  eligible_user_types: string[];
  metadata: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Admin audit event */
export interface AdminAuditEvent {
  id: number;
  actor_id: string | null;
  actor_type: AuditActorType;
  action: string;
  target_type: string;
  target_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// WORKFLOW & REQUEST TYPES (from 20260518 migration)
// ============================================================

export type ServiceRequestStatus =
  | 'draft' | 'pending' | 'pending_payment' | 'pending_assignment'
  | 'assigned' | 'in_review' | 'completed' | 'cancelled';

export type ServiceRequestPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Service request */
export interface ServiceRequest {
  id: string;
  requester_user_id: string;
  type: string;
  title: string;
  description: string | null;
  requester: Record<string, unknown> | null;
  receiver: string | null;
  assigned_to: string | null;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  budget: number | null;
  category: string | null;
  payment: Record<string, unknown> | null;
  source_path: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Request event (audit trail for service requests) */
export interface RequestEvent {
  id: number;
  request_id: string;
  event: string;
  actor_user_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** File attachment */
export interface Attachment {
  id: number;
  request_id: string | null;
  owner_user_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** Notification */
export interface Notification {
  id: number;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Wallet transaction */
export interface WalletTransaction {
  id: string;
  user_id: string;
  amount: number;
  kind: 'credit' | 'debit' | 'refund' | 'withdrawal' | 'escrow_hold' | 'escrow_release';
  description: string;
  reference_id: string | null;
  reference_type: string | null;
  balance_after: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** User settings/preferences */
export interface UserSettings {
  user_id: string;
  notifications_enabled: boolean;
  email_notifications: boolean;
  whatsapp_notifications: boolean;
  push_notifications: boolean;
  newsletter: boolean;
  marketing_emails: boolean;
  two_factor_enabled: boolean;
  session_timeout_minutes: number;
  data_sharing_consent: boolean;
  analytics_consent: boolean;
  preferences: Record<string, unknown>;
  updated_at: string;
}
