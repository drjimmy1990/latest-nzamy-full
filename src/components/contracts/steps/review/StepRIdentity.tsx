import { motion } from "framer-motion";
import { UserFocus } from "@phosphor-icons/react";
import { VoiceBtn } from "@/components/contracts/SharedComponents";

interface StepRIdentityProps {
  isDark: boolean;
  rPartyFocus: string;
  setRPartyFocus: (v: string) => void;
  rFears: string;
  setRFears: (v: string) => void;
  rOtherParty: string;
  setROtherParty: (v: string) => void;
}

export function StepRIdentity({ isDark, rPartyFocus, setRPartyFocus, rFears, setRFears, rOtherParty, setROtherParty }: StepRIdentityProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark
      ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"
    }`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5 shadow-sm space-y-4`}>
        <div className="flex items-center gap-2 mb-2">
          <UserFocus size={16} className="text-[#C8A762]" weight="duotone" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>من أنت وما هو تركيزك؟</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-[12px] font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>أنت تمثل أي طرف في العقد؟</label>
            <div className="relative">
              <textarea value={rPartyFocus} onChange={e => setRPartyFocus(e.target.value)} placeholder="مثال: أنا أمثل الشركة المطورة (الطرف الأول)..." rows={2} className={`${inputCls} resize-none pe-12`} />
              <div className="absolute top-2.5 end-2"><VoiceBtn /></div>
            </div>
          </div>

          <div>
            <label className={`block text-[12px] font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ما المخاطر التي تخشاها أو نقطة تركيزك؟</label>
            <div className="relative">
              <textarea value={rFears} onChange={e => setRFears(e.target.value)} placeholder="مثال: أخشى من الشروط الجزائية القاسية وعدم وضوح تاريخ التسليم..." rows={3} className={`${inputCls} resize-none pe-12`} />
              <div className="absolute top-2.5 end-2"><VoiceBtn /></div>
            </div>
          </div>

          <div>
            <label className={`block text-[12px] font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اسم الطرف الآخر (اختياري)</label>
            <input value={rOtherParty} onChange={e => setROtherParty(e.target.value)} placeholder="اسم الشركة أو الفرد الآخر" className={inputCls} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
