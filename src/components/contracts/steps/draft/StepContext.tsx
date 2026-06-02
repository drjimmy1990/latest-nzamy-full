import { motion } from "framer-motion";
import { ChatCircleDots, Robot, CloudArrowUp } from "@phosphor-icons/react";
import { VoiceBtn } from "@/components/contracts/SharedComponents";

interface StepContextProps {
  isDark: boolean;
  contractDesc: string;
  setContractDesc: (v: string) => void;
  courtType: string;
  setCourtType: (v: string) => void;
  useFirmMemory: boolean;
  setUseFirmMemory: React.Dispatch<React.SetStateAction<boolean>>;
}

export function StepContext({ isDark, contractDesc, setContractDesc, courtType, setCourtType, useFirmMemory, setUseFirmMemory }: StepContextProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark
      ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"
    }`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Description */}
      <div className={`${card} p-5 shadow-sm space-y-3`}>
        <div className="flex items-center gap-2">
          <ChatCircleDots size={15} className="text-[#C8A762]" weight="duotone" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>صف فكرة العقد واحتياجاتك</p>
        </div>
        <div className="relative">
          <textarea value={contractDesc} onChange={e => setContractDesc(e.target.value)}
            placeholder="مثال: عقد عمل لمهندس برمجيات، يشمل راتب أساسي + حوافز + خيارات أسهم. مدة سنة قابلة للتمديد. أريد بند عدم منافسة وسرية صارم..."
            rows={4} className={`${inputCls} resize-none pe-20`} />
          <div className="absolute bottom-3 start-3"><VoiceBtn label="صوّت الفكرة" /></div>
        </div>
        <p className={`text-[11px] flex items-center gap-1.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
          <Robot size={12} className="text-[#C8A762]" />
          AI سيبحث بناءً على هذا الوصف في خطوة «أفضل الممارسات»
        </p>
      </div>

      {/* Court jurisdiction */}
      <div className={`${card} p-5 shadow-sm space-y-3`}>
        <div className="flex items-center gap-2">
          <span className="text-base">⚖️</span>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>الجهة القضائية المختصة</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              في حال نشأ نزاع حول هذا العقد — أي جهة ستختص بالفصل فيه؟ (يُضمّن AI هذا الاختيار في بنود فضّ النزاع)
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: "المحكمة العمالية",  desc: "عقود العمل وشؤون الموظفين" },
            { id: "المحكمة التجارية", desc: "عقود الشركات والصفقات" },
            { id: "المحكمة المدنية",  desc: "الإيجار والخدمات والمدني" },
            { id: "المحكمة الإدارية", desc: "عقود مع جهات حكومية" },
            { id: "التحكيم",          desc: "هيئة تحكيم خاصة (أسرع)" },
            { id: "لا ينطبق",         desc: "عقد غير رسمي / داخلي" },
          ].map(ct => (
            <button key={ct.id} onClick={() => setCourtType(ct.id)}
              className={`rounded-xl border py-2.5 px-3 text-start transition-all ${courtType === ct.id
                  ? isDark ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300" : "border-emerald-400/40 bg-emerald-50 text-emerald-700"
                  : isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/[0.12]" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                }`}>
              <p className="text-[12px] font-semibold">{ct.id}</p>
              <p className={`text-[10px] mt-0.5 ${courtType === ct.id ? "" : isDark ? "text-zinc-600" : "text-zinc-400"}`}>{ct.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Firm Memory RAG toggle */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <Robot size={17} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>استخدم ذاكرة مكتبك</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>AI يجمع بين قاعدة نظامي + عقودك وسوابق مكتبك للاقتراح</p>
          </div>
          <button onClick={() => setUseFirmMemory(v => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${useFirmMemory ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-zinc-300"
              }`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${useFirmMemory ? "start-5" : "start-0.5"
              }`} />
          </button>
        </div>
        {useFirmMemory && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-hidden">
            <p className={`text-[11px] mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ارفع عقوداً سابقة أو وثائق مكتبك لتحسين الاقتراحات:</p>
            <div className={`rounded-xl border-2 border-dashed p-4 text-center ${isDark ? "border-[#C8A762]/20" : "border-amber-200"}`}>
              <CloudArrowUp size={18} className={`mx-auto mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>PDF / Word / عقود سابقة</p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
