"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, PencilSimple, Plus,
  Check, X, Lock, LockOpen,
  Scales, FileText, Money, Users, Brain, Buildings,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { FIRM_ROLE_CONTRACTS } from "@/constants/firmProfileReadiness";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  nameEn: string;
  memberCount: number;
  color: string;
  permissions: Record<string, boolean>;
}

const PERMISSION_GROUPS = [
  {
    group: "القضايا",
    icon: Scales,
    permissions: [
      { key: "cases:view", label: "عرض القضايا" },
      { key: "cases:create", label: "إنشاء قضية" },
      { key: "cases:edit", label: "تعديل القضايا" },
      { key: "cases:delete", label: "حذف القضايا" },
      { key: "cases:assign", label: "تعيين قضية لمحامي" },
    ],
  },
  {
    group: "الموكلين",
    icon: Users,
    permissions: [
      { key: "clients:view", label: "عرض الموكلين" },
      { key: "clients:create", label: "إضافة موكل" },
      { key: "clients:edit", label: "تعديل بيانات موكل" },
      { key: "clients:delete", label: "حذف موكل" },
    ],
  },
  {
    group: "المالية",
    icon: Money,
    permissions: [
      { key: "finance:view", label: "عرض التقارير المالية" },
      { key: "finance:invoices", label: "إصدار الفواتير" },
      { key: "finance:expenses", label: "تسجيل المصروفات" },
      { key: "finance:reports", label: "تصدير التقارير المالية" },
    ],
  },
  {
    group: "نقاط الشركة",
    icon: Money,
    permissions: [
      { key: "points:firm_view", label: "رؤية رصيد الشركة" },
      { key: "points:department_view", label: "رؤية رصيد القسم" },
      { key: "points:allocate", label: "توزيع نقاط على الأقسام" },
      { key: "points:request_topup", label: "طلب شحن نقاط" },
    ],
  },
  {
    group: "المستندات",
    icon: FileText,
    permissions: [
      { key: "docs:view", label: "عرض المستندات" },
      { key: "docs:upload", label: "رفع مستندات" },
      { key: "docs:delete", label: "حذف مستندات" },
      { key: "docs:share", label: "مشاركة مع الموكل" },
    ],
  },
  {
    group: "أدوات الذكاء الاصطناعي",
    icon: Brain,
    permissions: [
      { key: "ai:consult", label: "المستشار القانوني" },
      { key: "ai:draft", label: "الصائغ القانوني" },
      { key: "ai:research", label: "البحث والسوابق" },
      { key: "ai:contracts", label: "محترف العقود" },
    ],
  },
  {
    group: "الإدارة",
    icon: Buildings,
    permissions: [
      { key: "admin:team", label: "إدارة الفريق" },
      { key: "admin:roles", label: "إدارة الأدوار" },
      { key: "admin:billing", label: "إدارة الاشتراك" },
      { key: "admin:settings", label: "إعدادات المكتب" },
      { key: "admin:audit", label: "سجل التدقيق" },
      { key: "admin:governance", label: "الحوكمة وChinese Walls" },
    ],
  },
];

const allPermKeys = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));
const makePerms = (keys: string[]): Record<string, boolean> => {
  const result: Record<string, boolean> = {};
  allPermKeys.forEach(k => result[k] = keys.includes(k));
  return result;
};

const ROLE_COLORS: Record<string, string> = {
  managing_partner: "bg-royal",
  partner: "bg-[#C8A762]",
  senior_lawyer: "bg-emerald-500",
  lawyer: "bg-blue-500",
  trainee: "bg-amber-500",
  legal_secretary: "bg-pink-500",
  office_admin: "bg-purple-500",
  finance_manager: "bg-emerald-600",
  hr_manager: "bg-cyan-500",
  compliance_manager: "bg-red-500",
  external_of_counsel: "bg-orange-500",
  legal_consultant: "bg-teal-500",
  in_house_counsel: "bg-sky-500",
};

const MEMBER_COUNTS: Record<string, number> = {
  managing_partner: 1,
  partner: 2,
  senior_lawyer: 3,
  lawyer: 7,
  trainee: 2,
  legal_secretary: 2,
  office_admin: 1,
  finance_manager: 1,
  hr_manager: 1,
  compliance_manager: 1,
  external_of_counsel: 2,
  legal_consultant: 3,
  in_house_counsel: 2,
};

function rolePermissions(roleId: string) {
  if (roleId === "managing_partner") return allPermKeys;
  if (roleId === "partner") return allPermKeys.filter((key) => key !== "cases:delete" && key !== "clients:delete");
  if (roleId === "finance_manager") return ["finance:view", "finance:invoices", "finance:expenses", "finance:reports", "points:firm_view", "points:department_view", "points:allocate", "admin:billing", "admin:audit"];
  if (roleId === "compliance_manager") return ["cases:view", "clients:view", "docs:view", "points:department_view", "admin:audit", "admin:governance"];
  if (roleId === "office_admin") return ["cases:view", "clients:view", "clients:create", "clients:edit", "docs:view", "docs:upload", "admin:team", "admin:settings", "points:request_topup"];
  if (roleId === "hr_manager") return ["admin:team", "admin:settings"];
  if (roleId === "senior_lawyer") return ["cases:view", "cases:create", "cases:edit", "cases:assign", "clients:view", "clients:create", "clients:edit", "docs:view", "docs:upload", "docs:share", "ai:consult", "ai:draft", "ai:research", "ai:contracts", "points:department_view", "points:request_topup"];
  if (roleId === "lawyer") return ["cases:view", "cases:create", "cases:edit", "clients:view", "clients:create", "docs:view", "docs:upload", "docs:share", "ai:consult", "ai:draft", "ai:research", "ai:contracts", "points:request_topup"];
  if (roleId === "trainee") return ["cases:view", "clients:view", "docs:view", "docs:upload", "ai:consult", "ai:research"];
  if (roleId === "legal_secretary") return ["cases:view", "clients:view", "clients:create", "clients:edit", "docs:view", "docs:upload", "docs:share"];
  if (roleId === "external_of_counsel") return ["cases:view", "clients:view", "docs:view", "docs:share", "ai:consult"];
  if (roleId === "legal_consultant") return ["cases:view", "clients:view", "clients:create", "clients:edit", "docs:view", "docs:upload", "docs:share", "docs:delete", "ai:consult", "ai:draft", "ai:research", "ai:contracts", "points:department_view"];
  if (roleId === "in_house_counsel") return ["cases:view", "clients:view", "docs:view", "docs:upload", "docs:share", "ai:consult", "ai:draft", "ai:research", "ai:contracts", "points:department_view"];
  return ["cases:view", "clients:view", "docs:view"];
}

const MOCK_ROLES: Role[] = FIRM_ROLE_CONTRACTS.map((role) => ({
  id: role.role,
  name: role.label,
  nameEn: role.role.replace(/_/g, " "),
  memberCount: MEMBER_COUNTS[role.role] ?? 0,
  color: ROLE_COLORS[role.role] ?? "bg-zinc-500",
  permissions: makePerms(rolePermissions(role.role)),
}));

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const currentRole = user.affiliation?.entityType === "firm" ? user.affiliation.role : "managing_partner";
  const canEditRoles = user.userType === "admin" || currentRole === "managing_partner";
  const [roles, setRoles] = useState<Role[]>(MOCK_ROLES);
  const [selectedRole, setSelectedRole] = useState<string>(MOCK_ROLES[0].id);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState("مصفوفة الصلاحيات Backend-ready: التعديل هنا واجهة محلية فقط حتى ربط Auth/RBAC API.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const active = roles.find(r => r.id === selectedRole)!;

  const togglePermission = (permissionKey: string) => {
    if (!canEditRoles) {
      setToast("صلاحياتك تسمح بعرض مصفوفة الأدوار فقط. تعديل RBAC يحتاج الشريك المدير أو الأدمن.");
      return;
    }
    setRoles(prev => prev.map(role => {
      if (role.id !== selectedRole) return role;
      return {
        ...role,
        permissions: {
          ...role.permissions,
          [permissionKey]: !role.permissions[permissionKey],
        },
      };
    }));
    setToast("تم تعديل الصلاحية محليا فقط. الحفظ الإنتاجي ينتظر Auth/RBAC API وسجل تدقيق.");
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            الأدوار والصلاحيات
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            تحكم بمن يستطيع الوصول لماذا في مكتبك
          </p>
        </div>
        {canEditRoles && (
          <button
            onClick={() => setToast("إنشاء دور جديد جاهز للباك إند فقط. يلزم لاحقا role_policy API وسجل تدقيق قبل الإنتاج.")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors"
          >
            <Plus size={14} weight="bold" /> إنشاء دور جديد
          </button>
        )}
      </motion.div>

      <div className={`rounded-2xl border px-4 py-3 text-[12px] ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        {toast}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* Roles sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {roles.map((role, i) => (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => { setSelectedRole(role.id); setEditMode(false); }}
              className={`w-full ${card} p-4 text-right transition-all ${selectedRole === role.id ? "ring-2 ring-royal/40" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${role.color}/10`}>
                  <ShieldCheck size={18} weight="duotone" className={role.color.replace("bg-", "text-")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{role.name}</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {role.memberCount} {role.memberCount > 1 ? "أعضاء" : "عضو"} · {role.nameEn}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Permissions matrix */}
        <div className="lg:col-span-3">
          <div className={`${card} overflow-hidden`}>
            {/* Role header */}
            <div className={`p-4 flex items-center justify-between border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active.color}/10`}>
                  <ShieldCheck size={20} weight="duotone" className={active.color.replace("bg-", "text-")} />
                </div>
                <div>
                  <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                    صلاحيات: {active.name}
                  </h2>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {Object.values(active.permissions).filter(Boolean).length} / {allPermKeys.length} صلاحية مفعّلة
                  </p>
                </div>
              </div>
              {canEditRoles ? (
                <button
                  onClick={() => {
                    if (editMode) setToast(`تم تجهيز صلاحيات ${active.name} محليا فقط. الحفظ الحقيقي ينتظر Auth/RBAC API.`);
                    setEditMode(!editMode);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${
                    editMode
                      ? "bg-royal text-white border-royal"
                      : isDark ? "border-white/10 text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {editMode ? <><Check size={12} /> حفظ</> : <><PencilSimple size={12} /> تعديل</>}
                </button>
              ) : (
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${isDark ? "border-white/10 text-zinc-500" : "border-slate-200 text-slate-500"}`}>
                  عرض فقط
                </span>
              )}
            </div>

            {/* Permission groups */}
            <div className="divide-y divide-white/[0.04] dark:divide-white/[0.04]">
              {PERMISSION_GROUPS.map((group, gi) => {
                const GroupIcon = group.icon;
                return (
                  <motion.div key={group.group}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + gi * 0.05 }}
                    className="p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <GroupIcon size={14} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                        {group.group}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.permissions.map(perm => {
                        const enabled = active.permissions[perm.key];
                        return (
                          <div key={perm.key}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                              isDark
                                ? enabled ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-white/[0.02] border border-white/[0.04]"
                                : enabled ? "bg-emerald-50/50 border border-emerald-100" : "bg-slate-50/50 border border-slate-100"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {enabled
                                ? <LockOpen size={12} className="text-emerald-500" />
                                : <Lock size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
                              }
                              <span className={`text-[12px] ${
                                enabled
                                  ? isDark ? "text-zinc-200" : "text-slate-700"
                                  : isDark ? "text-zinc-500" : "text-slate-400"
                              }`}>
                                {perm.label}
                              </span>
                            </div>

                            {editMode ? (
                              <button
                                onClick={() => togglePermission(perm.key)}
                                className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-slate-300"}`}
                              >
                                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? "start-4" : "start-0.5"}`} />
                              </button>
                            ) : (
                              enabled
                                ? <Check size={14} weight="bold" className="text-emerald-500" />
                                : <X size={14} className={isDark ? "text-zinc-700" : "text-slate-200"} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
