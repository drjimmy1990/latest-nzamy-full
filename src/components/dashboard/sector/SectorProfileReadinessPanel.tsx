"use client";

import Link from "next/link";
import {
  Buildings,
  CheckCircle,
  Gear,
  Gavel,
  HandHeart,
  ShieldCheck,
  Storefront,
  Warning,
} from "@phosphor-icons/react";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useTheme } from "@/components/ThemeProvider";
import {
  GOVERNMENT_ENTITY_TYPE_LABEL,
  GOVERNMENT_PLAN_LABEL,
  MICRO_BUSINESS_TYPE_LABEL,
  MICRO_PLAN_LABEL,
  NGO_ORGANIZATION_TYPE_LABEL,
  NGO_PLAN_LABEL,
  getSectorEntitlements,
  resolveGovernmentScenario,
  resolveMicroScenario,
  resolveNgoScenario,
  sectorServiceKeyToFeatureFlag,
} from "@/constants/sectorProfileReadiness";
import type { GovernmentServiceKey, MicroServiceKey, NgoServiceKey, SectorProfileType } from "@/types/sectorBackendReady";

interface SectorProfileReadinessPanelProps {
  sector: SectorProfileType;
  compact?: boolean;
}

type FeatureRecord = Record<string, unknown>;

export function SectorProfileReadinessPanel({ sector, compact = false }: SectorProfileReadinessPanelProps) {
  const { isDark } = useTheme();
  const {
    currentGovernmentProfile,
    currentNgoProfile,
    currentMicroProfile,
    mounted,
  } = useAdminSettings();

  const card = isDark
    ? "border-white/[0.06] bg-zinc-900/80 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const soft = isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-zinc-100 bg-zinc-50";

  const config = (() => {
    if (sector === "government") {
      const scenario = resolveGovernmentScenario(currentGovernmentProfile.entityType);
      return {
        title: "جاهزية الجهة الحكومية",
        subtitle: scenario.title,
        description: scenario.description,
        boundary: scenario.backendBoundary,
        icon: Gavel,
        features: currentGovernmentProfile as unknown as FeatureRecord,
        metrics: [
          { label: "نوع الجهة", value: GOVERNMENT_ENTITY_TYPE_LABEL[currentGovernmentProfile.entityType], icon: Buildings },
          { label: "الخطة", value: GOVERNMENT_PLAN_LABEL[currentGovernmentProfile.plan], icon: Storefront },
          { label: "المستخدمون", value: `${currentGovernmentProfile.activeUsers} مستخدم`, icon: CheckCircle },
          { label: "SSO", value: currentGovernmentProfile.hasSso ? "موسوم pending" : "غير مفعل", icon: ShieldCheck },
        ],
      };
    }

    if (sector === "ngo") {
      const scenario = resolveNgoScenario(currentNgoProfile.organizationType);
      return {
        title: "جاهزية الجمعية/الوقف",
        subtitle: scenario.title,
        description: scenario.description,
        boundary: scenario.backendBoundary,
        icon: HandHeart,
        features: currentNgoProfile as unknown as FeatureRecord,
        metrics: [
          { label: "نوع الجهة", value: NGO_ORGANIZATION_TYPE_LABEL[currentNgoProfile.organizationType], icon: Buildings },
          { label: "الخطة", value: NGO_PLAN_LABEL[currentNgoProfile.plan], icon: Storefront },
          { label: "المتطوعون", value: `${currentNgoProfile.activeVolunteers}/${currentNgoProfile.volunteersLimit}`, icon: CheckCircle },
          { label: "مجلس الإدارة", value: `${currentNgoProfile.boardSeats} مقاعد`, icon: ShieldCheck },
        ],
      };
    }

    const scenario = resolveMicroScenario(currentMicroProfile.businessType);
    return {
      title: "جاهزية درع المنشأة",
      subtitle: scenario.title,
      description: scenario.description,
      boundary: scenario.backendBoundary,
      icon: Buildings,
      features: currentMicroProfile as unknown as FeatureRecord,
      metrics: [
        { label: "نوع النشاط", value: MICRO_BUSINESS_TYPE_LABEL[currentMicroProfile.businessType], icon: Buildings },
        { label: "الخطة", value: MICRO_PLAN_LABEL[currentMicroProfile.plan], icon: Storefront },
        { label: "الموظفون", value: `${currentMicroProfile.employeesCount}`, icon: CheckCircle },
        { label: "درجة الاشتراطات", value: `${currentMicroProfile.requirementsScore}%`, icon: ShieldCheck },
      ],
    };
  })();

  const entitlements = getSectorEntitlements(sector).filter((service) => {
    const featureFlag = sectorServiceKeyToFeatureFlag(
      sector,
      service.key as GovernmentServiceKey | NgoServiceKey | MicroServiceKey,
    );
    if (!featureFlag) return true;
    return Boolean(config.features[featureFlag]);
  });
  const Icon = config.icon;

  return (
    <section className={`rounded-2xl border p-5 ${card}`} dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-[#0B3D2E]/25 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <Icon size={22} weight="duotone" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-black">{config.title}</h2>
              <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                Backend-ready
              </span>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                Beta local
              </span>
              {!mounted && (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  تحميل إعدادات الأدمن
                </span>
              )}
            </div>
            <p className={`mt-1 text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{config.subtitle}</p>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{config.description}</p>
          </div>
        </div>

        <Link
          href="/dashboard/admin/sector-profiles"
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${isDark ? "border-[#C8A762]/25 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#0B3D2E]/20 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"}`}
        >
          <Gear size={14} />
          إدارة من أدمن نظامي
        </Link>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-4"}`}>
        {config.metrics.slice(0, compact ? 3 : 4).map((metric) => (
          <div key={metric.label} className={`rounded-xl border p-3 ${soft}`}>
            <div className="flex items-center gap-2">
              <metric.icon size={14} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
              <p className={`text-[10px] font-bold ${muted}`}>{metric.label}</p>
            </div>
            <p className="mt-1 text-[12px] font-black">{metric.value}</p>
          </div>
        ))}
      </div>

      {!compact && (
        <div className="mt-4">
          <p className={`mb-2 text-[11px] font-bold ${muted}`}>الأسطح المفعلة لهذا البروفيل</p>
          <div className="flex flex-wrap gap-2">
            {entitlements.slice(0, 10).map((service) => (
              <span
                key={`${service.sector}-${service.key}`}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  service.readiness === "UI Working"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                    : "border-blue-500/25 bg-blue-500/10 text-blue-300"
                }`}
              >
                {service.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
        <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
        <span>{config.boundary} لا يوجد حفظ خادمي أو Billing/RBAC/Entitlements API في هذه المرحلة.</span>
      </div>
    </section>
  );
}
