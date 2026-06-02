import { motion } from "framer-motion";
import { BookOpen, MagnifyingGlass, CheckCircle, Lightning, Check } from "@phosphor-icons/react";
import { CONTRACT_TYPES } from "@/components/contracts/constants";

interface StepBestPracticesProps {
  isDark: boolean;
  contractType: string;
  bestPractices: any[];
  bpSearching: boolean;
  bpDone: boolean;
  startBPSearch: () => void;
  deepSearch: boolean;
  setDeepSearch: React.Dispatch<React.SetStateAction<boolean>>;
  skipBP: boolean;
  setSkipBP: React.Dispatch<React.SetStateAction<boolean>>;
  appliedBP: Set<string>;
  setAppliedBP: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function StepBestPractices({
  isDark, contractType, bestPractices, bpSearching, bpDone, startBPSearch,
  deepSearch, setDeepSearch, skipBP, setSkipBP, appliedBP, setAppliedBP
}: StepBestPracticesProps) {
  if (skipBP) return null;

  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {!bpDone && !bpSearching && (
        <div className={`${card} p-6 space-y-5 shadow-sm`}>
          <div className="text-center space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] mx-auto">
              <BookOpen size={24} weight="duotone" className="text-[#C8A762]" />
            </div>
            <div>
              <p className={`font-bold text-[15px] mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>مراجعة وفق أفضل الممارسات التشريعية</p>
              <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                AI سيبحث في الأنظمة السعودية والإنترنت بناءً على وصفك وبنودك ليقترح أفضل الممارسات لعقد
                {" "}<strong className="text-[#C8A762]">{CONTRACT_TYPES.find(c => c.id === contractType)?.title}</strong>
              </p>
            </div>
          </div>

          {/* Deep Search Toggle */}
          <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${deepSearch ? (isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10" : "border-amber-300 bg-amber-50") : (isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50")}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-100/50"}`}>
                <MagnifyingGlass size={17} weight="duotone" className="text-[#C8A762]" />
              </div>
              <div>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>هل تريد بحث موسّع؟</p>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>AI سيقوم ببحث أعمق في سوابق العقود المشابهة والقرارات القضائية الحديثة، يستغرق وقتاً أطول.</p>
              </div>
            </div>
            <button onClick={() => setDeepSearch(prev => !prev)}
              className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${deepSearch ? "bg-[#C8A762]" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${deepSearch ? "start-5" : "start-0.5"}`} />
            </button>
          </div>

          <div className="flex gap-3 justify-center">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={startBPSearch}
              className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-[13px] font-bold text-white shadow-sm transition-all ${deepSearch ? "bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]" : "bg-[#0B3D2E]"}`}>
              <MagnifyingGlass size={15} /> {deepSearch ? "ابدأ البحث الموسّع" : "ابدأ البحث"}
            </motion.button>
            <button onClick={() => setSkipBP(true)}
              className={`text-[12px] px-4 py-2.5 rounded-xl border ${isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-zinc-200 text-zinc-400 hover:text-zinc-600"}`}>
              تخطى
            </button>
          </div>
        </div>
      )}

      {bpSearching && (
        <div className={`${card} p-8 text-center space-y-4`}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className={`h-12 w-12 rounded-2xl flex items-center justify-center mx-auto ${deepSearch ? "bg-gradient-to-tr from-[#0B3D2E] to-[#C8A762]" : "bg-[#0B3D2E]"}`}>
            <MagnifyingGlass size={20} className={deepSearch ? "text-white" : "text-[#C8A762]"} />
          </motion.div>
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
            {deepSearch ? "AI يجري بحثاً موسعاً وتاريخياً..." : "AI يبحث في الأنظمة والمنصة..."}
          </p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            {deepSearch ? "سوابق العقود المشابهة · المبادئ القضائية الحديثة · أفضل الممارسات" : "قاعدة البيانات القانونية · الجريدة الرسمية · الإنترنت"}
          </p>
        </div>
      )}

      {bpDone && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 px-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <CheckCircle size={15} className="text-emerald-500" />
            <p className="text-[12px] font-bold">نتائج البحث — أفضل الممارسات لعقد {CONTRACT_TYPES.find(c => c.id === contractType)?.title}</p>
          </div>
          {bestPractices.map((bp, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={`${card} p-4 shadow-sm`}>
              <div className="flex items-start gap-3">
                <Lightning size={14} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="fill" />
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{bp.title}</p>
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{bp.desc}</p>
                  <p className={`text-[10px] font-mono mt-1 ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>المرجع: {bp.source}</p>
                </div>
                <button
                  onClick={() => setAppliedBP(prev => { const n = new Set(prev); n.has(bp.title) ? n.delete(bp.title) : n.add(bp.title); return n; })}
                  className={`flex-shrink-0 text-[11px] font-bold rounded-xl px-3 py-1.5 border transition-colors ${appliedBP.has(bp.title)
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-amber-300 text-amber-700 hover:bg-amber-100"
                    }`}>
                  {appliedBP.has(bp.title) ? <><Check size={11} className="inline me-1" />مُضاف</> : "+ أضف للعقد"}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
