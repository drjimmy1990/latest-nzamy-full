"use client";
import { createContext, useContext } from "react";
import { Scales, UsersThree, UserCircle, ShieldCheck, PenNib } from "@phosphor-icons/react";
import type { FirmRole } from "@/types/firmBackendReady";

// ─── RBAC Types ──────────────────────────────────────────────────────────────
export type { FirmRole };

export interface FirmRoleConfig {
  role: FirmRole;
  labelAr: string;
  labelEn: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  /** Which sections this role can SEE */
  can: {
    viewFinancials: boolean;
    viewAllCases: boolean;
    viewTeam: boolean;
    viewAnalytics: boolean;
    addNewCase: boolean;
    manageClients: boolean;
  };
}

export const FIRM_ROLES: FirmRoleConfig[] = [
  {
    role: "managing_partner",
    labelAr: "الشريك المدير",
    labelEn: "Managing Partner",
    icon: Scales,
    color: "text-[#C8A762]",
    bg: "bg-[#C8A762]/10",
    can: {
      viewFinancials: true,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "partner",
    labelAr: "شريك",
    labelEn: "Partner",
    icon: Scales,
    color: "text-[#C8A762]",
    bg: "bg-[#C8A762]/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "senior_lawyer",
    labelAr: "محامي أول",
    labelEn: "Senior Lawyer",
    icon: UsersThree,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    can: {
      viewFinancials: true,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "lawyer",
    labelAr: "محامي",
    labelEn: "Lawyer",
    icon: UserCircle,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "trainee",
    labelAr: "متدرب",
    labelEn: "Trainee",
    icon: PenNib,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false, // Own cases only
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "legal_secretary",
    labelAr: "سكرتير قانوني",
    labelEn: "Legal Secretary",
    icon: ShieldCheck,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: true,
    },
  },
  {
    role: "office_admin",
    labelAr: "مدير مكتب",
    labelEn: "Office Admin",
    icon: ShieldCheck,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: true,
    },
  },
  {
    role: "finance_manager",
    labelAr: "مدير مالي",
    labelEn: "Finance Manager",
    icon: ShieldCheck,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    can: {
      viewFinancials: true,
      viewAllCases: false,
      viewTeam: false,
      viewAnalytics: true,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "hr_manager",
    labelAr: "مدير موارد بشرية",
    labelEn: "HR Manager",
    icon: UsersThree,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "compliance_manager",
    labelAr: "مدير امتثال ومخاطر",
    labelEn: "Compliance Manager",
    icon: ShieldCheck,
    color: "text-red-500",
    bg: "bg-red-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "external_of_counsel",
    labelAr: "مستشار خارجي Of Counsel",
    labelEn: "External Of Counsel",
    icon: UserCircle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "legal_consultant",
    labelAr: "مستشار قانوني",
    labelEn: "Legal Consultant",
    icon: UserCircle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "in_house_counsel",
    labelAr: "مستشار قانوني داخلي",
    labelEn: "In-House Counsel",
    icon: UserCircle,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: true,
      manageClients: true,
    },
  },
];

// ─── RBAC Context ─────────────────────────────────────────────────────────────
export const FirmRoleContext = createContext<FirmRoleConfig>(FIRM_ROLES[0]);
export const useFirmRole = () => useContext(FirmRoleContext);

