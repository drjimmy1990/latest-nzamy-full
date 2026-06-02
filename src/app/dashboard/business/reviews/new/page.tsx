"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileArrowUp, Buildings, ShieldCheck, Eye, Lock,
  CloudArrowUp, CheckCircle, Sparkle, ArrowLeft,
  X, Plus, FilePdf, FileDoc, ChatCircleDots,
  Clock, Warning, Scales, Users,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";

// ── Types ───────────────────────────────────────────────────────────
type VisibilityMode = "none" | "department";

const GOVERNANCE_RULES = [
  { id: "r1", type: "عقد تجاري", minValue: "٥٠٠,٠٠٠", maxValue: "٢,٠٠٠,٠٠٠", depts: ["القانونية", "المالية", "التشغيل"], reviewDays: 5 },
  { id: "r2", type: "عقد عمالي", minValue: "أي قيمة", maxValue: "—", depts: ["الموارد البشرية", "القانونية"], reviewDays: 3 },
  { id: "r3", type: "عقد إيجار", minValue: "أي قيمة", maxValue: "—", depts: ["المالية", "التشغيل"], reviewDays: 3 },
  { id: "r4", type: "قرار إداري", minValue: "—", maxValue: "—", depts: ["CEO", "القانونية"], reviewDays: 2 },
];

const DEPARTMENTS = [
  { id: "legal", name: "القانونية", contact: "+966 5xx xxx 001" },
  { id: "finance", name: "المالية", contact: "+966 5xx xxx 002" },
  { id: "operations", name: "التشغيل", contact: "+966 5xx xxx 003" },
  { id: "hr", name: "الموارد البشرية", contact: "+966 5xx xxx 004" },
  { id: "marketing", name: "التسويق", contact: "+966 5xx xxx 005" },
  { id: "ceo", name: "CEO", contact: "+966 5xx xxx 006" },
];

export default function NewReviewPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [docType, setDocType] = useState("");
  const [docValue, setDocValue] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [fileUploaded, setFileUploaded] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityMode>("department");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["legal", "finance"]);
  const [reviewDays, setReviewDays] = useState("5");
  const [sent, setSent] = useState(false);
  const [savedReviewId, setSavedReviewId] = useState<string | null>(null);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const inputCls = `w-full rounded-xl border p-3 text-[13px] outline-none transition-colors ${
    isDark ? "border-white/[0.08] bg-zinc-800/50 text-white placeholder:text-zinc-600 focus:border-royal/50"
           : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/50"
  }`;

  const toggleDept = (id: string) => {
    setSelectedDepts(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  // Auto-detect rule
  const matchedRule = GOVERNANCE_RULES.find(r => r.type === docType);

  const handleSendReview = () => {
    const departments = selectedDepts
      .map(id => DEPARTMENTS.find(d => d.id === id)?.name)
      .filter(Boolean)
      .join("، ");
    const request = saveWorkflowRequest({
      id: createWorkflowId("BIZ-REV"),
      type: "business_case",
      title: docTitle || "مستند للمراجعة",
      description: `مراجعة ${docType || "مستند"} للإدارات: ${departments}`,
      requester: {
        name: user.name,
        role: user.userType,
        tier: user.tier,
        businessRole: user.businessRole,
      },
      receiver: "business_legal",
      status: "in_review",
      payment: {
        amount: 0,
        status: "not_required",
      },
      sourcePath: "/dashboard/business/reviews/new",
      metadata: {
        docType,
        docValue,
        departments,
        reviewDays,
        visibility,
        fileUploaded,
      },
      auditEvent: "business_review_sent",
    });
    setSavedReviewId(request.id);
    setSent(true);
  };

  return (
    <SubscriptionGuard featureKey="dept-reviews">
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${tp}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${tp}`}>إرسال مستند للمراجعة</h1>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${ts}`}>ارفع المستند — حدد الإدارات — ونظامي يتكفل بالباقي (رابط + تنبيهات + تصعيد تلقائي)</p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-blue-900/20" : "bg-blue-50"}`}>
          <FileArrowUp size={22} weight="duotone" className="text-blue-500" />
        </div>
      </div>

      {/* Steps indicator */}
      <div className={`${card} p-3 shadow-sm`}>
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: "المستند" },
            { n: 2, label: "الإدارات" },
            { n: 3, label: "الإعدادات" },
            { n: 4, label: "الإرسال" },
          ].map((s, i, arr) => (
            <div key={s.n} className="flex-1 flex items-center gap-1">
              <div className={`flex items-center justify-center rounded-lg px-3 py-2 text-[11px] font-bold w-full transition-all ${
                step === s.n ? "bg-royal/10 text-royal dark:bg-royal/20 dark:text-[#C8A762]"
                : step > s.n ? "text-emerald-500" : `${ts} opacity-50`
              }`}>
                {step > s.n ? <CheckCircle size={14} weight="fill" className="me-1" /> : null}
                {s.label}
              </div>
              {i < arr.length - 1 && <div className={`w-4 h-px ${step > s.n ? "bg-emerald-500" : isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Step 1: Document ─── */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div className={`${card} p-5 shadow-sm space-y-4`}>
              <div>
                <label className={`text-[12px] font-semibold mb-1.5 block ${tp}`}>عنوان المستند</label>
                <input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="مثال: عقد توريد مع شركة الأفق" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`text-[12px] font-semibold mb-1.5 block ${tp}`}>نوع المستند</label>
                  <select value={docType} onChange={e => setDocType(e.target.value)} className={inputCls}>
                    <option value="">اختر النوع</option>
                    <option value="عقد تجاري">عقد تجاري</option>
                    <option value="عقد عمالي">عقد عمالي</option>
                    <option value="عقد إيجار">عقد إيجار</option>
                    <option value="قرار إداري">قرار إداري</option>
                    <option value="سياسة داخلية">سياسة داخلية</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className={`text-[12px] font-semibold mb-1.5 block ${tp}`}>القيمة المالية (ريال)</label>
                  <input value={docValue} onChange={e => setDocValue(e.target.value)} placeholder="مثال: 1,500,000" className={inputCls} />
                </div>
              </div>

              {/* Governance auto-match */}
              {matchedRule && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl p-3 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-[#C8A762]/5"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={14} weight="duotone" className="text-[#C8A762]" />
                    <span className="text-[11px] font-bold text-[#C8A762]">قاعدة حوكمة مُنطبقة تلقائياً</span>
                  </div>
                  <p className={`text-[11px] ${ts}`}>الإدارات المطلوبة: {matchedRule.depts.join("، ")} — مدة المراجعة: {matchedRule.reviewDays} أيام</p>
                </motion.div>
              )}

              {/* Upload */}
              <div>
                <label className={`text-[12px] font-semibold mb-1.5 block ${tp}`}>الملف</label>
                <div onClick={() => setFileUploaded(true)}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    fileUploaded
                      ? isDark ? "border-emerald-700/30 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50"
                      : isDark ? "border-white/[0.08] hover:border-royal/30" : "border-zinc-200 hover:border-royal/40"
                  }`}>
                  {fileUploaded ? (
                    <div className="flex items-center justify-center gap-2">
                      <FilePdf size={20} className="text-red-500" />
                      <span className={`text-[13px] font-medium ${tp}`}>{docTitle || "عقد_توريد_شركة_الأفق"}.pdf</span>
                      <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                    </div>
                  ) : (
                    <>
                      <CloudArrowUp size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-600" : "text-zinc-300"}`} />
                      <p className={`text-[12px] ${ts}`}>اسحب الملف هنا أو اضغط للاختيار (PDF, DOCX)</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button onClick={() => setStep(2)} disabled={!docTitle || !docType || !fileUploaded}
              className="w-full py-3 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold disabled:opacity-30 flex items-center justify-center gap-2">
              التالي: اختيار الإدارات <ArrowLeft size={14} />
            </button>
          </motion.div>
        )}

        {/* ── Step 2: Departments ─── */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div className={`${card} p-5 shadow-sm`}>
              <p className={`text-[12px] font-semibold mb-3 ${tp}`}>اختر الإدارات المطلوب منها المراجعة والاعتماد</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {DEPARTMENTS.map(dept => {
                  const isSelected = selectedDepts.includes(dept.id);
                  return (
                    <button key={dept.id} onClick={() => toggleDept(dept.id)}
                      className={`rounded-xl border p-3.5 text-start transition-all ${
                        isSelected
                          ? isDark ? "border-royal/50 bg-royal/10" : "border-royal/40 bg-royal/5"
                          : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-zinc-200 hover:border-zinc-300"
                      }`}>
                      <div className="flex items-center justify-between mb-1">
                        <Buildings size={16} className={isSelected ? "text-royal" : ts} weight="duotone" />
                        {isSelected && <CheckCircle size={14} weight="fill" className="text-royal" />}
                      </div>
                      <p className={`text-[12px] font-semibold ${tp}`}>{dept.name}</p>
                      <p className={`text-[10px] ${ts}`}>{dept.contact}</p>
                    </button>
                  );
                })}
              </div>
              {selectedDepts.length > 0 && (
                <p className={`text-[11px] mt-3 ${ts}`}>تم اختيار {selectedDepts.length} إدارة — سيتم إرسال رابط واتساب لكل منها</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className={`flex-1 py-3 rounded-2xl border text-[13px] font-bold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>رجوع</button>
              <button onClick={() => setStep(3)} disabled={selectedDepts.length === 0}
                className="flex-1 py-3 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold disabled:opacity-30 flex items-center justify-center gap-2">
                التالي: الإعدادات <ArrowLeft size={14} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Settings ─── */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div className={`${card} p-5 shadow-sm space-y-5`}>
              {/* Visibility */}
              <div>
                <label className={`text-[12px] font-semibold mb-2 block ${tp}`}>
                  <Eye size={14} className="inline me-1" /> خصوصية الملاحظات
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: "none" as VisibilityMode, label: "خاصة تماماً", desc: "كل إدارة ترى ملاحظاتها فقط", icon: Lock },
                    { val: "department" as VisibilityMode, label: "مرئية للجميع", desc: "كل الإدارات ترى ملاحظات بعضها", icon: Users },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setVisibility(opt.val)}
                      className={`rounded-xl border p-4 text-start transition-all ${
                        visibility === opt.val
                          ? isDark ? "border-royal/50 bg-royal/10" : "border-royal/40 bg-royal/5"
                          : isDark ? "border-white/[0.06]" : "border-zinc-200"
                      }`}>
                      <opt.icon size={18} className={visibility === opt.val ? "text-royal mb-2" : `${ts} mb-2`} weight="duotone" />
                      <p className={`text-[12px] font-semibold ${tp}`}>{opt.label}</p>
                      <p className={`text-[10px] ${ts}`}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Review period */}
              <div>
                <label className={`text-[12px] font-semibold mb-1.5 block ${tp}`}>
                  <Clock size={14} className="inline me-1" /> مدة المراجعة
                </label>
                <div className="flex gap-2">
                  {["3", "5", "7", "14"].map(d => (
                    <button key={d} onClick={() => setReviewDays(d)}
                      className={`flex-1 py-2.5 rounded-xl text-[12px] font-semibold border transition-all ${
                        reviewDays === d
                          ? "bg-royal text-white border-royal"
                          : isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"
                      }`}>
                      {d} أيام
                    </button>
                  ))}
                </div>
              </div>

              {/* Escalation */}
              <div className={`rounded-xl p-3 border ${isDark ? "border-amber-700/20 bg-amber-900/5" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Warning size={14} className="text-amber-500" />
                  <span className="text-[11px] font-bold text-amber-500">التصعيد التلقائي</span>
                </div>
                <p className={`text-[11px] ${ts}`}>إذا لم تستجب إدارة خلال المدة المحددة — يُصعّد تلقائياً للـ CEO مع إشعار واتساب عاجل</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className={`flex-1 py-3 rounded-2xl border text-[13px] font-bold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>رجوع</button>
              <button onClick={() => setStep(4)}
                className="flex-1 py-3 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold flex items-center justify-center gap-2">
                التالي: المراجعة والإرسال <ArrowLeft size={14} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 4: Confirm & Send ─── */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            {!sent ? (
              <>
                <div className={`${card} p-5 shadow-sm space-y-4`}>
                  <p className={`text-[14px] font-bold ${tp}`}>ملخص المراجعة</p>
                  <div className="space-y-3">
                    {[
                      { label: "المستند", value: docTitle || "عقد توريد شركة الأفق" },
                      { label: "النوع", value: docType },
                      { label: "القيمة", value: docValue ? `${docValue} ﷼` : "—" },
                      { label: "الإدارات", value: selectedDepts.map(id => DEPARTMENTS.find(d => d.id === id)?.name).join("، ") },
                      { label: "الخصوصية", value: visibility === "none" ? "خاصة تماماً" : "مرئية للجميع" },
                      { label: "مدة المراجعة", value: `${reviewDays} أيام` },
                      { label: "التصعيد", value: "تلقائي — CEO" },
                    ].map((row, i) => (
                      <div key={i} className="flex items-start justify-between">
                        <span className={`text-[12px] ${ts}`}>{row.label}</span>
                        <span className={`text-[12px] font-semibold text-end max-w-[60%] ${tp}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`rounded-xl p-3 border ${isDark ? "border-emerald-700/20 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50"}`}>
                  <p className={`text-[11px] ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                    <CheckCircle size={12} weight="fill" className="inline me-1" />
                    عند الإرسال: يتم توليد رابط فريد + رمز دخول ٦ أرقام → يُرسل لكل إدارة عبر واتساب تلقائياً
                  </p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(3)} className={`flex-1 py-3 rounded-2xl border text-[13px] font-bold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>رجوع</button>
                  <motion.button onClick={handleSendReview}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex-1 py-3 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)]">
                    <Sparkle size={14} weight="fill" /> إرسال للمراجعة
                  </motion.button>
                </div>
              </>
            ) : (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`${card} p-10 text-center shadow-sm`}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}>
                  <CheckCircle size={48} weight="fill" className="text-emerald-500 mx-auto mb-4" />
                </motion.div>
                <h3 className={`text-[18px] font-bold mb-2 ${tp}`}>تم إرسال المستند بنجاح</h3>
                <p className={`text-[13px] mb-4 ${ts}`}>تم توليد رابط المراجعة وإرسال رسائل واتساب لجميع الإدارات المحددة</p>
                {savedReviewId && (
                  <p className="mb-4 text-[12px] font-bold text-emerald-500">رقم المراجعة: {savedReviewId}</p>
                )}
                <div className={`rounded-xl p-4 mx-auto max-w-sm ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-zinc-50 border border-zinc-200"}`}>
                  <p className={`text-[10px] mb-1 ${ts}`}>رابط المراجعة</p>
                  <p className="text-[12px] font-mono text-royal font-bold truncate">https://nezamy.online/review/a7b3c9d1</p>
                  <p className={`text-[10px] mt-2 ${ts}`}>رمز الدخول</p>
                  <p className="text-[18px] font-mono font-bold tracking-[0.3em] text-[#C8A762]">٧٢٤٩١٣</p>
                </div>
                <button onClick={() => { setStep(1); setSent(false); setSavedReviewId(null); setFileUploaded(false); setDocTitle(""); setDocType(""); setDocValue(""); }}
                  className={`mt-6 px-6 py-2.5 rounded-xl text-[12px] font-semibold border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
                  إرسال مستند آخر
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </SubscriptionGuard>
  );
}
