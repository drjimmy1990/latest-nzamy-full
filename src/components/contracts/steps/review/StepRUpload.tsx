import { motion } from "framer-motion";
import { CloudArrowUp } from "@phosphor-icons/react";
import { CONTRACT_TYPES } from "@/components/contracts/constants";

interface StepRUploadProps {
  isDark: boolean;
  contractType: string;
  setContractType: (type: string) => void;
}

export function StepRUpload({ isDark, contractType, setContractType }: StepRUploadProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>اختر مجال العقد</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {CONTRACT_TYPES.map(ct => (
            <button key={ct.id} onClick={() => setContractType(ct.id)}
              className={`rounded-xl border p-3 text-start transition-colors ${contractType === ct.id
                  ? isDark ? "border-[#0B3D2E] bg-[#0B3D2E]/20" : "border-[#0B3D2E] bg-[#0B3D2E]/5"
                  : isDark ? "border-white/[0.08] hover:bg-white/[0.04]" : "border-zinc-200 hover:bg-zinc-50"
                }`}>
              <p className={`text-[12px] font-bold mb-1 ${contractType === ct.id ? "text-[#0B3D2E] dark:text-[#C8A762]" : isDark ? "text-zinc-300" : "text-zinc-700"}`}>{ct.title}</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{ct.desc}</p>
            </button>
          ))}
        </div>

        <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ارفع ملف العقد (متطلب)</p>
        <div className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${isDark ? "border-white/[0.07] hover:border-[#C8A762]/40 hover:bg-white/[0.02]" : "border-zinc-300 hover:border-[#0B3D2E]/40 hover:bg-zinc-50"
          }`}>
          <CloudArrowUp size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>اسحب وأفلت الملف هنا أو انقر للرفع</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>PDF أو Word (الحد الأقصى 20 م.ب)</p>
        </div>
      </div>
    </motion.div>
  );
}
