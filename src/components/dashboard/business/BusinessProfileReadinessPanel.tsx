"use client";

import Link from "next/link";
import {
  Buildings,
  CheckCircle,
  Gear,
  ShieldCheck,
  Storefront,
  Warning,
} from "@phosphor-icons/react";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useTheme } from "@/components/ThemeProvider";
import {
  BUSINESS_COMPANY_SIZE_LABEL,
  BUSINESS_LEGAL_STRUCTURE_LABEL,
  BUSINESS_SERVICE_ENTITLEMENTS,
  BUSINESS_SERVICE_MODEL_LABEL,
  resolveBusinessScenario,
  serviceKeyToFeatureFlag,
} from "@/constants/businessProfileReadiness";

interface BusinessProfileReadinessPanelProps {
  compact?: boolean;
}

export function BusinessProfileReadinessPanel({ compact = false }: BusinessProfileReadinessPanelProps) {
  const { isDark } = useTheme();
  const { currentCompanyFeatures, mounted } = useAdminSettings();

  const scenario = resolveBusinessScenario(
    currentCompanyFeatures.companySize,
    currentCompanyFeatures.legalStructure,
    currentCompanyFeatures.serviceModel,
  );

  const enabledServices = BUSINESS_SERVICE_ENTITLEMENTS.filter((service) => {
    const featureFlag = serviceKeyToFeatureFlag(service.key);
    if (!featureFlag) return scenario.recommendedServices.includes(service.key);
    return Boolean(currentCompanyFeatures[featureFlag as keyof typeof currentCompanyFeatures]);
  });

  const card = isDark
    ? "border-white/[0.06] bg-zinc-900/80 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const soft = isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-zinc-100 bg-zinc-50";

  return (
    <section className={`rounded-2xl border p-5 ${card}`} dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-[#0B3D2E]/25 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <Buildings size={22} weight="duotone" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-black">بروفيل الشركة التشغيلي</h2>
              <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                Backend-ready
              </span>
              {!mounted && (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  تحميل إعدادات الأدمن
                </span>
              )}
            </div>
            <p className={`mt-1 text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{scenario.title}</p>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{scenario.description}</p>
          </div>
        </div>

        <Link
          href="/dashboard/admin/business"
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${isDark ? "border-[#C8A762]/25 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#0B3D2E]/20 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"}`}
        >
          <Gear size={14} />
          إدارة من الأدمن
        </Link>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-4"}`}>
        {[
          { label: "حجم الشركة", value: BUSINESS_COMPANY_SIZE_LABEL[currentCompanyFeatures.companySize], icon: Buildings },
          { label: "الهيكل القانوني", value: BUSINESS_LEGAL_STRUCTURE_LABEL[currentCompanyFeatures.legalStructure], icon: ShieldCheck },
          { label: "نموذج الخدمة", value: BUSINESS_SERVICE_MODEL_LABEL[currentCompanyFeatures.serviceModel], icon: Storefront },
          { label: "قانوني داخلي", value: currentCompanyFeatures.hasInternalLegal ? "موجود" : "غير موجود", icon: CheckCircle },
        ].slice(0, compact ? 3 : 4).map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${soft}`}>
            <div className="flex items-center gap-2">
              <item.icon size={14} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
              <p className={`text-[10px] font-bold ${muted}`}>{item.label}</p>
            </div>
            <p className="mt-1 text-[12px] font-black">{item.value}</p>
          </div>
        ))}
      </div>

      {!compact && (
        <div className="mt-4">
          <p className={`mb-2 text-[11px] font-bold ${muted}`}>الخدمات الظاهرة لهذا البروفيل</p>
          <div className="flex flex-wrap gap-2">
            {enabledServices.slice(0, 9).map((service) => (
              <span
                key={service.key}
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
        <span>{scenario.backendBoundary} لا يوجد حفظ خادمي أو API حقيقي في هذه المرحلة.</span>
      </div>
    </section>
  );
}
