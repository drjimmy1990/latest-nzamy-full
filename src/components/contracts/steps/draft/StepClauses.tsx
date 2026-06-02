import { motion } from "framer-motion";
import { Check, Sparkle, PencilLine, X, Plus } from "@phosphor-icons/react";
import { VoiceBtn } from "@/components/contracts/SharedComponents";

interface StepClausesProps {
  isDark: boolean;
  clauses: any[];
  setClauses: React.Dispatch<React.SetStateAction<any[]>>;
  clauseEdits: Record<number, string>;
  setClauseEdits: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  newClause: string;
  setNewClause: (v: string) => void;
  additionalClauses: string[];
  setAdditionalClauses: React.Dispatch<React.SetStateAction<string[]>>;
}

export function StepClauses({
  isDark, clauses, setClauses, clauseEdits, setClauseEdits, newClause, setNewClause, additionalClauses, setAdditionalClauses
}: StepClausesProps) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none ${isDark
      ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"
    }`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>البنود المقترحة — اختر وعدّل</p>

      {clauses.map((clause, i) => (
        <motion.div key={clause.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className={`${card} p-3.5 shadow-sm`}>
          <div className="flex items-start gap-3">
            <button onClick={() => setClauses(prev => prev.map(c => c.id === clause.id ? { ...c, checked: !c.checked } : c))}
              className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded flex items-center justify-center border transition-colors ${clause.checked ? "bg-[#0B3D2E] border-[#0B3D2E]" : isDark ? "border-white/[0.12]" : "border-zinc-300"
                }`}>
              {clause.checked && <Check size={12} className="text-white" weight="bold" />}
            </button>
            <div className="flex-1">
              {clauseEdits[clause.id] !== undefined ? (
                <div className="space-y-1.5">
                  <input
                    value={clauseEdits[clause.id]}
                    onChange={e => setClauseEdits(prev => ({ ...prev, [clause.id]: e.target.value }))}
                    className={`${inputCls} text-[12px] py-1.5`}
                  />
                  <div className="flex items-center gap-2">
                    <VoiceBtn label="صوّت التعديل" />
                    <button onClick={() => setClauseEdits(prev => { const n = { ...prev }; delete n[clause.id]; return n; })}
                      className={`text-[10px] ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
                      إلغاء التعديل
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={`text-[13px] font-semibold flex-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{clause.title}</p>
                  <button
                    onClick={() => setClauseEdits(prev => ({ ...prev, [clause.id]: clause.title }))}
                    className={`text-[10px] font-bold rounded-lg px-2 py-0.5 border transition-colors ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-amber-400 hover:border-amber-500/30" : "border-zinc-200 text-zinc-400 hover:text-amber-600 hover:border-amber-400"}`}>
                    <PencilLine size={10} className="inline me-0.5" />
                    تعديل
                  </button>
                </div>
              )}
              {clause.aiSuggestion && !clauseEdits[clause.id] && (
                <div className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${isDark ? "text-[#C8A762]/80" : "text-amber-600"}`}>
                  <Sparkle size={10} className="flex-shrink-0 mt-0.5" weight="fill" />
                  {clause.aiSuggestion}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      ))}

      {/* Additional clauses */}
      {additionalClauses.length > 0 && (
        <div className="space-y-2">
          {additionalClauses.map((ac, i) => (
            <div key={i} className={`${card} p-3 flex items-center gap-2`}>
              <Check size={14} className="text-emerald-500 flex-shrink-0" />
              <span className={`flex-1 text-[12px] ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{ac}</span>
              <button onClick={() => setAdditionalClauses(prev => prev.filter((_, j) => j !== i))}>
                <X size={13} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add additional clause */}
      <div className={`${card} p-4 space-y-3 shadow-sm`}>
        <p className={`text-[12px] font-bold flex items-center gap-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          <Plus size={13} />
          هل لديك بنود إضافية؟
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={newClause}
              onChange={e => setNewClause(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newClause.trim()) {
                  setAdditionalClauses(prev => [...prev, newClause.trim()]);
                  setNewClause("");
                }
              }}
              placeholder="اكتب اسم البند وفكرته... (Enter لإضافة)"
              className={`${inputCls} pe-14`}
            />
            <div className="absolute inset-y-0 end-2 flex items-center"><VoiceBtn /></div>
          </div>
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={() => { if (newClause.trim()) { setAdditionalClauses(prev => [...prev, newClause.trim()]); setNewClause(""); } }}
            disabled={!newClause.trim()}
            className="flex-shrink-0 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-30">
            <Plus size={14} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
