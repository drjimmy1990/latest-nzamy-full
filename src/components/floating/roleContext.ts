"use client";

import type {
  AffiliationRole,
  BusinessRole,
  GovernmentRole,
  ProviderRole,
  UserSession,
} from "@/hooks/useUser";
import type { UserCategory } from "./types";

export const CATEGORY_LABELS: Record<string, string> = {
  individual: "عميل فرد",
  business: "شركة",
  corporate: "شركة",
  micro: "منشأة صغيرة",
  provider: "مزود خدمة",
  lawyer: "محام",
  firm: "مكتب محاماة",
  admin: "إدارة النظام",
  government: "جهة حكومية",
  ngo: "جمعية/وقف",
  guest: "زائر",
};

export const BUSINESS_ROLE_LABELS: Record<BusinessRole, string> = {
  owner: "مدير/مالك الشركة",
  legal_manager: "مدير الشؤون القانونية",
  legal_staff: "أخصائي قانوني",
  compliance_officer: "مسؤول امتثال",
  seconded: "مستشار منتدب",
  department_head: "مدير قسم",
  hr_manager: "مدير موارد بشرية",
  finance_manager: "مدير مالي",
  employee: "موظف",
};

export const FIRM_ROLE_LABELS: Record<AffiliationRole, string> = {
  managing_partner: "شريك مدير",
  partner: "شريك",
  senior_lawyer: "محام أول",
  lawyer: "محام",
  trainee: "متدرب",
  legal_secretary: "سكرتير قانوني",
  office_admin: "مدير مكتب",
  finance_manager: "مدير مالي",
  hr_manager: "مدير موارد بشرية",
  compliance_manager: "مدير امتثال ومخاطر",
  external_of_counsel: "مستشار خارجي Of Counsel",
  legal_consultant: "مستشار قانوني",
  in_house_counsel: "مستشار قانوني داخلي",
};

export const GOVERNMENT_ROLE_LABELS: Record<GovernmentRole, string> = {
  judge: "قاضي",
  prosecutor: "نيابة/ادعاء",
  officer: "ضابط",
  gov_counsel: "مستشار حكومي",
};

export const PROVIDER_ROLE_LABELS: Record<ProviderRole, string> = {
  notary: "موثق",
  bailiff: "معقب/مراجع حكومي",
  arbitrator: "محكم",
};

export type FloatingActorContext = {
  category: string;
  categoryLabel: string;
  roleKey?: string;
  roleLabel?: string;
  entityName?: string;
  entityType?: string;
  scopeLabel: string;
};

export function resolveFloatingCategory(user: UserSession, userCategory: UserCategory) {
  return userCategory ?? user.userType ?? "guest";
}

export function getFloatingActorContext(
  user: UserSession,
  userCategory: UserCategory,
): FloatingActorContext {
  const category = resolveFloatingCategory(user, userCategory);
  const affiliationRole = user.affiliation?.role;
  const providerRole = user.subRole && user.subRole in PROVIDER_ROLE_LABELS
    ? user.subRole as ProviderRole
    : null;

  if (category === "corporate" || category === "business") {
    const role = user.businessRole ?? "owner";
    return {
      category,
      categoryLabel: CATEGORY_LABELS[String(category)] ?? String(category),
      roleKey: role,
      roleLabel: BUSINESS_ROLE_LABELS[role],
      entityName: user.affiliation?.entityName,
      entityType: "corporate",
      scopeLabel: role === "owner" || role === "legal_manager" ? "نطاق الشركة" : "نطاق الدور/القسم",
    };
  }

  if (category === "firm") {
    const role = affiliationRole ?? "managing_partner";
    return {
      category,
      categoryLabel: CATEGORY_LABELS.firm,
      roleKey: role,
      roleLabel: FIRM_ROLE_LABELS[role],
      entityName: user.affiliation?.entityName,
      entityType: user.affiliation?.entityType,
      scopeLabel: role === "managing_partner" || role === "partner" ? "نطاق المكتب" : "نطاق الدور/القضايا المصرح بها",
    };
  }

  if (category === "government") {
    const role = user.governmentRole ?? "gov_counsel";
    return {
      category,
      categoryLabel: CATEGORY_LABELS.government,
      roleKey: role,
      roleLabel: GOVERNMENT_ROLE_LABELS[role],
      scopeLabel: "نطاق الجهة الحكومية",
    };
  }

  if (category === "provider" && providerRole) {
    return {
      category,
      categoryLabel: CATEGORY_LABELS.provider,
      roleKey: providerRole,
      roleLabel: PROVIDER_ROLE_LABELS[providerRole],
      scopeLabel: "نطاق خدمات المزود",
    };
  }

  return {
    category,
    categoryLabel: CATEGORY_LABELS[String(category)] ?? String(category),
    roleKey: user.subRole ?? undefined,
    roleLabel: user.subRole ?? undefined,
    entityName: user.affiliation?.entityName,
    entityType: user.affiliation?.entityType,
    scopeLabel: category === "admin" ? "نطاق إدارة المنصة" : "نطاق المستخدم",
  };
}
