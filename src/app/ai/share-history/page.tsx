"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { 
  FolderOpen, Clock, CheckCircle, ChatCircleDots, 
  ArrowRight, ShieldCheck, UserCircle, CalendarBlank,
  PaperPlaneRight, X, Quotes, Prohibit
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";

type DocStatus = "pending" | "revisions" | "approved";

type SharedDoc = {
  id: string;
  title: string;
  clientName: string;
  date: string;
  status: DocStatus;
  passcode: string;
  notes?: string;
};

const MOCK_DOCS: SharedDoc[] = [
  {
    id: "doc_1",
    title: "عقد عمل محدد المدة (مهندس برمجيات)",
    clientName: "شركة التقنية المتقدمة",
    date: "اليوم، 10:30 صباحاً",
    status: "revisions",
    passcode: "839210",
    notes: "يرجى تعديل البند الخاص بالراتب الأساسي ليصبح 18,000 ريال بدلاً من 15,000 ريال، وإلغاء البند الخاص بعدم المنافسة نظراً لأنه غير مناسب في هذا العقد."
  },
  {
    id: "doc_2",
    title: "مذكرة دفاع (طعن أمام اللجنة الضريبية)",
    clientName: "مؤسسة الأفق التجارية",
    date: "أمس، 02:15 مساءً",
    status: "approved",
    passcode: "102938"
  },
  {
    id: "doc_3",
    title: "اتفاقية عدم إفشاء السرية (NDA)",
    clientName: "رائد الأعمال / محمد السالم",
    date: "أمس، 09:00 صباحاً",
    status: "pending",
    passcode: "558190"
  },
];

export default function ShareHistoryPage() {
  const { isDark } = useTheme();
  const [docs, setDocs] = useState(MOCK_DOCS);
  const [selectedDoc, setSelectedDoc] = useState<SharedDoc | null>(null);
  
  // I4: Resend with Summary state
  const [aiSummary, setAiSummary] = useState("");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const getStatusBadge = (status: DocStatus) => {
    switch (status) {
      case "pending":
        return <span className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-full ${isDark ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-amber-50 text-amber-600 border border-amber-200"}`}><Clock size={14} /> بانتظار العميل</span>;
      case "revisions":
        return <span className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-full ${isDark ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-blue-50 text-blue-600 border border-blue-200"}`}><ChatCircleDots size={14} weight="fill" /> العميل يطلب تعديلاً</span>;
      case "approved":
        return <span className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}><CheckCircle size={14} weight="fill" /> معتمد</span>;
    }
  };

  const handleHandleRevision = (action: "accept"|"reject"|"partial") => {
    if (action === "accept") setAiSummary("تم تعديل الراتب الأساسي ليكون 18,000 ريال، وتم إزالة بند عدم المنافسة بالكامل بناءً على طلبكم.");
    if (action === "reject") setAiSummary("مرحباً، تم دراسة الملاحظة، ولكن لا يمكن إزالة بند عدم المنافسة كونه متطلب أساسي في سياسة الشركاء، نأمل تفهمكم والاعتماد.");
    if (action === "partial") setAiSummary("تم تعديل الراتب الأساسي ليكون 18,000 ريال كما طلبتم. أما بخصوص إزالة بند عدم المنافسة، فقد تم تعديل المدة لتصبح 6 أشهر بدلاً من سنتين للوصول لحل وسط مقوبل.");
  };

  const handleSendUpdate = () => {
    if (!selectedDoc) return;
    setDocs(docs.map(d => d.id === selectedDoc.id ? { ...d, status: "pending" } : d));
    setSelectedDoc(null);
    setAiSummary("");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 flex items-center justify-center rounded-xl ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <FolderOpen size={24} className="text-[#C8A762]" weight="duotone" />
          </div>
          <div>
            <h1 className={`text-xl font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>سجل الأعمال والاعتمادات</h1>
            <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>تتبع حالة المستندات المرسلة للعملاء، راجع ملاحظاتهم، وأعد إرسال التحديثات.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* List of Docs (I5) */}
        <div className="md:col-span-2 space-y-3">
          {docs.map(doc => (
            <motion.button 
              key={doc.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setSelectedDoc(doc)}
              className={`w-full text-start p-4 ${doc.id === selectedDoc?.id ? (isDark ? "bg-zinc-800 border-white/[0.1] rounded-2xl border-2" : "bg-white border-[#C8A762]/40 border-2 rounded-2xl shadow-md") : card} transition-all`}
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{doc.title}</h3>
                {getStatusBadge(doc.status)}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <UserCircle size={15} className="text-[#C8A762]" />
                  <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{doc.clientName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarBlank size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                  <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{doc.date}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Lawyer Review Panel (I3 & I4) */}
        <div className="md:col-span-1">
          <AnimatePresence mode="popLayout">
            {selectedDoc ? (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`${card} overflow-hidden shadow-lg sticky top-6`}
              >
                <div className={`p-4 border-b ${isDark ? "border-white/[0.1] bg-zinc-800/50" : "border-zinc-200 bg-zinc-50"}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>العميل:</p>
                      <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{selectedDoc.clientName}</p>
                    </div>
                    <button onClick={() => setSelectedDoc(null)} className={`p-1.5 rounded-lg ${isDark ? "bg-zinc-800 text-zinc-400 hover:text-white" : "bg-zinc-200 text-zinc-600 hover:text-zinc-900"}`}>
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>باسكود: <strong className="tracking-widest font-mono text-[#C8A762] ml-1">{selectedDoc.passcode}</strong></span>
                  </div>
                </div>

                <div className="p-5">
                  {selectedDoc.status === "approved" && (
                    <div className="text-center py-6">
                      <CheckCircle size={48} weight="fill" className="text-emerald-500 mx-auto mb-3" />
                      <p className={`text-[14px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>اكتمل الاعتماد بنجاح</p>
                      <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>استعرض النسخة النهائية الموقعة من الأرشيف.</p>
                      <button className="mt-4 w-full py-2.5 rounded-xl border border-emerald-500/50 text-emerald-500 font-bold text-[12px] bg-emerald-500/10">
                        استعراض المستند النهائي
                      </button>
                    </div>
                  )}

                  {selectedDoc.status === "pending" && (
                    <div className="text-center py-6">
                      <Clock size={48} className="text-amber-500 mx-auto mb-3 opacity-50" />
                      <p className={`text-[14px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>في انتظار العميل</p>
                      <p className={`text-[12px] mb-4 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>العميل لم يقم بفتح الرابط أو اعتماد المستند حتى الآن.</p>
                      <button className={`w-full py-2.5 flex items-center justify-center gap-2 rounded-xl text-[12px] font-bold border ${isDark ? "border-white/[0.1] text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
                        <PaperPlaneRight size={14} /> تذكير العميل عبر واتساب
                      </button>
                    </div>
                  )}

                  {selectedDoc.status === "revisions" && (
                    <div className="space-y-4">
                      {/* Client Notes */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Quotes size={15} className="text-blue-500" weight="fill" />
                          <p className={`text-[12px] font-bold ${isDark ? "text-blue-400" : "text-blue-600"}`}>العميل يطلب التعديلات التالية:</p>
                        </div>
                        <div className={`p-4 rounded-xl text-[13px] leading-relaxed border ${isDark ? "bg-blue-500/5 border-blue-500/20 text-zinc-300" : "bg-blue-50 border-blue-200 text-zinc-700"}`}>
                          "{selectedDoc.notes}"
                        </div>
                      </div>

                      {/* Lawyer Actions */}
                      {!aiSummary && (
                        <div className="pt-2">
                          <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اتخاذ إجراء آلي عبر الذكاء الاصطناعي:</p>
                          <div className="grid grid-cols-1 gap-2">
                            <button onClick={() => handleHandleRevision("accept")} className={`py-2 px-3 text-[11px] font-bold rounded-lg border text-start ${isDark ? "border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400" : "border-emerald-200 hover:bg-emerald-50 text-emerald-700"}`}>
                              ✓ قبول كافة التعديلات (إعادة الصياغة تلقائياً)
                            </button>
                            <button onClick={() => handleHandleRevision("partial")} className={`py-2 px-3 text-[11px] font-bold rounded-lg border text-start ${isDark ? "border-amber-500/30 hover:bg-amber-500/10 text-amber-400" : "border-amber-200 hover:bg-amber-50 text-amber-700"}`}>
                              ~ قبول جزئي / حل وسط
                            </button>
                            <button onClick={() => handleHandleRevision("reject")} className={`py-2 px-3 text-[11px] font-bold rounded-lg border text-start flex items-center justify-between ${isDark ? "border-red-500/30 hover:bg-red-500/10 text-red-400" : "border-red-200 hover:bg-red-50 text-red-700"}`}>
                              رفض التعديلات مع التبرير <Prohibit size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Resend Summary (I4) */}
                      {aiSummary && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                          <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>ملخص الرد للعميل (قابل للتعديل):</p>
                          <textarea 
                            value={aiSummary} 
                            onChange={e => setAiSummary(e.target.value)}
                            rows={4}
                            className={`w-full rounded-xl border p-3 text-[12px] outline-none resize-none mb-3 ${isDark ? "bg-zinc-800/80 border-white/[0.1] text-zinc-200" : "bg-white border-zinc-300 text-zinc-800"}`}
                          />
                          <AiResultActions
                            text={[
                              `رد AI على تعديلات العميل — ${selectedDoc.title}`,
                              `العميل: ${selectedDoc.clientName}`,
                              ``,
                              aiSummary,
                            ].join("\n")}
                            filename={`share-revision-reply-${selectedDoc.id}`}
                            showVault
                            showHumanReview
                            className="justify-start mb-3"
                          />
                          <button onClick={handleSendUpdate} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C8A762] text-white text-[13px] font-bold shadow-lg shadow-[#C8A762]/20">
                            <PaperPlaneRight size={15} weight="fill" /> تصدير المستند وإرسال الرد
                          </button>
                          <button onClick={() => setAiSummary("")} className={`w-full mt-2 py-2 text-[11px] underline ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تراجع عن الإجراء</button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-2xl ${isDark ? "border-white/[0.05]" : "border-zinc-200"}`}
              >
                <FolderOpen size={48} className={`mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>اختر مسودة من القائمة</p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>لمراجعة ملاحظات العميل، أو متابعة الاعتماد</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
