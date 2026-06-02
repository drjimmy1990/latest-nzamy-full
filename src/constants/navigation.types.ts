/**
 * navigation.ts — Central Navigation Configuration
 * ─────────────────────────────────────────────────
 * Single source of truth for ALL navigation arrays across
 * the platform. Each user type has its own Navbar + Sidebar config.
 *
 * User types (9 شرائح):
 *   "lawyer"     — محامي فرد
 *   "firm"       — شركة محاماة
 *   "individual" — عميل فرد
 *   "corporate"  — شركة/مؤسسة
 *   "micro"      — منشأة صغيرة
 *   "provider"   — مقدم خدمة (موثّق / محكّم)
 *   "provider/bailiff" — مراجع حكومي / معقّب (subRole)
 *   "admin"      — مدير النظام
 *   "government" — جهة حكومية (قاضي/نيابة/ضابط/مستشار)
 *   "ngo"        — جمعية خيرية
 *   null         — زائر (غير مسجّل)
 */

import type { UserType } from "@/hooks/useUser";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  labelEn: string;
  href: string;
  icon?: string; // phosphor icon name
  children?: NavItem[];
  badge?: string; // e.g. "جديد" | "PRO"
  divider?: boolean; // render a separator before this item
}

export interface SidebarGroup {
  title?: string;       // section header (optional)
  titleEn?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Optional gate key at group level — entire section hidden unless user has this role/tier */
  gateKey?: string;
  items: SidebarItem[];
}

export interface SidebarItem {
  label: string;
  labelEn: string;
  href: string;
  icon: string;         // phosphor icon name
  badge?: string;
  external?: boolean;
  divider?: boolean;
  children?: SidebarItem[];
  /** Show only after the individual client has created/joined the group plan. */
  requiresClientGroup?: boolean;
  /** Optional gate key — if set, checked against useSubscription().can(key).
   *  Locked items show an upgrade badge and redirect to /pricing. */
  gateKey?: string;
}

// ─── Dashboard href helper ────────────────────────────────────────────────────

export function getDashboardRoute(userType: UserType): string {
  switch (userType) {
    case "admin":      return "/dashboard/admin";
    case "lawyer":     return "/dashboard/lawyer";
    case "firm":       return "/dashboard/firm";
    case "corporate":  return "/dashboard/business";
    case "micro":      return "/dashboard/micro";
    case "provider":   return "/dashboard/provider";
    case "individual": return "/dashboard/client";
    case "government": return "/dashboard/government";
    case "ngo":        return "/dashboard/ngo";
    default:           return "/";
  }
}

export function getRoleLabel(userType: UserType, isAr = true): string {
  const map: Record<string, { ar: string; en: string }> = {
    lawyer:     { ar: "محامي",         en: "Lawyer" },
    firm:       { ar: "مكتب محاماة",  en: "Law Firm" },
    corporate:  { ar: "شركة",          en: "Corporate" },
    micro:      { ar: "منشأة",         en: "Small Business" },
    provider:   { ar: "مزوّد خدمة",   en: "Provider" },
    individual: { ar: "عميل",          en: "Client" },
    admin:      { ar: "مدير النظام",   en: "Admin" },
    government: { ar: "جهة حكومية",  en: "Government Entity" },
    ngo:        { ar: "جمعية خيرية",  en: "NGO / Association" },
  };
  const entry = map[userType ?? ""];
  if (!entry) return "";
  return isAr ? entry.ar : entry.en;
}
