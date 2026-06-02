import { CheckCircle } from "@phosphor-icons/react";

interface StepBarProps {
  step: number;
  isAr: boolean;
}

export function StepBar({ step, isAr }: StepBarProps) {
  const labels = isAr
    ? ["التخصص", "وصف المشكلة", "النوع والموعد", "التأكيد"]
    : ["Specialty", "Describe Issue", "Type & Timing", "Confirm"];

  return (
    <div className="flex items-center gap-0">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                done ? "bg-emerald-500 text-white" :
                active ? "bg-royal text-white shadow-[0_0_0_3px_rgba(11,61,46,0.15)]" :
                "bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-gray-500"
              }`}>
                {done ? <CheckCircle size={14} weight="fill" /> : n}
              </div>
              <span className={`mt-1 hidden text-[10px] font-medium sm:block ${
                active ? "text-royal dark:text-gold" : done ? "text-emerald-600" : "text-slate-400 dark:text-gray-600"
              }`}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 rounded-full transition-all ${
                step > n ? "bg-emerald-400" : "bg-slate-200 dark:bg-white/10"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
