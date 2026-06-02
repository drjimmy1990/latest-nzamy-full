"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /** Called after successful save so parent can append to Kanban/list */
  onCaseAdded?: (newCase: { id: string; title: string; type: string; dept: string; urgency: string }) => void;
}

const CASE_TYPES = [
  "مراجعة عقد مورد (تجاري)",
  "صياغة خطاب إنذار (عمالي)",
  "شكوى أو نزاع مستمر",
  "استشارة بخصوص الامتثال (PDPL)",
  "أخرى",
];

const DEPARTMENTS = [
  "المشتريات والعقود",
  "الموارد البشرية (HR)",
  "المالية",
  "الإدارة التنفيذية",
  "تقنية المعلومات",
];

type Urgency = "حرجة" | "عاجلة" | "طبيعية" | "";

export default function AddCaseModal({ onClose, isDark, onCaseAdded }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);

  // ── Controlled form state ──────────────────────────────────────────────────
  const [caseType, setCaseType] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [details, setDetails] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("");

  const canProceedStep1 = caseType !== "" && caseTitle.trim() !== "";
  const canFinish = urgency !== "";

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  const user = useUser();

  const handleSave = () => {
    const id = createWorkflowId("BIZ");
    // Persist to workflow store — survives refresh, visible to legal dept
    saveWorkflowRequest({
      id,
      type: "business_case",
      title: caseTitle,
      description: `${caseType}\n${details}`.trim(),
      requester: {
        name: user.name,
        role: user.userType,
        tier: user.tier,
        businessRole: user.businessRole,
      },
      receiver: "business_legal",
      status: "pending_assignment",
      payment: { amount: 0, status: "not_required" },
      sourcePath: "/dashboard/business",
      metadata: {
        caseType,
        department,
        urgency,
        fileCount: 0,
      },
      auditEvent: `تم تسجيل طلب ${urgency} من قِبل ${user.name}`,
    });
    // Also notify parent for immediate Kanban update
    onCaseAdded?.({ id, title: caseTitle, type: caseType, dept: department, urgency });
    setDone(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            تسجيل قضية / طلب قانوني جديد
          </h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم التوجيه بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              تم تسجيل الطلب وإرساله للقسم القانوني لاتخاذ اللازم.
            </p>
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition">
              العودة للوحة القيادة
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الطلب / القضية *</label>
                    <select className={inputCls} value={caseType} onChange={e => setCaseType(e.target.value)}>
                      <option value="" disabled>اختر التصنيف...</option>
                      {CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان مختصر للطلب *</label>
                    <input
                      type="text"
                      placeholder="مثال: عقد توريد معدات شركة الساطع"
                      className={inputCls}
                      value={caseTitle}
                      onChange={e => setCaseTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القسم الطالب</label>
                    <select className={inputCls} value={department} onChange={e => setDepartment(e.target.value)}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                    className="w-full rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    الخطوة التالية
                  </button>
                </motion.div>
              )}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تفاصيل إضافية للقسم القانوني</label>
                    <textarea
                      rows={3}
                      placeholder="اكتب ملاحظاتك للمستشار القانوني أو المحامي هنا..."
                      className={`${inputCls} resize-none`}
                      value={details}
                      onChange={e => setDetails(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["حرجة", "عاجلة", "طبيعية"] as const).map(u => (
                        <button
                          key={u}
                          onClick={() => setUrgency(u)}
                          className={`rounded-xl border py-2 text-[12px] font-bold transition-all ${
                            urgency === u
                              ? u === "حرجة"
                                ? "bg-red-500 border-red-500 text-white"
                                : u === "عاجلة"
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-blue-500 border-blue-500 text-white"
                              : isDark
                              ? "border-white/[0.08] bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button onClick={() => setStep(1)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition ${isDark ? "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      رجوع
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!canFinish}
                      className="flex-[2] rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] shadow-[0_4px_12px_rgba(11,61,46,0.3)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      حفظ واعتماد
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
