/**
 * useUser — User context hook
 * ─────────────────────────────────────────────────────────
 * PRODUCTION: Replace the ⚠️ DEMO BLOCK below with real auth
 * (e.g. Supabase, next-auth, or JWT).
 *
 * ⚠️  Files to delete before production:
 *   • src/lib/demo-accounts.ts
 *   • src/app/demo-login/page.tsx
 *   • the DEMO BLOCK in this file (lines marked below)
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { LAWYER_AI_PERMISSION_KEYS } from "@/constants/lawyerAiCatalog";
import { isDbUserType } from "@/lib/auth/userTypes";
import { mergeMembershipReads } from "@/lib/auth/entityMembership";
import type { ActiveEntityMemberships } from "@/lib/auth/entityMembership";
import { createClient } from "@/lib/supabase/client";
import {
  isSupabaseMode as isSupabaseBackend,
  BACKEND_MODE as RESOLVED_BACKEND_MODE,
} from "@/lib/runtimeMode";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserType =
  | "lawyer"
  | "firm"
  | "individual"
  | "corporate"
  | "micro"
  | "government"
  | "ngo"
  | "provider"
  | "admin"
  | null;

/** دور وظيفي داخل الجهة الحكومية */
export type GovernmentRole =
  | "judge"         // قاضي
  | "prosecutor"    // عضو نيابة عامة
  | "officer"       // ضابط
  | "gov_counsel";  // مستشار قانوني حكومي

/** تخصص الضابط */
export type OfficerSpecialty =
  | "general"    // أمن عام
  | "traffic"    // مرور
  | "detective"  // مباحث
  | "narcotics"  // مكافحة مخدرات
  | "border"     // حرس حدود
  | "passport";  // جوازات

/** دور وظيفي داخل الشركة التجارية */
export type BusinessRole =
  | "owner"             // مدير الشركة — صلاحيات كاملة
  | "legal_manager"     // رئيس الشؤون القانونية — كل القضايا والحوكمة
  | "legal_staff"       // أخصائي قانوني — قضاياه فقط
  | "compliance_officer"// مسؤول الامتثال — ZATCA, PDPL, SAMA
  | "seconded"          // منتدب من نظامي — ملفات محددة
  | "department_head"   // مدير قسم — يرفع طلبات فقط
  | "hr_manager"        // مدير الموارد البشرية
  | "finance_manager"   // المدير المالي
  | "employee";         // موظف عام

export type SubRole =
  | "solo"
  | "trainee"
  | "partner"
  | "notary"
  | "bailiff"
  | "arbitrator"
  | "manager"
  | null;

/**
 * active_roles — الأدوار الإضافية النشطة للمستخدم (Multi-Role)
 * القاعدة: لا نجلب أدوات أضعف مما يملكه المستخدم أصلاً.
 * مثال: محامي + موثق → تُضاف أدوات التوثيق فقط لو ليست موجودة أصلاً.
 * مثال: محامي + مراجع → تُضاف أدوات المراجعة/التعقيب.
 * ملاحظة: تم حذف "translator" — الذكاء الاصطناعي يغني عن هذا الدور.
 */
export type ProviderRole = "notary" | "arbitrator" | "bailiff";

export type UserTier = "free" | "shield" | "ai" | "pro" | "max" | "corp" | "enterprise";

export type AffiliationRole =
  | "managing_partner"    // شريك مدير (كل الصلاحيات)
  | "partner"             // شريك
  | "senior_lawyer"       // محامي أول
  | "lawyer"              // محامي
  | "trainee"             // متدرب
  | "legal_secretary"     // سكرتير قانوني
  | "office_admin"        // مدير مكتب
  | "finance_manager"     // مدير مالي
  | "hr_manager"          // مدير موارد بشرية
  | "compliance_manager"  // مدير امتثال ومخاطر
  | "external_of_counsel" // مستشار خارجي
  | "legal_consultant"    // مستشار قانوني (خارجي)
  | "in_house_counsel";   // مستشار قانوني داخلي (لشركة تجارية)

export interface Affiliation {
  entityName:  string;                       // اسم الكيان
  entityType:  "firm" | "corporate";         // شركة محاماة أم تجارية
  role:        AffiliationRole;              // دوره داخل الكيان
}

/**
 * What the `profiles` read for THIS signed-in user actually said.
 *
 * Absent (undefined) for a guest — a visitor with no session has no profile
 * state, and conflating the two is exactly what UserTypeGuard has to tell apart.
 *   ok           → a row with a recognised `user_type` (or one carried forward
 *                  from the previous successful read for this same user).
 *   missing      → the query succeeded and there is no usable type: no row, or
 *                  a row whose `user_type` is null/empty. The account exists in
 *                  Auth but its profile is incomplete.
 *   unavailable  → the query itself failed. Says nothing about the user.
 */
export type ProfileState = "ok" | "missing" | "unavailable";

/**
 * How much the session knows about this user's ENTITY memberships — WP-6
 * B-8/B-9. Kept apart from ProfileState because the two answer different
 * questions and can disagree: `profiles.user_type` can read fine while the
 * `business_members` policy throws.
 *
 *   ok           all four membership reads answered.
 *   degraded     at least one failed, so `businessRole` / `affiliation` may be
 *                an UNDERCOUNT. A permission check that denies by default must
 *                be able to say so rather than behave as if the user simply
 *                has no role.
 *   unavailable  every read failed; the session knows nothing about memberships.
 */
export type MembershipState = "ok" | "degraded" | "unavailable";

export interface UserSession {
  isLoggedIn:    boolean;
  userId?:       string;
  userType:      UserType;
  /** See ProfileState. Undefined for a guest. */
  profileState?: ProfileState;
  /** See MembershipState. Undefined for a guest. */
  membershipState?: MembershipState;
  subRole:       SubRole;
  name:          string;
  avatar?:       string;
  tier:          UserTier;
  credits:       number;
  creditsMax:    number;
  dashboardMode: "light" | "full";
  permissions:   UserPermission[];
  businessType?:       string;
  providerSpecialties?: string[];  // فئات الخدمات المتاحة لمزود الخدمة
  affiliation?:  Affiliation;      // محامي تحت كيان معنوي
  firmMembership?: {
    entityId: string;
    entityName: string;
    role: AffiliationRole;
  };
  // ─── حقول الجهة الحكومية ───────────────────────────────
  governmentRole?:  GovernmentRole;   // القاضي / عضو النيابة / الضابط / المستشار
  officerSpecialty?: OfficerSpecialty; // تخصص الضابط إذا كان governmentRole = "officer"
  // ─── حقول الشركة التجارية ──────────────────────────────
  businessRole?:   BusinessRole;      // دور الموظف داخل الشركة
  businessMembership?: {
    entityId: string;
    entityName: string;
    role: BusinessRole;
  };
  // ─── الأدوار المتعددة (Multi-Role) ─────────────────────
  /**
   * active_roles: أدوار إضافية مفعّلة للمستخدم.
   * القاعدة الذهبية: sidebar يدمج الأقسام الفريدة فقط —
   * إذا كان المستخدم محامياً، لا نضيف أدوات الموثق الأضعف.
   * نضيف فقط ما هو فريد وغير موجود في دوره الأصلي.
   */
  active_roles?: ProviderRole[];      // مثال: ["notary"] أو ["notary","bailiff"]
  country?:      string;              // البلد (مثال: SA, AE, EG, JO)
}

export type UserPermission =
  | "ai:draft"
  | "ai:case-brief"
  | "ai:quick-answer"
  | "ai:contracts"
  | "ai:collector"
  | "ai:contract-drafter"
  | "ai:wargaming"
  | "ai:analyze-strength"
  | "ai:legal-opinion"
  | "ai:monitor"
  | "ai:brief-check"
  | "ai:consult"
  | "ai:secretary"
  | "ai:procedures"
  | "ai:analyze"
  | "ai:fee-calculator"
  | "ai:najiz-optimizer"
  | "ai:direction-support"
  | "ai:legal-translate"
  | "ai:transcriber"
  | "ai:compare"
  | "ai:communicate"
  | "ai:assistant"
  | "ai:tracker"
  | "ai:report-generator"
  | "ai:mail-advisor"
  | "ai:corp:advisor"
  | "ai:corp:clm"
  | "ai:corp:compliance"
  | "ai:corp:hr"
  | "ai:micro"
  // ─── أدوات القاضي ──────────────────────────────────────
  | "ai:gov:judgment-weigher"     // مُرجّح الأحكام
  | "ai:gov:judicial-search"      // باحث المبادئ القضائية
  | "ai:gov:judgment-drafter"     // صائغ الأحكام
  | "ai:gov:jurisdiction-analyzer" // محلل الاختصاص
  // ─── أدوات عضو النيابة ────────────────────────────────
  | "ai:gov:indictment-drafter"   // صائغ لائحة الاتهام
  | "ai:gov:evidence-analyzer"    // محلل الأدلة
  | "ai:gov:investigation-forms"  // نماذج التحقيق
  | "ai:gov:guarantees-checker"   // مراجع الضمانات
  | "ai:gov:deadline-calculator"  // حاسبة المواعيد
  // ─── أدوات الضابط ─────────────────────────────────────
  | "ai:gov:arrest-forms"         // نماذج القبض والتفتيش
  | "ai:gov:incident-report"      // تقارير الحوادث
  | "ai:gov:procedure-guide"      // دليل الإجراءات
  | "ai:gov:detention-records"    // محاضر الضبط
  | "ai:gov:rights-reminder"      // مُذكّر الضمانات
  // ─── أدوات المستشار الحكومي ───────────────────────────
  | "ai:gov:procurement-reviewer" // مراجع المناقصات
  | "ai:gov:legal-opinion-drafter" // صائغ الرأي القانوني
  | "ai:gov:compliance-checker"   // مدقق الامتثال
  | "ai:gov:contract-reviewer"    // مراجع العقود الحكومية
  // ─── أدوات الجمعيات ───────────────────────────────────
  | "ai:ngo:volunteer-contract"   // صائغ عقود التطوع
  | "ai:ngo:governance-checker"   // مدقق الحوكمة
  | "ai:ngo:report-generator"     // مُعد التقارير الدورية
  | "ai:ngo:donation-analyzer"    // محلل التبرعات
  // ─── أدوات المراجع الحكومي / المعقّب ────────────────────
  | "ai:bailiff:transactions"     // مساعد المعاملات الحكومية
  | "ai:bailiff:procedures"       // دليل الإجراءات
  | "ai:bailiff:requirements"     // مراجع الاشتراطات
  // ─── داشبورد permissions ──────────────────────────────
  | "dashboard:team"
  | "dashboard:finance"
  | "dashboard:analytics"
  | "dashboard:hrm"
  | "cases:assign";

// ─── Permission sets per tier ─────────────────────────────────────────────────

const LAWYER_AI_PERMISSIONS = [...LAWYER_AI_PERMISSION_KEYS] as UserPermission[];
const ADMIN_AI_PERMISSIONS: UserPermission[] = [
  ...LAWYER_AI_PERMISSIONS,
  "ai:tracker",
  "ai:report-generator",
  "ai:mail-advisor",
  "ai:corp:advisor",
  "ai:corp:clm",
  "ai:corp:compliance",
  "ai:corp:hr",
  "ai:micro",
];
const ADMIN_DASHBOARD_PERMISSIONS: UserPermission[] = [
  "dashboard:team",
  "dashboard:finance",
  "dashboard:analytics",
  "dashboard:hrm",
  "cases:assign",
];

const PERMISSIONS: Record<string, Record<UserTier, UserPermission[]>> = {
  lawyer: {
    free:       LAWYER_AI_PERMISSIONS,
    shield:     LAWYER_AI_PERMISSIONS,
    ai:         LAWYER_AI_PERMISSIONS,
    pro:        [...LAWYER_AI_PERMISSIONS, "dashboard:finance", "dashboard:analytics"],
    max:        [...LAWYER_AI_PERMISSIONS, "dashboard:finance", "dashboard:analytics"],
    corp:       [],
    enterprise: [],
  },
  firm: {
    free:       ["ai:consult", "ai:quick-answer"],
    shield:     ["ai:consult", "ai:quick-answer"],
    ai:         ["ai:consult", "ai:quick-answer", "ai:draft", "ai:case-brief", "ai:contracts", "ai:analyze", "ai:brief-check", "ai:fee-calculator", "dashboard:team"],
    pro:        ["ai:consult", "ai:quick-answer", "ai:draft", "ai:case-brief", "ai:contracts", "ai:analyze", "ai:brief-check", "ai:fee-calculator", "ai:wargaming", "ai:analyze-strength", "ai:legal-opinion", "ai:monitor", "ai:procedures", "ai:secretary", "ai:report-generator", "ai:corp:clm", "ai:corp:compliance", "ai:corp:advisor", "ai:corp:hr", "dashboard:team", "dashboard:finance", "dashboard:analytics", "dashboard:hrm", "cases:assign"],
    max:        ["ai:consult", "ai:quick-answer", "ai:draft", "ai:case-brief", "ai:contracts", "ai:analyze", "ai:brief-check", "ai:fee-calculator", "ai:wargaming", "ai:analyze-strength", "ai:legal-opinion", "ai:monitor", "ai:procedures", "ai:secretary", "ai:report-generator", "ai:corp:clm", "ai:corp:compliance", "ai:corp:advisor", "ai:corp:hr", "dashboard:team", "dashboard:finance", "dashboard:analytics", "dashboard:hrm", "cases:assign"],
    corp:       [],
    enterprise: [],
  },
  corporate: {
    free:       ["ai:consult"],
    shield:     ["ai:consult"],
    ai:         ["ai:consult", "ai:contracts", "ai:analyze", "ai:corp:compliance", "ai:corp:advisor", "ai:mail-advisor"],
    pro:        ["ai:consult", "ai:contracts", "ai:analyze", "ai:corp:compliance", "ai:corp:advisor", "ai:corp:hr", "ai:monitor", "ai:tracker", "ai:report-generator", "ai:mail-advisor"],
    max:        [],
    corp:       ["ai:consult", "ai:contracts", "ai:analyze", "ai:corp:compliance", "ai:corp:advisor", "ai:corp:hr", "ai:monitor", "ai:tracker", "ai:report-generator", "ai:corp:clm", "dashboard:team", "dashboard:analytics", "dashboard:finance", "ai:mail-advisor"],
    enterprise: ["ai:consult", "ai:contracts", "ai:analyze", "ai:corp:compliance", "ai:corp:advisor", "ai:corp:hr", "ai:monitor", "ai:tracker", "ai:report-generator", "ai:corp:clm", "dashboard:team", "dashboard:analytics", "dashboard:finance", "ai:mail-advisor"],
  },
  individual: {
    free:       ["ai:consult"],
    // shield = التأمين القانوني الشامل (360 ر.س/سنة)
    shield:     ["ai:consult", "ai:analyze"],
    ai:         ["ai:consult", "ai:analyze"],
    pro:        ["ai:consult", "ai:analyze", "ai:contracts"],
    max:        ["ai:consult", "ai:analyze", "ai:contracts"],
    corp:       [],
    enterprise: [],
  },
  micro: {
    free:       ["ai:consult", "ai:micro"],
    shield:     ["ai:consult", "ai:micro"],
    ai:         ["ai:consult", "ai:micro", "ai:analyze"],
    pro:        ["ai:consult", "ai:micro", "ai:analyze", "ai:contracts"],
    max:        [],
    corp:       [],
    enterprise: [],
  },
  provider: {
    // القاعدة الذهبية #10: مقدم الخدمة يحصل كحد أدنى على أدوات AI المتاحة للأفراد
    free:       ["ai:consult", "ai:analyze"],
    shield:     ["ai:consult", "ai:analyze"],
    ai:         ["ai:consult", "ai:analyze", "ai:contracts", "ai:brief-check"],
    pro:        ["ai:consult", "ai:analyze", "ai:contracts", "ai:brief-check", "ai:fee-calculator", "ai:secretary", "dashboard:finance"],
    max:        ["ai:consult", "ai:analyze", "ai:contracts", "ai:brief-check", "ai:fee-calculator", "ai:secretary", "dashboard:finance", "dashboard:analytics"],
    corp:       [],
    enterprise: [],
  },
  admin: {
    // مدير النظام — كل الصلاحيات
    free:       [...ADMIN_AI_PERMISSIONS, ...ADMIN_DASHBOARD_PERMISSIONS],
    shield:     [],
    ai:         [],
    pro:        [],
    max:        [...ADMIN_AI_PERMISSIONS, ...ADMIN_DASHBOARD_PERMISSIONS],
    corp:       [],
    enterprise: [],
  },
  // ─── الجهة الحكومية ────────────────────────────────────────────────────────
  // القاعدة: الصلاحيات الأساسية للكل + صلاحيات الدور تُضاف runtime في getDashboardRoute
  government: {
    free:       ["ai:consult", "ai:gov:contract-reviewer", "ai:gov:compliance-checker"],
    shield:     ["ai:consult", "ai:gov:contract-reviewer", "ai:gov:compliance-checker"],
    ai:         ["ai:consult", "ai:gov:contract-reviewer", "ai:gov:compliance-checker", "ai:contracts", "ai:analyze"],
    pro:        [
      "ai:consult", "ai:gov:contract-reviewer", "ai:gov:compliance-checker",
      "ai:contracts", "ai:analyze", "ai:quick-answer",
      // أدوات القاضي
      "ai:gov:judgment-weigher", "ai:gov:judicial-search", "ai:gov:judgment-drafter", "ai:gov:jurisdiction-analyzer",
      // أدوات النيابة
      "ai:gov:indictment-drafter", "ai:gov:evidence-analyzer", "ai:gov:investigation-forms",
      "ai:gov:guarantees-checker", "ai:gov:deadline-calculator",
      // أدوات الضابط
      "ai:gov:arrest-forms", "ai:gov:incident-report", "ai:gov:procedure-guide",
      "ai:gov:detention-records", "ai:gov:rights-reminder",
      // أدوات المستشار الحكومي
      "ai:gov:procurement-reviewer", "ai:gov:legal-opinion-drafter",
      "dashboard:team", "dashboard:analytics"
    ],
    max:        [
      "ai:consult", "ai:gov:contract-reviewer", "ai:gov:compliance-checker",
      "ai:contracts", "ai:analyze", "ai:quick-answer",
      "ai:gov:judgment-weigher", "ai:gov:judicial-search", "ai:gov:judgment-drafter", "ai:gov:jurisdiction-analyzer",
      "ai:gov:indictment-drafter", "ai:gov:evidence-analyzer", "ai:gov:investigation-forms",
      "ai:gov:guarantees-checker", "ai:gov:deadline-calculator",
      "ai:gov:arrest-forms", "ai:gov:incident-report", "ai:gov:procedure-guide",
      "ai:gov:detention-records", "ai:gov:rights-reminder",
      "ai:gov:procurement-reviewer", "ai:gov:legal-opinion-drafter",
      "dashboard:team", "dashboard:analytics", "dashboard:finance"
    ],
    corp:       [],
    enterprise: [
      "ai:consult", "ai:gov:contract-reviewer", "ai:gov:compliance-checker",
      "ai:contracts", "ai:analyze", "ai:quick-answer",
      "ai:gov:judgment-weigher", "ai:gov:judicial-search", "ai:gov:judgment-drafter", "ai:gov:jurisdiction-analyzer",
      "ai:gov:indictment-drafter", "ai:gov:evidence-analyzer", "ai:gov:investigation-forms",
      "ai:gov:guarantees-checker", "ai:gov:deadline-calculator",
      "ai:gov:arrest-forms", "ai:gov:incident-report", "ai:gov:procedure-guide",
      "ai:gov:detention-records", "ai:gov:rights-reminder",
      "ai:gov:procurement-reviewer", "ai:gov:legal-opinion-drafter",
      "dashboard:team", "dashboard:analytics", "dashboard:finance", "dashboard:hrm"
    ],
  },
  // ─── الجمعية الخيرية ───────────────────────────────────────────────────────
  ngo: {
    free:       ["ai:consult", "ai:ngo:volunteer-contract"],
    shield:     ["ai:consult", "ai:ngo:volunteer-contract"],
    ai:         ["ai:consult", "ai:ngo:volunteer-contract", "ai:ngo:governance-checker", "ai:contracts", "ai:analyze"],
    pro:        [
      "ai:consult", "ai:ngo:volunteer-contract", "ai:ngo:governance-checker",
      "ai:ngo:report-generator", "ai:ngo:donation-analyzer",
      "ai:contracts", "ai:analyze", "ai:quick-answer",
      "dashboard:team", "dashboard:analytics"
    ],
    max:        [
      "ai:consult", "ai:ngo:volunteer-contract", "ai:ngo:governance-checker",
      "ai:ngo:report-generator", "ai:ngo:donation-analyzer",
      "ai:contracts", "ai:analyze", "ai:quick-answer",
      "dashboard:team", "dashboard:analytics", "dashboard:finance"
    ],
    corp:       [],
    enterprise: [
      "ai:consult", "ai:ngo:volunteer-contract", "ai:ngo:governance-checker",
      "ai:ngo:report-generator", "ai:ngo:donation-analyzer",
      "ai:contracts", "ai:analyze", "ai:quick-answer",
      "dashboard:team", "dashboard:analytics", "dashboard:finance", "dashboard:hrm"
    ],
  },
  // ─── المراجع الحكومي / المعقّب ───────────────────────────────────────────────
  // subRole = "bailiff" داخل userType = "provider"
  // الأدوات: تعقيب + دليل إجراءات + أدوات المزود الأساسية
  bailiff: {
    free:       ["ai:consult", "ai:bailiff:procedures"],
    shield:     ["ai:consult", "ai:bailiff:procedures"],
    ai:         ["ai:consult", "ai:bailiff:procedures", "ai:bailiff:transactions"],
    pro:        [
      "ai:consult", "ai:analyze", "ai:brief-check",
      "ai:bailiff:transactions", "ai:bailiff:procedures",
      "ai:bailiff:requirements",
      "ai:secretary", "dashboard:finance"
    ],
    max:        [
      "ai:consult", "ai:analyze", "ai:brief-check",
      "ai:bailiff:transactions", "ai:bailiff:procedures",
      "ai:bailiff:requirements",
      "ai:secretary", "dashboard:finance", "dashboard:analytics"
    ],
    corp:       [],
    enterprise: [],
  },
};

export function getPermissions(userType: UserType, tier: UserTier): UserPermission[] {
  if (!userType) return [];
  return PERMISSIONS[userType]?.[tier] ?? [];
}

// ─── Runtime backend mode ────────────────────────────────────────────────────
// Was a local `?? "demo"` derivation (the file header's "avoid an import cycle"
// note predates runtimeMode.ts being import-free — it imports nothing, so there
// is no cycle to avoid). An unset variable used to make every dashboard trust a
// localStorage blob for "logged in"; it now resolves to supabase. See
// docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md §4 and H2.
//
// The `typeof window` guard stays: SSR has no browser session to read, and the
// demo path below is browser-only by construction (localStorage + cookies).
const BACKEND_MODE = typeof window !== "undefined" ? RESOLVED_BACKEND_MODE : "demo";
const isSupabaseMode = typeof window !== "undefined" && isSupabaseBackend;

// ─── ⚠️ DEMO BLOCK START — DELETE BEFORE PRODUCTION ─────────────────────────

export const DEMO_STORAGE_KEY = "nzamy_demo_role";
export const DEMO_KEY_STORAGE  = "nzamy_demo_key"; // stores the account key string (e.g. "admin")

// Safe import of bypass keys — if betaConfig deleted, default to empty list
let _DEMO_BYPASS_KEYS: string[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require("@/lib/betaConfig");
  _DEMO_BYPASS_KEYS = cfg.DEMO_BYPASS_KEYS ?? [];
} catch { /* betaConfig deleted — no bypass */ }

const DEFAULT_SESSION: UserSession = {
  isLoggedIn:    true,
  country:       "SA",
  userType:      "lawyer",
  subRole:       "solo",
  name:          "أ. فهد العتيبي",
  tier:          "max",
  credits:       57,
  creditsMax:    600,
  dashboardMode: "full",
  permissions:   getPermissions("lawyer", "max"),
};

const GUEST_SESSION: UserSession = {
  isLoggedIn:    false,
  userType:      null,
  subRole:       null,
  name:          "",
  tier:          "free",
  credits:       0,
  creditsMax:    0,
  dashboardMode: "light",
  permissions:   [],
};

function readSessionFromStorage(): UserSession {
  if (typeof window === "undefined") return GUEST_SESSION;  // SSR: always guest
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return GUEST_SESSION;       // no saved session = guest
    if (raw === "guest") return GUEST_SESSION;
    const parsed = JSON.parse(raw) as UserSession;
    if (parsed.isLoggedIn && !parsed.country) {
      parsed.country = "SA";
    }
    return parsed;
  } catch {
    return GUEST_SESSION;                 // parse error = safe fallback to guest
  }
}

function readDemoKeyFromStorage(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEMO_KEY_STORAGE) ?? "";
}

// Global listener list — lets setDemoSession() trigger re-renders across all components
let _listeners: Array<() => void> = [];
function notifyAll() { _listeners.forEach(fn => fn()); }

/** Switch demo account — instant update across all components */
export function setDemoSession(session: UserSession, key: string = ""): void {
  if (typeof window === "undefined") return;
  // Never write a demo session/cookie in production (supabase mode). The demo
  // switchers that call this are gated out of prod builds; this is defense in
  // depth so a stray caller can't forge a fabricated session on a live account.
  if (isSupabaseMode) return;
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(DEMO_KEY_STORAGE, key); // store the account key for bypass check
  document.cookie = "nzamy_demo_role=true; path=/";
  notifyAll();
}

/** Log out — clears session, re-renders all components, then navigates to /login */
export function logout(): void {
  if (typeof window === "undefined") return;

  // Supabase mode: sign out through Supabase Auth
  if (BACKEND_MODE === "supabase") {
    // Defense in depth: the library-folders / recent-sessions keys must
    // never carry a signed-in user's data (THE RULE OF THIS PHASE — that
    // data lives on the server only). Nothing should write them while
    // authenticated any more, but this clears any stale value already on
    // disk (written before that fix shipped, or by a demo/guest visit on
    // this same browser) so the next signed-out visitor on a shared machine
    // never inherits a previous account's folders or recent reads.
    try {
      localStorage.removeItem("nzamy_smart_folders");
      localStorage.removeItem("nzamy_recent_sessions");
    } catch { /* ignore quota / private-mode errors */ }

    const supabase = createClient();
    supabase.auth.signOut().finally(() => {
      window.location.href = "/login";
    });
    return;
  }

  // Demo mode: clear localStorage
  localStorage.setItem(DEMO_STORAGE_KEY, "guest");
  document.cookie = "nzamy_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  notifyAll();
  setTimeout(() => { window.location.href = "/login"; }, 150);
}

// ─── ⚠️ DEMO BLOCK END ───────────────────────────────────────────────────────

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseUserReturn extends UserSession {
  /** True if this demo account bypasses ALL beta gating (BETA_REVIEW_MODE + BETA_MONOPOLY_MODE) */
  isDemoBypass: boolean;
  loading: boolean;
}

// ─── Map Supabase user → UserSession ─────────────────────────────────────────

/**
 * The outcome of reading `profiles.user_type` for one user.
 *
 * `missing` and `unavailable` are kept apart on purpose. `missing` means the
 * query succeeded and came back with no usable type — no row at all, or a row
 * whose `user_type` is null or empty. Either way that is a data problem, and it
 * now surfaces as `userType: null` + `profileState: "missing"` rather than as a
 * silent demotion to `"individual"` (see mapSupabaseUser).
 * `unavailable` means the query itself failed — offline, RLS error, timeout — and
 * says nothing whatever about who the user is. It must never look like an answer.
 */
type ProfileTypeRead =
  | { status: "found"; userType: string }
  | { status: "missing" }
  | { status: "unavailable" };

type EntityMembershipRead =
  | { status: "found"; memberships: ActiveEntityMemberships; degraded: boolean }
  | { status: "unavailable" };

function relationName(value: unknown, field: string): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const name = (row as Record<string, unknown>)[field];
  return typeof name === "string" ? name : "";
}

async function readEntityMemberships(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<EntityMembershipRead> {
  try {
    const [firmResult, businessResult, ownedFirmResult, ownedBusinessResult] = await Promise.all([
      supabase
        .from("firm_members")
        .select("firm_id, role, firm_profiles(name_ar)")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("business_members")
        .select("business_id, role, business_profiles(company_name_ar)")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("firm_profiles")
        .select("id, name_ar")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("business_profiles")
        .select("id, company_name_ar")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

    // WP-6 B-8. Each read is now evaluated INDEPENDENTLY — mirroring
    // `resolveActiveEntityIds` (src/app/api/v1/service-requests/route.ts),
    // which logs each error and nulls only the failing query. This function
    // used to collapse all four on any one error, so a recursive
    // `business_members` policy (42P17, UAT-TEAM-001) discarded the caller's
    // own `business_profiles` row, read successfully from a different table
    // under a different policy, and threw an owner out of their own dashboard
    // on a cold load. The merge itself lives in `mergeMembershipReads` so
    // every combination of the four is unit-tested without a database.
    for (const [label, result] of [
      ["firm_members", firmResult],
      ["business_members", businessResult],
      ["firm_profiles", ownedFirmResult],
      ["business_profiles", ownedBusinessResult],
    ] as const) {
      if (result.error) {
        console.error(`[useUser] ${label} membership lookup failed:`, result.error.message, result.error.code);
      }
    }

    const firm = firmResult.data as Record<string, unknown> | null;
    const ownedFirm = ownedFirmResult.data as Record<string, unknown> | null;
    const business = businessResult.data as Record<string, unknown> | null;
    const ownedBusiness = ownedBusinessResult.data as Record<string, unknown> | null;

    return mergeMembershipReads({
      firmMember: {
        failed: Boolean(firmResult.error),
        summary:
          firm && typeof firm.firm_id === "string" && typeof firm.role === "string"
            ? {
                entityId: firm.firm_id,
                entityName: relationName(firm.firm_profiles, "name_ar"),
                role: firm.role,
              }
            : null,
      },
      ownedFirm: {
        failed: Boolean(ownedFirmResult.error),
        summary:
          ownedFirm && typeof ownedFirm.id === "string"
            ? {
                entityId: ownedFirm.id,
                entityName: typeof ownedFirm.name_ar === "string" ? ownedFirm.name_ar : "",
                role: "managing_partner",
              }
            : null,
      },
      businessMember: {
        failed: Boolean(businessResult.error),
        summary:
          business && typeof business.business_id === "string" && typeof business.role === "string"
            ? {
                entityId: business.business_id,
                entityName: relationName(business.business_profiles, "company_name_ar"),
                role: business.role,
              }
            : null,
      },
      ownedBusiness: {
        failed: Boolean(ownedBusinessResult.error),
        summary:
          ownedBusiness && typeof ownedBusiness.id === "string"
            ? {
                entityId: ownedBusiness.id,
                entityName:
                  typeof ownedBusiness.company_name_ar === "string" ? ownedBusiness.company_name_ar : "",
                role: "owner",
              }
            : null,
      },
    });
  } catch {
    // A THROW is different from a per-query error: nothing was read at all.
    return { status: "unavailable" };
  }
}

/**
 * Reads `profiles.user_type` for one user through the RLS-scoped browser
 * client. The row is reachable only because of the "users read own profile"
 * policy (supabase/migrations/20260603_phase1_001_profiles.sql:65-67): the
 * `.eq("id", …)` selects it, RLS is what keeps every other row out of reach.
 *
 * `maybeSingle()` rather than `single()`: `single()` reports "no row" as an
 * error, which would collapse `missing` and `unavailable` into one case.
 */
async function readProfileUserType(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ProfileTypeRead> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", userId)
      .maybeSingle();

    if (error) return { status: "unavailable" };

    const value: unknown = data?.user_type;
    if (typeof value !== "string" || value.length === 0) return { status: "missing" };
    return { status: "found", userType: value };
  } catch {
    // A thrown fetch is a transport failure, never a statement about the user.
    return { status: "unavailable" };
  }
}

/**
 * Builds the browser-side session.
 *
 * `resolvedUserType` is the account type the caller has already decided on, and
 * `user_type` is the ONLY field on this session that comes from `profiles`. The
 * caller passes `profiles.user_type` when the row was read, the previously
 * resolved type when the read was `unavailable` for this same signed-in user,
 * and `null` when neither applies.
 *
 * Everything else below — tier, sub-role, credits, display mode, affiliation
 * and the sector fields — still comes from `user_metadata`, unchanged.
 */
function mapSupabaseUser(
  user: User | null,
  resolvedUserType: string | null,
  memberships: ActiveEntityMemberships = {},
  profileState: ProfileState = "ok",
  membershipState: MembershipState = "ok",
): UserSession {
  if (!user) return GUEST_SESSION;

  const meta = user.user_metadata ?? {};
  // profiles.user_type is the only trusted browser role. user_metadata is
  // writable by the account holder, so it must never create an admin or entity
  // session when the profile read is unavailable.
  //
  // `missing` no longer falls back to "individual". That fallback is what
  // turned a real lawyer whose row could not be resolved into a client account,
  // at which point <UserTypeGuard> refused them their own dashboard with
  // «صلاحيات غير كافية» — UAT-LIVE-AI-001, and the "client-side demotion" of
  // docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md §4. A profile
  // that is absent or typeless is an INCOMPLETE PROFILE, not a different
  // account type, and the session now says so: userType stays null and
  // `profileState: "missing"` carries the reason, which UserTypeGuard renders
  // as «ملفك غير مكتمل» with a link to /onboarding.
  //
  // `unavailable` is untouched: applyUser carries the previously resolved type
  // forward for this same signed-in user, so only a first load with the network
  // already down reaches the "individual" fallback.
  const userType: UserType =
    profileState === "missing"
      ? null
      : resolvedUserType !== null && isDbUserType(resolvedUserType)
        ? resolvedUserType
        : "individual";

  const tier = (meta.tier ?? "free") as UserTier;
  const subRole = (meta.sub_role ?? meta.provider_sub_role ?? null) as SubRole;

  return {
    isLoggedIn:    true,
    userId:        user.id,
    userType,
    profileState,
    membershipState,
    subRole,
    name:          meta.display_name ?? meta.full_name ?? user.email ?? "",
    avatar:        meta.avatar_url,
    tier,
    credits:       meta.credit_balance ?? 0,
    creditsMax:    meta.credits_max ?? 0,
    dashboardMode: meta.display_mode ?? "full",
    permissions:   getPermissions(userType, tier),
    businessType:       meta.business_type,
    providerSpecialties: meta.provider_specialties,
    affiliation: memberships.firm
      ? {
          entityName: memberships.firm.entityName,
          entityType: "firm",
          role: memberships.firm.role as AffiliationRole,
        }
      : undefined,
    firmMembership: memberships.firm as UserSession["firmMembership"],
    governmentRole:     meta.government_role,
    officerSpecialty:    meta.officer_specialty,
    businessRole: (memberships.business?.role ?? meta.business_role) as BusinessRole | undefined,
    businessMembership: memberships.business as UserSession["businessMembership"],
    active_roles:       meta.active_roles,
    country:       meta.country_code ?? "SA",
  };
}

export function useUser(): UseUserReturn {
  const [session, setSession] = useState<UserSession>(GUEST_SESSION);
  const [demoKey, setDemoKey]  = useState<string>("");
  const [loading, setLoading]  = useState(true);

  // ── Supabase Mode ──────────────────────────────────────────────────────────
  //
  // This returns its cleanup SYNCHRONOUSLY; it used to return a promise of one.
  // The `cancelled` flag below is why: reached through a promise, the flag could
  // only be flipped once the async body had already finished — precisely when it
  // is too late to be worth anything. That matters more now than it did, because
  // the body makes two round trips (the user, then the profile) instead of one.
  const initSupabase = useCallback((): (() => void) | undefined => {
    if (!isSupabaseMode) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    // Monotonic counter over auth events. Every profile read remembers the value
    // it started with and discards its own result if a newer event has arrived
    // in the meantime. This is what stops a profile read that is still in flight
    // from re-populating a session after the user has already signed out.
    let latestEvent = 0;

    // The user id the last setSession put on screen, or null for a guest.
    // Used to tell a token refresh for the person already rendered (resolve it
    // quietly, no spinner) from a switch to a different person or an arrival
    // from signed-out (hold `loading` until the profile has been read).
    let renderedUserId: string | null = null;

    /** Resolve one signed-in user into a session — profile first, then render. */
    const applyUser = async (
      supabase: ReturnType<typeof createClient>,
      authUser: User,
      eventId: number,
    ) => {
      const [read, membershipRead] = await Promise.all([
        readProfileUserType(supabase, authUser.id),
        readEntityMemberships(supabase, authUser.id),
      ]);
      // Superseded or unmounted: drop this result and leave `loading` alone —
      // whichever event overtook this one is responsible for releasing it.
      if (cancelled || eventId !== latestEvent) return;

      setSession(prev => {
        // Carry the previously resolved type forward on `unavailable` ONLY, and
        // only for the same signed-in user. Without this, a token refresh while
        // the network is down would downgrade a lawyer to "individual" and
        // UserTypeGuard would throw them off their own dashboard — a regression
        // this change must not introduce. `missing` deliberately does not carry:
        // a row that is absent, or present with no type, is exactly what the
        // "individual" fallback exists for, and papering over it would hide a
        // real data problem.
        const carried =
          read.status === "unavailable" && prev.isLoggedIn && prev.userId === authUser.id
            ? prev.userType
            : null;

        const carriedMemberships: ActiveEntityMemberships =
          membershipRead.status === "unavailable" && prev.isLoggedIn && prev.userId === authUser.id
            ? {
                ...(prev.firmMembership ? { firm: prev.firmMembership } : {}),
                ...(prev.businessMembership ? { business: prev.businessMembership } : {}),
              }
            : {};

        // A carried type means the previous, successful read still stands for
        // this same user, so the session is "ok" — not "unavailable".
        const profileState: ProfileState =
          read.status === "found" || carried !== null
            ? "ok"
            : read.status === "missing"
              ? "missing"
              : "unavailable";

        // WP-6 B-9. «you have no role» and «we could not read your role» are
        // different answers, and the settings policy now denies by default, so
        // the session has to carry which one this is. `degraded` means at
        // least one of the four membership reads failed, so businessRole /
        // affiliation may be an undercount; a carried-forward previous session
        // is likewise not a fresh answer.
        const membershipState: MembershipState =
          membershipRead.status === "found"
            ? membershipRead.degraded
              ? "degraded"
              : "ok"
            : Object.keys(carriedMemberships).length > 0
              ? "degraded"
              : "unavailable";

        return mapSupabaseUser(
          authUser,
          read.status === "found" ? read.userType : carried,
          membershipRead.status === "found" ? membershipRead.memberships : carriedMemberships,
          profileState,
          membershipState,
        );
      });

      renderedUserId = authUser.id;
      setLoading(false);
    };

    // The event id the mount claimed, so the `finally` below can tell whether
    // it is still the most recent thing to have happened.
    let mountEvent = 0;

    void (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;

        if (user) {
          // Both round trips finish before the FIRST setSession of a signed-in
          // user, so there is no intermediate render that reports the wrong
          // type — no "individual" flash to bounce a lawyer off their dashboard.
          mountEvent = ++latestEvent;
          await applyUser(supabase, user, mountEvent);
        } else {
          setSession(GUEST_SESSION);
        }
        if (cancelled) return;

        // Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, authSession) => {
            const authUser = authSession?.user ?? null;
            latestEvent += 1;

            if (!authUser) {
              // Sign-out, or a session that has gone away. Clear it here and
              // now: the counter was bumped a line above, so any profile read
              // still in flight will drop its result instead of restoring the
              // account that just signed out.
              renderedUserId = null;
              setSession(GUEST_SESSION);
              setLoading(false);
              return;
            }

            // A different person than the one on screen — a sign-in arriving
            // after mount, or an account switch. The session currently
            // rendered describes somebody else (for a sign-in, it is the guest
            // session, whose userType is null), and `loading` was already
            // released by the mount above. Without this, consumers would see
            // that stale session as settled for one tick plus one profile
            // round trip: UserTypeGuard.tsx:32-34 would find null in
            // `allowedTypes`, and flash "صلاحيات غير كافية" at a user who is
            // in fact signed in. Hold the spinner instead, and release it in
            // applyUser once the profile has actually been read.
            //
            // A token refresh for the person already rendered takes the other
            // path: no flip, no spinner, the profile is re-read silently and
            // the session only changes if the answer changed.
            if (renderedUserId !== authUser.id) setLoading(true);

            // Deferred out of the callback instead of awaited inside it. The
            // Supabase auth client holds its lock for as long as the callback
            // runs, and awaiting another Supabase call in there can deadlock it.
            const eventId = latestEvent;
            setTimeout(() => {
              if (cancelled || eventId !== latestEvent) return;
              void applyUser(supabase, authUser, eventId);
            }, 0);
          },
        );

        if (cancelled) {
          subscription.unsubscribe();
          return;
        }
        unsubscribe = () => subscription.unsubscribe();
      } catch {
        renderedUserId = null;
        if (!cancelled) setSession(GUEST_SESSION);
      } finally {
        // Released on every path the mount can take, the throw above included:
        // a hook stuck on `loading: true` leaves UserTypeGuard spinning
        // forever. Skipped only when an auth event has already overtaken the
        // mount — that event raised the spinner deliberately and its own
        // applyUser releases it, so releasing here would undo it. As written
        // there is no `await` between subscribing and this line, so the
        // subscription cannot in fact fire first; the guard is here so that
        // stops being something this block depends on.
        if (!cancelled && latestEvent === mountEvent) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // ── Demo Mode ──────────────────────────────────────────────────────────────
  const initDemo = useCallback(() => {
    if (isSupabaseMode) return;
    setSession(readSessionFromStorage());
    setDemoKey(readDemoKeyFromStorage());
    setLoading(false);

    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_STORAGE_KEY) setSession(readSessionFromStorage());
      if (e.key === DEMO_KEY_STORAGE)  setDemoKey(readDemoKeyFromStorage());
    };
    window.addEventListener("storage", onStorage);

    const refresh = () => {
      setSession(readSessionFromStorage());
      setDemoKey(readDemoKeyFromStorage());
    };
    _listeners.push(refresh);

    return () => {
      window.removeEventListener("storage", onStorage);
      _listeners = _listeners.filter(fn => fn !== refresh);
    };
  }, []);

  useEffect(() => {
    // Both branches now hand back their cleanup synchronously.
    return isSupabaseMode ? initSupabase() : initDemo();
  }, [initSupabase, initDemo]);

  const isDemoBypass = _DEMO_BYPASS_KEYS.includes(demoKey);

  return { ...session, isDemoBypass, loading };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function useHasPermission(permission: UserPermission): boolean {
  const user = useUser();
  return user.permissions.includes(permission);
}

