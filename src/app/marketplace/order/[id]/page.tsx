"use client";

import { useState, useRef, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PaperPlaneRight, Paperclip, Microphone, CheckCircle,
  ShieldCheck, Money, FileText, Clock, Star, X,
  DownloadSimple, ArrowLeft, DotsThree, User, Robot,
  Scales, CalendarBlank, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  from: "client" | "provider" | "system";
  text: string;
  time: string;
  read?: boolean;
  attachment?: string;
}

const MOCK_ORDER = {
  id: "ORD-2025-041",
  title: "صياغة عقد شراكة تجارية مع شركة أجنبية",
  clientName: "عبدالله المنصور",
  providerName: "أ. سعد القحطاني",
  providerSpecialty: "عقود تجارية دولية",
  providerRating: 4.8,
  status: "in_progress" as const,
  budget: 3500,
  deadline: "٢٢ مارس ٢٠٢٥",
  createdAt: "١٥ مارس ٢٠٢٥",
  escrowStatus: "held" as const, // held / released
};

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: 1, from: "system", text: "✅ تم قبول العرض وإيداع المبلغ في حساب الضمان. يمكنكم الآن التواصل مباشرة.", time: "١٥ مارس، ١٤:٠٠" },
  { id: 2, from: "provider", text: "أهلاً أ. عبدالله، تسلّمت الطلب. هل يمكنك إرسال أي مسودة أو نقاط رئيسية تريد توظيفها في العقد؟", time: "١٥ مارس، ١٤:١٥", read: true },
  { id: 3, from: "client", text: "أهلاً أ. سعد. نعم سأرسل لك ملف Word فيه النقاط المتفق عليها مع الطرف الثاني.", time: "١٥ مارس، ١٤:٣٠" },
  { id: 4, from: "client", text: "نقاط العقد الرئيسية.docx", time: "١٥ مارس، ١٤:٣٥", attachment: "نقاط العقد الرئيسية.docx" },
  { id: 5, from: "provider", text: "ممتاز، تلقّيت الملف وسأبدأ العمل عليه اليوم. أتوقع إرسال المسودة الأولى خلال ٤٨ ساعة.", time: "١٥ مارس، ١٤:٤٠", read: true },
  { id: 6, from: "system", text: "📄 المرحلة الأولى: تحليل المتطلبات — اكتملت", time: "١٦ مارس، ٠٩:٠٠" },
  { id: 7, from: "provider", text: "أ. عبدالله، المسودة الأولى جاهزة. هل يمكنك مراجعتها وإبداء ملاحظاتك؟", time: "١٧ مارس، ١٠:٢٠", read: true },
];

const TIMELINE = [
  { label: "تقديم الطلب", done: true, date: "١٥ مارس" },
  { label: "قبول العرض والدفع", done: true, date: "١٥ مارس" },
  { label: "تحليل المتطلبات", done: true, date: "١٦ مارس" },
  { label: "المسودة الأولى", done: true, date: "١٧ مارس" },
  { label: "التعديلات النهائية", done: false, date: "قيد التنفيذ" },
  { label: "التسليم والاعتماد", done: false, date: "٢٢ مارس" },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OrderChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "timeline" | "files">("chat");
  const [showApproveModal, setShowApproveModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const order = MOCK_ORDER;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    if (!input.trim()) return;
    const msg: ChatMessage = {
      id: Date.now(), from: "client", text: input, time: "الآن", read: false,
    };
    setMessages(prev => [...prev, msg]);
    setInput("");

    // Simulate provider reply
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, from: "provider",
        text: "تسلّمت. سأرد عليك قريباً بعد المراجعة.",
        time: "الآن", read: false,
      }]);
    }, 1800);
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className={`flex flex-col h-[calc(100vh-4rem)] max-w-[1200px] mx-auto gap-4 ${isDark ? "text-zinc-200" : "text-zinc-800"}`} dir="rtl">

      {/* Order Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} p-4 flex items-center justify-between gap-3 shrink-0`}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/marketplace" className={`p-2 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100"}`}>
            <ArrowLeft size={16} className={isDark ? "text-zinc-400" : "text-slate-500"} />
          </Link>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-royal/20" : "bg-royal/10"}`}>
            <Scales size={18} weight="duotone" className="text-royal" />
          </div>
          <div className="min-w-0">
            <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{order.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border text-amber-500 bg-amber-500/10 border-amber-500/20`}>
                قيد التنفيذ
              </span>
              <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{order.id}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Escrow badge */}
          <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/8 text-[#C8A762]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            <Money size={12} /> {order.budget.toLocaleString("ar-SA")} ﷼ محجوز
          </div>
          <motion.button onClick={() => setShowApproveModal(true)}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-[12px] font-bold shadow-md shadow-emerald-500/20">
            <ShieldCheck size={14} weight="fill" /> اعتماد وإطلاق الضمان
          </motion.button>
        </div>
      </motion.div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">

        {/* Chat area */}
        <div className={`lg:col-span-2 ${card} flex flex-col min-h-0`}>
          {/* Tabs */}
          <div className={`p-3 border-b flex items-center gap-1 shrink-0 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            {([
              { id: "chat", label: "المحادثة" },
              { id: "timeline", label: "خطوات التنفيذ" },
              { id: "files", label: "الملفات" },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${activeTab === tab.id
                  ? isDark ? "bg-zinc-800 text-white" : "bg-white text-zinc-800 shadow-sm"
                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          {activeTab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.from === "client" ? "justify-start" : msg.from === "provider" ? "justify-end" : "justify-center"}`}>
                    {msg.from === "system" ? (
                      <div className={`text-center text-[11px] px-4 py-2 rounded-full border ${isDark ? "bg-white/[0.04] border-white/[0.08] text-zinc-500" : "bg-zinc-50 border-zinc-200 text-zinc-400"}`}>
                        {msg.text}
                      </div>
                    ) : (
                      <div className={`max-w-[75%] ${msg.from === "client" ? "items-start" : "items-end"} flex flex-col gap-1`}>
                        <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                          msg.from === "client"
                            ? isDark ? "bg-zinc-800 text-zinc-200 rounded-ss-none" : "bg-zinc-100 text-zinc-800 rounded-ss-none"
                            : "bg-royal text-white rounded-se-none"
                        }`}>
                          {msg.attachment ? (
                            <div className="flex items-center gap-2">
                              <FileText size={16} />
                              <span className="underline text-[12px]">{msg.attachment}</span>
                              <DownloadSimple size={14} />
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                        <span className={`text-[10px] px-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          {msg.from === "provider" ? <><span className="font-bold text-royal">أ. سعد</span> · </> : <><span className="font-bold">أنت</span> · </>}
                          {msg.time}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className={`p-3 border-t shrink-0 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.1] bg-zinc-800" : "border-zinc-200 bg-zinc-50"}`}>
                  <button className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                    <Paperclip size={16} />
                  </button>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendMessage()}
                    placeholder="اكتب رسالتك..."
                    className={`flex-1 bg-transparent outline-none text-[13px] ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
                  />
                  <button className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                    <Microphone size={16} />
                  </button>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="p-2 rounded-xl bg-royal text-white disabled:opacity-40 transition-opacity">
                    <PaperPlaneRight size={16} weight="fill" />
                  </motion.button>
                </div>
              </div>
            </>
          )}

          {/* Timeline */}
          {activeTab === "timeline" && (
            <div className="flex-1 p-5 overflow-y-auto">
              <p className={`text-[12px] font-bold mb-4 uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>خطوات التنفيذ</p>
              <div className="relative ps-6">
                <div className={`absolute start-[9px] top-2 bottom-2 w-0.5 ${isDark ? "bg-white/[0.08]" : "bg-slate-100"}`} />
                {TIMELINE.map((step, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className="relative mb-5 last:mb-0">
                    <div className={`absolute -start-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      step.done
                        ? "bg-emerald-500 border-emerald-500"
                        : isDark ? "bg-zinc-800 border-white/[0.15]" : "bg-white border-slate-300"
                    }`}>
                      {step.done && <CheckCircle size={10} weight="fill" className="text-white" />}
                    </div>
                    <p className={`text-[13px] font-bold ${step.done ? (isDark ? "text-zinc-200" : "text-slate-700") : (isDark ? "text-zinc-500" : "text-slate-400")}`}>
                      {step.label}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{step.date}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {activeTab === "files" && (
            <div className="flex-1 p-5 overflow-y-auto space-y-2">
              {["نقاط العقد الرئيسية.docx", "مسودة العقد v1.pdf"].map((f, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                  <FileText size={18} className="text-royal" weight="duotone" />
                  <span className={`text-[13px] font-medium flex-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{f}</span>
                  <button className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                    <DownloadSimple size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Order info */}
        <div className="space-y-3">
          {/* Provider card */}
          <div className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مقدم الخدمة</p>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/20" : "bg-royal/10"}`}>
                <User size={22} weight="duotone" className="text-royal" />
              </div>
              <div>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{order.providerName}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{order.providerSpecialty}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={11} weight="fill" className="text-[#C8A762]" />
                  <span className="text-[11px] font-bold text-[#C8A762]">{order.providerRating}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Financial summary */}
          <div className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حساب الضمان (Escrow)</p>
            <div className={`rounded-xl p-3 mb-3 ${isDark ? "bg-[#C8A762]/8 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-200/50"}`}>
              <p className={`text-[11px] mb-1 ${isDark ? "text-[#C8A762]/70" : "text-amber-600/70"}`}>محجوز بانتظار الاعتماد</p>
              <p className="text-xl font-bold font-mono text-[#C8A762]">{order.budget.toLocaleString("ar-SA")} ﷼</p>
            </div>
            <div className={`flex items-center gap-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <Clock size={12} /> يستحق التسليم: {order.deadline}
            </div>
          </div>

          {/* Approve CTA */}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setShowApproveModal(true)}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
            <ShieldCheck size={16} weight="fill" /> اعتمد الخدمة وأطلق الضمان
          </motion.button>
        </div>
      </div>

      {/* Approve Modal */}
      <AnimatePresence>
        {showApproveModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowApproveModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-md p-6 rounded-2xl ${isDark ? "bg-zinc-900 border border-white/[0.1]" : "bg-white border border-zinc-200 shadow-2xl"}`}>
              <div className="text-center mb-5">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={32} className="text-emerald-500" weight="fill" />
                </div>
                <h3 className={`text-lg font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>اعتماد الخدمة وإطلاق الضمان</h3>
                <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  بالاعتماد، سيُحوَّل مبلغ <strong className="text-emerald-500">{order.budget.toLocaleString("ar")} ﷼</strong> من حساب الضمان إلى {order.providerName}.
                </p>
              </div>
              <div className={`flex items-start gap-2 p-3 rounded-xl mb-4 ${isDark ? "bg-amber-500/8 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                <Warning size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className={`text-[11px] ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
                  هذا الإجراء لا يمكن التراجع عنه. تأكد من رضاك الكامل عن الخدمة قبل الاعتماد.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowApproveModal(false)}
                  className={`flex-1 py-2.5 rounded-xl border text-[13px] font-medium transition-colors ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                  إلغاء
                </button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-[13px]">
                  ✅ اعتماد وإطلاق الضمان
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
