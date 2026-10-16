/**
 * The AI-tool and dashboard permissions each account type gets on each tier.
 *
 * Moved out of useUser.ts, a "use client" hook with `@/` imports and a
 * Supabase client that `node --test` cannot load, so the table had no unit test
 * — not even the admin rows, which once carried permissions on two tiers only
 * (N15, fix plan 2026-10-16; userPermissions.test.ts). useUser.ts re-exports
 * getPermissions, so its callers are unchanged.
 *
 * Relative `.ts` import, and only `import type` from useUser: nothing here
 * loads the hook at runtime.
 */
import { LAWYER_AI_PERMISSION_KEYS } from "../constants/lawyerAiCatalog.ts";
import type { UserPermission, UserTier, UserType } from "./useUser.ts";

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
const ADMIN_ALL_PERMISSIONS: UserPermission[] = [...ADMIN_AI_PERMISSIONS, ...ADMIN_DASHBOARD_PERMISSIONS];

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
    // مدير النظام — كل الصلاحيات، على كل باقة. The tier comes from
    // user_metadata and says nothing about an admin's access; only free and
    // max used to carry the list, so an admin whose tier read shield/ai/pro/
    // corp/enterprise got no tools at all.
    free:       ADMIN_ALL_PERMISSIONS,
    shield:     ADMIN_ALL_PERMISSIONS,
    ai:         ADMIN_ALL_PERMISSIONS,
    pro:        ADMIN_ALL_PERMISSIONS,
    max:        ADMIN_ALL_PERMISSIONS,
    corp:       ADMIN_ALL_PERMISSIONS,
    enterprise: ADMIN_ALL_PERMISSIONS,
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
