import { motion } from "framer-motion";

interface StepRDecisionsProps {
  isDark: boolean;
  rClauseDecisions: Record<string, "accept" | "edit" | "reject"> | null;
  setRClauseDecisions: React.Dispatch<React.SetStateAction<Record<string, "accept" | "edit" | "reject"> | null>>;
}

export function StepRDecisions({ isDark, rClauseDecisions, setRClauseDecisions }: StepRDecisionsProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark
      ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"
    }`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5`}>
        <p className={`text-[13px] font-bold mb-4 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>قراراتك حيال البنود الخطرة والمختلف عليها</p>

        <div className={`p-4 rounded-xl border ${isDark ? "border-white/[0.08]" : "border-zinc-200"}`}>
          <div className="flex justify-between items-center mb-3">
            <p className={`text-[12px] font-bold text-red-500`}>البند الرابع: الشروط الجزائية</p>
            <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>1 / 2</span>
          </div>

          {rClauseDecisions?.["c1"] === "edit" ? (
            <textarea className={`${inputCls} mb-3 resize-none`} rows={3} defaultValue="يُعدل البند ليكون: يحق للطرف الأول إنهاء العقد بعد توجيه إنذار خطي ومنح مهلة تصحيح مدتها 15 يوم عمل..." />
          ) : (
            <p className={`text-[11px] mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>"يحق للطرف الأول إنهاء العقد ومصادرة الدفعة المقدمة دون إنذار مسبق..."</p>
          )}

          <div className="flex gap-2">
            <button onClick={() => setRClauseDecisions(p => ({ ...(p || {}), c1: "accept" }))}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg border transition ${rClauseDecisions?.c1 === "accept" ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" : isDark ? "border-white/[0.1] hover:bg-white/[0.04] text-zinc-300" : "border-zinc-200 hover:bg-zinc-50 text-zinc-600"}`}>قبول</button>
            <button onClick={() => setRClauseDecisions(p => ({ ...(p || {}), c1: "edit" }))}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg border transition ${rClauseDecisions?.c1 === "edit" ? "bg-blue-500/10 border-blue-500/50 text-blue-500" : isDark ? "border-white/[0.1] hover:bg-white/[0.04] text-zinc-300" : "border-zinc-200 hover:bg-zinc-50 text-zinc-600"}`}>تعديل بصياغتي</button>
            <button onClick={() => setRClauseDecisions(p => ({ ...(p || {}), c1: "reject" }))}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg border transition ${rClauseDecisions?.c1 === "reject" ? "bg-red-500/10 border-red-500/50 text-red-500" : isDark ? "border-white/[0.1] hover:bg-white/[0.04] text-zinc-300" : "border-zinc-200 hover:bg-zinc-50 text-zinc-600"}`}>رفض كلياً</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
