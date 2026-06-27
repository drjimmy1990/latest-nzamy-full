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
import { createClient } from "@/lib/supabase/client";
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

export interface UserSession {
  isLoggedIn:    boolean;
  userId?:       string;
  userType:      UserType;
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
  // ─── حقول الجهة الحكومية ───────────────────────────────
  governmentRole?:  GovernmentRole;   // القاضي / عضو النيابة / الضابط / المستشار
  officerSpecialty?: OfficerSpecialty; // تخصص الضابط إذا كان governmentRole = "officer"
  // ─── حقول الشركة التجارية ──────────────────────────────
  businessRole?:   BusinessRole;      // دور الموظف داخل الشركة
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
const BACKEND_MODE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo")
    : "demo";
const isSupabaseMode = BACKEND_MODE === "supabase";

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

function mapSupabaseUser(user: User | null): UserSession {
  if (!user) return GUEST_SESSION;

  const meta = user.user_metadata ?? {};
  const userType = (meta.user_type ?? "individual") as UserType;
  const tier = (meta.tier ?? "free") as UserTier;
  const subRole = (meta.sub_role ?? null) as SubRole;

  return {
    isLoggedIn:    true,
    userId:        user.id,
    userType,
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
    affiliation:   meta.affiliation,
    governmentRole:     meta.government_role,
    officerSpecialty:    meta.officer_specialty,
    businessRole:       meta.business_role,
    active_roles:       meta.active_roles,
    country:       meta.country_code ?? "SA",
  };
}

export function useUser(): UseUserReturn {
  const [session, setSession] = useState<UserSession>(GUEST_SESSION);
  const [demoKey, setDemoKey]  = useState<string>("");
  const [loading, setLoading]  = useState(true);

  // ── Supabase Mode ──────────────────────────────────────────────────────────
  const initSupabase = useCallback(async () => {
    if (!isSupabaseMode) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setSession(mapSupabaseUser(user));

      // Listen for auth state changes (login, logout, token refresh)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, authSession) => {
          setSession(mapSupabaseUser(authSession?.user ?? null));
        },
      );

      return () => subscription.unsubscribe();
    } catch {
      setSession(GUEST_SESSION);
    } finally {
      setLoading(false);
    }
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
    if (isSupabaseMode) {
      const cleanup = initSupabase();
      return () => { cleanup?.then(fn => fn?.()); };
    } else {
      return initDemo();
    }
  }, [initSupabase, initDemo]);

  const isDemoBypass = _DEMO_BYPASS_KEYS.includes(demoKey);

  return { ...session, isDemoBypass, loading };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function useHasPermission(permission: UserPermission): boolean {
  const user = useUser();
  return user.permissions.includes(permission);
}

