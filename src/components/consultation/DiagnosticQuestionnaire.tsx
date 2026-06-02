"use client";

import { motion } from "framer-motion";
import { Warning, CheckCircle, Check } from "@phosphor-icons/react";
import { DiagnosticQuestion } from "@/app/ai/consult/diagnosticQuestions";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  text?: string;
  time: string;
  questions?: DiagnosticQuestion[];
}

interface DiagnosticQuestionnaireProps {
  msg: Message;
  selectedChoices: Record<string, string>;
  setSelectedChoices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  finalizedMessages: Record<string, boolean>;
  handleFinalizeDiagnostic: (
    messageId: string,
    questions: DiagnosticQuestion[],
    answers: Record<string, string>
  ) => Promise<void>;
  isDark: boolean;
}

export default function DiagnosticQuestionnaire({
  msg,
  selectedChoices,
  setSelectedChoices,
  finalizedMessages,
  handleFinalizeDiagnostic,
  isDark,
}: DiagnosticQuestionnaireProps) {
  if (!msg.questions) return null;

  return (
    <div
      className={`p-5 rounded-2xl border ${
        isDark ? "bg-[#0B3D2E]/5 border-[#0B3D2E]/20" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/10"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[#0B3D2E] mb-4">
        <Warning size={16} weight="fill" className="text-[#C8A762]" />
        <span className="text-[12.5px] font-black">الاستبيان التشخيصي لتدقيق الموقف النظامي (3 أسئلة)</span>
      </div>

      {finalizedMessages[msg.id] ? (
        <div className="space-y-3">
          <div className="text-[12px] font-black text-emerald-500 flex items-center gap-2">
            <CheckCircle size={16} weight="fill" />
            <span>تم استيفاء وتأكيد الاستبيان التشخيصي بنجاح وتحديث خطة العمل.</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-[11px] font-semibold opacity-70 pl-2">
            {msg.questions.map((q) => (
              <div key={q.id}>
                • {q.question.slice(3)}: <span className="text-[#C8A762]">{selectedChoices[`${msg.id}-${q.id}`]}</span>
              </div>
            ))}
            {selectedChoices[`${msg.id}-notes`] && (
              <div className="mt-2 p-3 rounded-xl border border-dashed border-[#C8A762]/30 bg-[#C8A762]/5 text-[11px] leading-relaxed text-zinc-400">
                <span className="font-extrabold text-[#C8A762] block mb-1">📝 ملاحظاتك الإضافية التي تم تحليلها:</span>
                <p className="italic">{selectedChoices[`${msg.id}-notes`]}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {msg.questions.map((q) => {
            const selectedVal = selectedChoices[`${msg.id}-${q.id}`];
            const hasCustomVal = selectedVal && !q.options.includes(selectedVal);
            
            return (
              <div key={q.id} className="space-y-2 border-b border-zinc-200/5 pb-3 last:border-b-0">
                <label className="block text-[11.5px] font-black opacity-85">
                  {q.question}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {q.options.map((opt) => {
                    const isSelected = selectedVal === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setSelectedChoices((prev) => ({
                            ...prev,
                            [`${msg.id}-${q.id}`]: opt,
                          }))
                        }
                        className={`px-3 py-2 rounded-xl border text-[10.5px] font-extrabold transition-all text-center ${
                          isSelected
                            ? "border-[#C8A762] bg-[#0B3D2E]/10 text-[#C8A762]"
                            : isDark
                            ? "border-white/5 bg-zinc-900 hover:border-[#C8A762]/30 text-zinc-300"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-sm"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                
                {q.allowCustomInput && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="أو اكتب تفاصيل / قيمة مخصصة هنا..."
                      value={hasCustomVal ? selectedVal : ""}
                      onChange={(e) =>
                        setSelectedChoices((prev) => ({
                          ...prev,
                          [`${msg.id}-${q.id}`]: e.target.value,
                        }))
                      }
                      className={`flex-1 px-3 py-2 rounded-xl border text-[11px] font-medium outline-none transition-colors ${
                        isDark 
                          ? "bg-zinc-900 border-white/10 focus:border-[#C8A762] text-zinc-200" 
                          : "bg-white border-zinc-200 focus:border-[#0B3D2E] text-zinc-800"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Observations and notes field */}
          <div className="space-y-2 border-t border-zinc-200/5 pt-3">
            <label className="block text-[11.5px] font-black opacity-85">
              📝 ملاحظات أو تفاصيل إضافية (اختياري)
            </label>
            <textarea
              placeholder="اكتب هنا أي تفاصيل أو وقائع إضافية تود تضمينها في تقرير التشخيص..."
              rows={2}
              value={selectedChoices[`${msg.id}-notes`] || ""}
              onChange={(e) =>
                setSelectedChoices((prev) => ({
                  ...prev,
                  [`${msg.id}-notes`]: e.target.value,
                }))
              }
              className={`w-full px-3 py-2.5 rounded-xl border text-[11px] font-medium outline-none resize-none transition-colors ${
                isDark 
                  ? "bg-zinc-900 border-white/10 focus:border-[#C8A762] text-zinc-200" 
                  : "bg-white border-zinc-200 focus:border-[#0B3D2E] text-zinc-800 focus:bg-white"
              }`}
            />
          </div>

          {/* Confirm and final diagnostic button */}
          {msg.questions.every((q) => selectedChoices[`${msg.id}-${q.id}`]) && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleFinalizeDiagnostic(msg.id, msg.questions!, selectedChoices)}
              className="mt-4 w-full py-3 rounded-xl bg-[#0B3D2E] hover:bg-[#0a3328] text-white text-[12px] font-black shadow-lg flex items-center justify-center gap-2 border border-[#C8A762]/20"
            >
              <Check size={14} weight="bold" />
              <span>اعتماد الإجابات واستخلاص التقرير النهائي وخريطة الطريق</span>
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}
