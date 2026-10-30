"use client";

import { Briefcase, ArrowLeft, ShieldCheck } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import Link from "next/link";
import circuitsRawData from "@/data/circuits-directory.json";
import { CircuitsDirectory, type CircuitRecord } from "@/components/directory/CircuitsDirectory";

const ALL_CIRCUITS: CircuitRecord[] = (circuitsRawData as { circuits: CircuitRecord[] }).circuits;

const REGIONS = [
  "منطقة الرياض",
  "منطقة مكة المكرمة",
  "المنطقة الشرقية",
  "منطقة المدينة المنورة",
  "منطقة القصيم",
  "منطقة عسير",
  "منطقة تبوك",
  "منطقة حائل",
  "منطقة الحدود الشمالية",
  "منطقة جازان",
  "منطقة نجران",
  "منطقة الباحة",
  "منطقة الجوف"
];

// Owner note ٠٧: the same shared CircuitsDirectory as the firm dashboard
// (cross-field operator search, multi-colour highlight, infinite scroll,
// one-click copy); the plan gate and the header stay here.
export default function BusinessCircuitsEmailsPage() {
  const { isDark } = useTheme();

  return (
    <SubscriptionGuard featureKey="business-litigation">
      <div className={`p-5 md:p-8 space-y-6 max-w-5xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/business"
              className={`p-2 rounded-xl transition-colors ${
                isDark ? "bg-white/[0.04] hover:bg-white/[0.08]" : "bg-zinc-100 hover:bg-zinc-200"
              }`}
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <Briefcase className="text-[#C8A762]" weight="duotone" />
                دليل إيميلات الدوائر القضائية
              </h1>
              <p className={isDark ? "text-zinc-400" : "text-zinc-600"}>
                عناوين البريد الإلكتروني الرسمية لـ 2,192 دائرة وجهة قضائية معتمدة بوزارة العدل.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={14} weight="fill" />
            2,192 جهة معتمدة
          </span>
        </div>

        <CircuitsDirectory circuits={ALL_CIRCUITS} isDark={isDark} regions={REGIONS} pageSize={25} />
      </div>
    </SubscriptionGuard>
  );
}
