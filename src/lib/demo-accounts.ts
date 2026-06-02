/**
 * ⚠️ DEMO ACCOUNTS — FOR DEVELOPMENT ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * 🗑️  DELETE THIS FILE BEFORE PRODUCTION
 * 🗑️  Also revert: src/hooks/useUser.ts  (the localStorage block, marked below)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Demo login system for testing all user roles without a real backend.
 * Used by: src/app/demo-login/page.tsx  +  src/hooks/useUser.ts
 *
 * TODO(Backend-Phase-1): DELETE this file completely once Supabase Auth is integrated.
 * We will fetch User and UserType from the real database.
 */

import type { UserSession } from "@/hooks/useUser";
import { DEMO_ACCOUNTS } from "@/constants/demoAccountsData";

export { DEMO_ACCOUNTS };

export const DEMO_STORAGE_KEY = "nzamy_demo_role";

export function getDemoSession(key: string): UserSession | undefined {
  return DEMO_ACCOUNTS.find(a => a.key === key)?.session;
}
