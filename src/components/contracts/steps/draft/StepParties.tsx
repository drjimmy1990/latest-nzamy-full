import { motion } from "framer-motion";
import { Buildings, User } from "@phosphor-icons/react";
import { PartyForm } from "@/components/contracts/SharedComponents";
import { PartyData } from "@/components/contracts/types";

interface StepPartiesProps {
  isDark: boolean;
  party1Data: PartyData;
  setParty1Data: (data: PartyData) => void;
  party2Data: PartyData;
  setParty2Data: (data: PartyData) => void;
}

export function StepParties({ isDark, party1Data, setParty1Data, party2Data, setParty2Data }: StepPartiesProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Vault hint */}
      <div className={`rounded-xl px-4 py-2.5 flex items-center gap-2 ${isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-200"}`}>
        <span className="text-[#C8A762] text-[13px]">✦</span>
        <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>بياناتك المحفوظة في <strong className="text-[#C8A762]">الخزنة</strong> ستُسحب تلقائياً — تحقق منها أو عدّلها</p>
      </div>
      {/* Party 1 */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-1">
          <Buildings size={16} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الطرف الأول (صاحب العمل / مقدم الخدمة)</p>
        </div>
        <PartyForm data={party1Data} onChange={(f, v) => setParty1Data({ ...party1Data, [f]: v })} isDark={isDark} />
      </div>
      {/* Party 2 */}
      <div className={`${card} p-5 shadow-sm`}>
        <div className="flex items-center gap-2 mb-1">
          <User size={16} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الطرف الثاني (العامل / العميل)</p>
        </div>
        <PartyForm data={party2Data} onChange={(f, v) => setParty2Data({ ...party2Data, [f]: v })} isDark={isDark} />
      </div>
    </motion.div>
  );
}
