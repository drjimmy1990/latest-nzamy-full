"use client";

import {
  Buildings,
  CheckCircle,
  CreditCard,
  ShieldCheck,
  UserCircle,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { SETTINGS_BACKEND_READY_MESSAGE, getSettingsRolePolicy } from "@/constants/settingsReadiness";
import { useUser } from "@/hooks/useUser";
import { BackendReadyNotice, SectionTitle } from "./_shared";

const CAPABILITY_LABELS = [
  { key: "canManageEntity", label: "إعدادات الكيان", icon: Buildings },
  { key: "canManageTeam", label: "الفريق والدعوات", icon: UsersThree },
  { key: "canManageBilling", label: "الفوترة والخطة", icon: CreditCard },
  { key: "canManageCompliance", label: "الامتثال والحوكمة", icon: ShieldCheck },
] as const;

const SCOPE_LABELS: Record<string, string> = {
  personal: "شخصي",
  entity: "الكيان كله",
  department: "قسم/إدارة",
  case: "ملف/قضية",
};

export function RoleScopeTab() {
  const user = useUser();
  const policy = getSettingsRolePolicy(user);
  const capabilities = CAPABILITY_LABELS.map((item) => ({
    ...item,
    enabled: policy[item.key],
  }));

  return (
    <div className="space-y-6">
      <BackendReadyNotice>{SETTINGS_BACKEND_READY_MESSAGE}</BackendReadyNotice>

      {policy.personalOnlyNotice && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
          {policy.personalOnlyNotice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-dark-card">
          <SectionTitle>نطاق الحساب</SectionTitle>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-royal text-white">
              <UserCircle size={26} weight="fill" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-white">{policy.roleLabel}</p>
              <p className="mt-1 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
                {policy.entityLabel
                  ? `هذا الحساب يعمل داخل ${policy.entityLabel}. ما يظهر في الإعدادات يتغير حسب الدور والصلاحيات.`
                  : "هذا الحساب فردي؛ لذلك الإعدادات تركز على الملف الشخصي والأمان والتفضيلات."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-dark-card">
          <SectionTitle>المقاعد/الحدود</SectionTitle>
          {policy.seatPolicy ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{policy.seatPolicy.label}</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {policy.seatPolicy.used} / {policy.seatPolicy.included} {policy.seatPolicy.unit}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-royal"
                  style={{
                    width: `${Math.min(100, Math.round((policy.seatPolicy.used / policy.seatPolicy.included) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">{policy.seatPolicy.overLimitMessage}</p>
            </div>
          ) : (
            <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">
              لا توجد مقاعد فريق لهذا النوع من الحساب في الإعدادات المختصرة.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-dark-card">
        <SectionTitle>ما الذي أستطيع إدارته؟</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {capabilities.map((capability) => {
            const Icon = capability.icon;
            return (
              <div
                key={capability.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 dark:border-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <Icon size={17} className="text-zinc-400" />
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{capability.label}</span>
                </div>
                {capability.enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle size={12} weight="fill" />
                    متاح
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <WarningCircle size={12} />
                    غير ظاهر
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {policy.inviteRoles.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-dark-card">
          <SectionTitle>أدوار الدعوة المسموحة</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {policy.inviteRoles.map((role) => (
              <div key={role.value} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{role.label}</span>
                <span className="text-[11px] font-semibold text-zinc-400">{SCOPE_LABELS[role.scope]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
