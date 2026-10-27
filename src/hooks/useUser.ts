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

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { getPermissions } from "@/hooks/userPermissions";
import { GUEST_SESSION } from "@/hooks/userSession";
import {
  createUserSessionStore,
  LOADING_SNAPSHOT,
  type UserSessionSnapshot,
  type UserSessionStore,
} from "@/hooks/userSessionStore";
import { toPracticeKind, type PracticeKind } from "@/lib/auth/practiceKind";
import { toStaffRole, type StaffRole } from "@/lib/auth/staffRoles";
import { createClient } from "@/lib/supabase/client";
import {
  isSupabaseMode as isSupabaseBackend,
  BACKEND_MODE as RESOLVED_BACKEND_MODE,
} from "@/lib/runtimeMode";

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
  /**
   * Art. 18 of نظام المحاماة (owner ١٧٣ / ٢١٩): lawyer_profiles.practice_kind.
   * A 'consultant' may not plead or manage hearings. Optional because demo and
   * literal sessions predate it; useUser() always returns a resolved value.
   */
  practiceKind?: PracticeKind;
  /**
   * Owner ٢١٠: an admin's staff role (public.staff_role()), null when it could
   * not be read. Optional because demo and literal sessions predate it;
   * useUser() always returns a value (null for every non-admin).
   */
  staffRole?: StaffRole | null;
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

// The table is in ./userPermissions.ts, so `node --test` can load it (N15).

export { getPermissions };

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
  // Owner decision ١١٥: a demo session never rides on a real one. A browser
  // that is still signed in to Supabase (sb-* cookies from a real account on
  // this same origin) is signed out locally first, so no request made while
  // the demo identity is on screen can act as that real account.
  signOutRealSessionLocally();
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(DEMO_KEY_STORAGE, key); // store the account key for bypass check
  document.cookie = "nzamy_demo_role=true; path=/";
  notifyAll();
}

/**
 * Owner decision ١١٥ — demo and real sessions never mix. Drops the
 * Supabase session held in this browser (`scope: "local"`: this browser only),
 * best-effort and without waiting: a failure must not block the demo switch.
 */
function signOutRealSessionLocally(): void {
  try {
    void createClient().auth.signOut({ scope: "local" }).catch(() => undefined);
  } catch { /* no Supabase configuration in this demo build — nothing to drop */ }
}

/**
 * The demo markers (`nzamy_demo_role`/`nzamy_demo_key` + the cookie) are inert
 * outside demo mode, but a real session must not carry them either: a later
 * demo build on the same origin would otherwise resurrect a fabricated identity
 * next to the real account's cookies.
 */
function clearDemoSessionMarkers(): void {
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    localStorage.removeItem(DEMO_KEY_STORAGE);
  } catch { /* ignore quota / private-mode errors */ }
  document.cookie = "nzamy_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

/**
 * Log out — clears session, re-renders all components, then navigates to
 * `redirectTo` (/login by default; the onboarding wizard sends the visitor
 * back to the public site instead).
 */
export function logout(redirectTo: string = "/login"): void {
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
    clearDemoSessionMarkers();

    const supabase = createClient();
    supabase.auth.signOut().finally(() => {
      window.location.href = redirectTo;
    });
    return;
  }

  // Demo mode: clear localStorage — and any real session that slipped in
  // alongside it (owner ١١٥).
  signOutRealSessionLocally();
  localStorage.setItem(DEMO_STORAGE_KEY, "guest");
  document.cookie = "nzamy_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  notifyAll();
  setTimeout(() => { window.location.href = redirectTo; }, 150);
}

// ─── ⚠️ DEMO BLOCK END ───────────────────────────────────────────────────────

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseUserReturn extends UserSession {
  /** True if this demo account bypasses ALL beta gating (BETA_REVIEW_MODE + BETA_MONOPOLY_MODE) */
  isDemoBypass: boolean;
  loading: boolean;
  /**
   * 'consultant' only for a lawyer whose lawyer_profiles row says so;
   * 'advocate' for every other account, and when the read fails (42703 before
   * 20261019_20 runs) — today's behaviour.
   */
  practiceKind: PracticeKind;
  /**
   * Owner ٢١٠: the admin's staff role — super_admin / operations / auditor —
   * read through public.staff_role(). Null for every non-admin, and for an
   * admin whenever it cannot be read: before 20261019_30 runs the function
   * does not exist (PGRST202 / 42883), and any other error reads the same.
   * The admin nav shows everything on null (today's behaviour); the server
   * (requireStaff) enforces the real rule, so null never widens access.
   */
  staffRole: StaffRole | null;
}

// ── Supabase Mode ────────────────────────────────────────────────────────────
//
// The tab's one session store (src/hooks/userSessionStore.ts has the rules),
// created on first use in the browser. Every useUser() caller subscribes to
// it, so a page makes one getUser(), one profile + membership read and holds
// one auth listener, however many components — and nested gates — ask.
let store: UserSessionStore | null = null;
function userSessionStore(): UserSessionStore {
  if (!store) store = createUserSessionStore({ createClient });
  return store;
}

const subscribeSession = (listener: () => void): (() => void) => {
  if (!isSupabaseMode) return () => {};
  // Owner decision ١١٥: a real session starts without demo markers. Cleared on
  // every mount, as before — a local write, not a read.
  clearDemoSessionMarkers();
  return userSessionStore().subscribe(listener);
};
const getSessionSnapshot = (): UserSessionSnapshot =>
  isSupabaseMode ? userSessionStore().getSnapshot() : LOADING_SNAPSHOT;
// The server, and the hydration pass, render a loading guest — as before.
const getServerSessionSnapshot = (): UserSessionSnapshot => LOADING_SNAPSHOT;

/**
 * Re-read the signed-in user now (userSessionStore.ts `refresh`). For a write
 * made on the server that fires no auth event in this tab — a settled payment
 * writing the tier into user_metadata — which newly mounted useUser() callers
 * used to pick up on their own before the session was shared. Every caller
 * re-renders when it lands. A no-op in demo mode and before the first read.
 */
export function refreshUserSession(): Promise<void> {
  return isSupabaseMode && store ? store.refresh() : Promise.resolve();
}

export function useUser(): UseUserReturn {
  // Supabase mode: the shared session. Demo mode never subscribes.
  const shared = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);

  // Demo mode only — kept per instance, as before (localStorage, no network).
  const [session, setSession] = useState<UserSession>(GUEST_SESSION);
  const [demoKey, setDemoKey]  = useState<string>("");
  const [loading, setLoading]  = useState(true);

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
    return isSupabaseMode ? undefined : initDemo();
  }, [initDemo]);

  const current = isSupabaseMode ? shared.session : session;
  const isLoading = isSupabaseMode ? shared.loading : loading;

  // Always "" in Supabase mode: only initDemo ever sets it.
  const isDemoBypass = _DEMO_BYPASS_KEYS.includes(demoKey);

  // Art. 18: only a lawyer can be a consultant, and a demo or literal session
  // without the field reads as an advocate.
  const practiceKind: PracticeKind =
    current.userType === "lawyer" ? toPracticeKind(current.practiceKind) : "advocate";

  // Owner ٢١٠: only an admin holds a staff role; a demo or literal session
  // without the field reads as null (today's full admin nav).
  const staffRole: StaffRole | null =
    current.userType === "admin" ? toStaffRole(current.staffRole) : null;

  return { ...current, practiceKind, staffRole, isDemoBypass, loading: isLoading };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function useHasPermission(permission: UserPermission): boolean {
  const user = useUser();
  return user.permissions.includes(permission);
}

