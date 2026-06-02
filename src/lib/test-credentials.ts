/**
 * ⚠️ TEST CREDENTIALS — FOR DEVELOPMENT ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * 🗑️  DELETE THIS FILE BEFORE PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Unified test accounts for login testing via the /login page.
 * All accounts share the same password: Nzamy@2026
 *
 * Usage: Enter the email below on the /login page with password: Nzamy@2026
 *
 * TODO(Backend-Phase-1): Replace with Supabase Auth. Delete this file entirely.
 */

import type { UserSession } from "@/hooks/useUser";
import { getPermissions } from "@/hooks/useUser";

export const TEST_PASSWORD = "Nzamy@2026";

export interface TestAccount {
  email: string;
  phone: string;
  session: UserSession;
  labelAr: string;
  labelEn: string;
}

export const TEST_ACCOUNTS: TestAccount[] = [
  // ── 1. محامي فرد — Solo Lawyer (Full plan) ─────────────────────────
  {
    email: "lawyer@nzamy.test",
    phone: "0501111111",
    labelAr: "محامي فرد (كامل)",
    labelEn: "Solo Lawyer (Full)",
    session: {
      isLoggedIn: true,
      userType: "lawyer",
      subRole: "solo",
      name: "أ. فهد العتيبي",
      tier: "max",
      credits: 57,
      creditsMax: 600,
      dashboardMode: "full",
      permissions: getPermissions("lawyer", "max"),
    },
  },

  // ── 2. محامي لايت — Lawyer Lite (Free plan) ────────────────────────
  {
    email: "lawyer-lite@nzamy.test",
    phone: "0501111112",
    labelAr: "محامي (مجاني)",
    labelEn: "Lawyer (Free)",
    session: {
      isLoggedIn: true,
      userType: "lawyer",
      subRole: "trainee",
      name: "أ. محمد الزهراني",
      tier: "free",
      credits: 3,
      creditsMax: 3,
      dashboardMode: "light",
      permissions: getPermissions("lawyer", "free"),
    },
  },

  // ── 3. مكتب محاماة — Law Firm ──────────────────────────────────────
  {
    email: "firm@nzamy.test",
    phone: "0502222222",
    labelAr: "مكتب محاماة",
    labelEn: "Law Firm",
    session: {
      isLoggedIn: true,
      userType: "firm",
      subRole: "partner",
      name: "مكتب الشمري للمحاماة",
      tier: "pro",
      credits: 420,
      creditsMax: 600,
      dashboardMode: "full",
      permissions: getPermissions("firm", "pro"),
    },
  },

  // ── 4. عميل فرد — Individual Client ────────────────────────────────
  {
    email: "client@nzamy.test",
    phone: "0503333333",
    labelAr: "عميل فرد",
    labelEn: "Individual Client",
    session: {
      isLoggedIn: true,
      userType: "individual",
      subRole: null,
      name: "خالد السلمي",
      tier: "ai",
      credits: 12,
      creditsMax: 30,
      dashboardMode: "full",
      permissions: getPermissions("individual", "ai"),
    },
  },

  // ── 5. شركة / مؤسسة كبيرة — Corporate ─────────────────────────────
  {
    email: "corporate@nzamy.test",
    phone: "0504444444",
    labelAr: "شركة / مؤسسة",
    labelEn: "Corporate",
    session: {
      isLoggedIn: true,
      userType: "corporate",
      subRole: "manager",
      name: "شركة الفيصل التجارية",
      tier: "corp",
      credits: 850,
      creditsMax: 1000,
      dashboardMode: "full",
      permissions: getPermissions("corporate", "corp"),
    },
  },

  // ── 6. منشأة صغيرة — Micro / Small Business ───────────────────────
  {
    email: "micro@nzamy.test",
    phone: "0505555555",
    labelAr: "منشأة صغيرة",
    labelEn: "Small Business",
    session: {
      isLoggedIn: true,
      userType: "micro",
      subRole: null,
      name: "أبو محمد للبقالة",
      tier: "free",
      credits: 3,
      creditsMax: 3,
      dashboardMode: "light",
      permissions: getPermissions("micro", "free"),
      businessType: "بقالة",
    },
  },

  // ── 7. مزوّد خدمة — Service Provider (معقّب/موثّق/محكّم) ──────────
  {
    email: "provider@nzamy.test",
    phone: "0506666666",
    labelAr: "مزوّد خدمة (موثّق)",
    labelEn: "Service Provider (Notary)",
    session: {
      isLoggedIn: true,
      userType: "provider",
      subRole: "notary",
      name: "موثّق / محمد العمر",
      tier: "pro",
      credits: 0,
      creditsMax: 0,
      dashboardMode: "light",
      permissions: getPermissions("provider", "pro"),
    },
  },

  // ── 8. مدير النظام — Admin ─────────────────────────────────────────
  {
    email: "admin@nzamy.test",
    phone: "0500000000",
    labelAr: "مدير النظام",
    labelEn: "Admin",
    session: {
      isLoggedIn: true,
      userType: "admin",
      subRole: "partner",
      name: "⚙️ Admin — نظامي",
      tier: "max",
      credits: 9999,
      creditsMax: 9999,
      dashboardMode: "full",
      permissions: getPermissions("admin", "max"),
    },
  },

  // ── 9. محامي تحت مكتب محاماة — Lawyer under Law Firm ───────────────
  {
    email: "lawyer-firm@nzamy.test",
    phone: "0507777777",
    labelAr: "محامي (تحت مكتب)",
    labelEn: "Lawyer (Under Firm)",
    session: {
      isLoggedIn: true,
      userType: "lawyer",
      subRole: "partner",
      name: "أ. سارة القحطاني",
      tier: "pro",
      credits: 120,
      creditsMax: 600,
      dashboardMode: "full",
      permissions: getPermissions("lawyer", "pro"),
      affiliation: {
        entityName: "مكتب الشمري للمحاماة",
        entityType: "firm",
        role: "senior_lawyer",
      },
    },
  },

  // ── 10. مستشار قانوني داخلي تحت شركة — In-house Counsel ───────────
  {
    email: "lawyer-corp@nzamy.test",
    phone: "0508888888",
    labelAr: "مستشار داخلي (شركة)",
    labelEn: "In-house Counsel",
    session: {
      isLoggedIn: true,
      userType: "lawyer",
      subRole: "partner",
      name: "أ. عبدالله المالكي",
      tier: "ai",
      credits: 30,
      creditsMax: 100,
      dashboardMode: "full",
      permissions: getPermissions("lawyer", "ai"),
      affiliation: {
        entityName: "شركة الفيصل التجارية",
        entityType: "corporate",
        role: "in_house_counsel",
      },
    },
  },

  // ── 11. متدرب تحت مكتب محاماة — Trainee under Firm ────────────────
  {
    email: "trainee@nzamy.test",
    phone: "0509999999",
    labelAr: "متدرب (تحت مكتب)",
    labelEn: "Trainee (Under Firm)",
    session: {
      isLoggedIn: true,
      userType: "lawyer",
      subRole: "trainee",
      name: "أ. نايف الحربي",
      tier: "free",
      credits: 3,
      creditsMax: 3,
      dashboardMode: "light",
      permissions: getPermissions("lawyer", "free"),
      affiliation: {
        entityName: "مكتب الشمري للمحاماة",
        entityType: "firm",
        role: "trainee",
      },
    },
  },
];

/**
 * Authenticate with test credentials.
 * Returns the matching session if valid, or null if not.
 */
export function authenticateTest(
  identifier: string, // email or phone
  password: string
): UserSession | null {
  if (password !== TEST_PASSWORD) return null;
  const lowerIdentifier = identifier.toLowerCase().trim();
  const account = TEST_ACCOUNTS.find(
    (a) => a.email === lowerIdentifier || a.phone === lowerIdentifier
  );
  return account?.session ?? null;
}
