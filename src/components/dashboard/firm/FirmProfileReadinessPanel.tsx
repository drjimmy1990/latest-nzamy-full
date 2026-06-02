"use client";

import Link from "next/link";
import {
  Buildings,
  CheckCircle,
  Coins,
  Gear,
  ShieldCheck,
  Storefront,
  Warning,
} from "@phosphor-icons/react";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useTheme } from "@/components/ThemeProvider";
import {
  FIRM_PRACTICE_MODEL_LABEL,
  FIRM_SERVICE_ENTITLEMENTS,
  FIRM_SIZE_LABEL,
  FIRM_STRUCTURE_LABEL,
  firmServiceKeyToFeatureFlag,
  resolveFirmScenario,
} from "@/constants/firmProfileReadiness";

interface FirmProfileReadinessPanelProps {
  compact?: boolean;
}

export function FirmProfileReadinessPanel({ compact = false }: FirmProfileReadinessPanelProps) {
  const { isDark } = useTheme();
  const { currentFirmFeatures, mounted } = useAdminSettings();

  const scenario = resolveFirmScenario(
    currentFirmFeatures.firmSize,
    currentFirmFeatures.structure,
    currentFirmFeatures.practiceModel,
  );

  const enabledServices = FIRM_SERVICE_ENTITLEMENTS.filter((service) => {
    const featureFlag = firmServiceKeyToFeatureFlag(service.key);
    if (!featureFlag) return scenario.recommendedServices.includes(service.key);
    return Boolean(currentFirmFeatures[featureFlag as keyof typeof currentFirmFeatures]);
  });

  const spent = Math.max(currentFirmFeatures.annualPoints - currentFirmFeatures.availablePoints, 0);
  const spentPct = currentFirmFeatures.annualPoints > 0
    ? Math.min(Math.round((spent / currentFirmFeatures.annualPoints) * 100), 100)
    : 0;

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
              <h2 className="text-[15px] font-black">بروفيل شركة المحاماة التشغيلي</h2>
              <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                Backend-ready
              </span>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                Beta
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
          href="/dashboard/admin/provider-verification/firms"
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${isDark ? "border-[#C8A762]/25 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#0B3D2E]/20 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"}`}
        >
          <Gear size={14} />
          إدارة من الأدمن
        </Link>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-5"}`}>
        {[
          { label: "حجم الشركة", value: FIRM_SIZE_LABEL[currentFirmFeatures.firmSize], icon: Buildings },
          { label: "الهيكل", value: FIRM_STRUCTURE_LABEL[currentFirmFeatures.structure], icon: ShieldCheck },
          { label: "نموذج الممارسة", value: FIRM_PRACTICE_MODEL_LABEL[currentFirmFeatures.practiceModel], icon: Storefront },
          { label: "المقاعد", value: `${currentFirmFeatures.activeSeats}/${currentFirmFeatures.baseSeats} أساسي`, icon: CheckCircle },
          { label: "النقاط المتاحة", value: currentFirmFeatures.availablePoints.toLocaleString("ar-SA"), icon: Coins },
        ].slice(0, compact ? 3 : 5).map((item) => (
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
        <>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className={`text-[11px] font-bold ${muted}`}>صرف نقاط الشركة</p>
              <p className={`text-[11px] font-bold ${muted}`}>
                {spent.toLocaleString("ar-SA")} / {currentFirmFeatures.annualPoints.toLocaleString("ar-SA")}
              </p>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
              <div className={`h-full rounded-full ${spentPct > 85 ? "bg-red-500" : spentPct > 65 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${spentPct}%` }} />
            </div>
            <p className={`mt-2 text-[11px] leading-relaxed ${muted}`}>
              نفاد النقاط يوقف الخدمات الاستهلاكية فقط مثل AI المتقدم وOCR والترجمة والتحليل الضخم، ولا يوقف القضايا والعملاء والفريق والمستندات الأساسية.
            </p>
          </div>

          <div className="mt-4">
            <p className={`mb-2 text-[11px] font-bold ${muted}`}>الخدمات الظاهرة لهذا البروفيل</p>
            <div className="flex flex-wrap gap-2">
              {enabledServices.slice(0, 10).map((service) => (
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
        </>
      )}

      <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
        <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
        <span>{scenario.backendBoundary} لا يوجد حفظ خادمي أو Wallet/Billing/RBAC API حقيقي في هذه المرحلة.</span>
      </div>
    </section>
  );
}
