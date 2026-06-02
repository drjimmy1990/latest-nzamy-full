import React from "react";
import { Check, Package } from "@phosphor-icons/react";
import Link from "next/link";
import { STEP_LABELS } from "@/constants/clientConsultationData";

export function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                done   ? "bg-emerald-500 text-white" :
                active ? "bg-[#0B3D2E] text-white ring-2 ring-[#0B3D2E]/30 ring-offset-2 dark:ring-offset-[#0d1117]" :
                "bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-zinc-600"
              }`}>
                {done ? <Check size={14} weight="bold" /> : n}
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${
                active ? "text-[#0B3D2E] dark:text-emerald-400" :
                done   ? "text-emerald-500" :
                "text-gray-400 dark:text-zinc-600"
              }`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-px flex-1 mx-2 mb-4 transition-all ${done ? "bg-emerald-400" : "bg-gray-200 dark:bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PlanBadge({ isDark, included, used, limit, basePrice }: {
  isDark: boolean;
  included: boolean;
  used: number;
  limit: number;
  basePrice: number;
}) {
  if (included && used < limit) {
    return (
      <div className={`flex items-center gap-2 p-3 rounded-xl mb-5 ${isDark ? "bg-emerald-900/20 border border-emerald-700/30" : "bg-emerald-50 border border-emerald-200"}`}>
        <Check size={14} className="text-emerald-500 flex-shrink-0" weight="bold" />
        <p className={`text-[12px] font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
          مشمولة في باقتك — بدون تكلفة إضافية
        </p>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2.5 p-3 rounded-xl mb-5 ${isDark ? "bg-blue-900/15 border border-blue-700/20" : "bg-blue-50 border border-blue-200"}`}>
      <Package size={14} className={isDark ? "text-blue-400 flex-shrink-0" : "text-blue-600 flex-shrink-0"} />
      <p className={`text-[12px] font-semibold ${isDark ? "text-blue-300" : "text-blue-700"}`}>
        باقتك لا تشمل استشارات — السعر بالعمل القانوني:{" "}
        <strong>{basePrice.toLocaleString("ar-SA")} ر.س</strong>
        {" · أو "}
        <Link href="/dashboard/client/wallet" className="underline hover:opacity-80">ارقِّ الباقة ←</Link>
      </p>
    </div>
  );
}
