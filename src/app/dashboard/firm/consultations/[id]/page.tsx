"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChatCircleText, Clock, VideoCamera, FileText,
  Paperclip, PaperPlaneRight, UserCircle, Checks,
  CheckCircle, Receipt, ArrowRight, CaretLeft
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CONSULT_DATA = {
  id: "C-9021",
  title: "استشارة بشأن الاندماج وحقوق الملكية الفكرية",
  clientName: "شركة الأفق الحديثة للتقنية",
  lawyerName: "سلمان العتيبي (شريك)",
  status: "مفتوحة",
  type: "استشارة مدفوعة",
  date: "٢٠٢٤/٠٥/١٥",
  time: "١٠:٣٠ صباحاً",
  price: 2500,
  paymentStatus: "مدفوعة",
  messages: [
    { id: 1, sender: "client", text: "السلام عليكم، نود الاستفسار عن نقل براءات الاختراع بعد دمج شركتنا مع شركة أخرى.", time: "١٠:٣٠ ص" },
    { id: 2, sender: "lawyer", text: "وعليكم السلام ورحمة الله. نقل براءات الاختراع يتطلب إجراءات لدى الهيئة السعودية للملكية الفكرية (SAIP). هل براءات الاختراع مسجلة حالياً باسم الشركة أم الأفراد؟", time: "١٠:٣٥ ص" },
    { id: 3, sender: "client", text: "مرفق شهادات التسجيل، هي مسجلة باسم الشركة المستهدفة بالاندماج.", time: "١٠:٤٠ ص", attachment: "SAIP_Certificates.pdf" },
    { id: 4, sender: "lawyer", text: "ممتاز، سأقوم بمراجعة المستندات وإعداد التقرير المبدئي بحلول يوم الخميس.", time: "١٠:٤٥ ص" },
  ]
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsultationDetailsPage() {
  const { isDark } = useTheme();
  const params = useParams(); // Using params.id in real app
  const [reply, setReply] = useState("");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]">
        <Link href="/dashboard/firm/consultations" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>الاستشارات</Link>
        <CaretLeft size={11} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>{CONSULT_DATA.id}</span>
      </div>

      {/* Header Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Details (2 cols) */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`lg:col-span-2 ${card} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{CONSULT_DATA.title}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}>{CONSULT_DATA.status}</span>
              </div>
              <p className={`text-[12px] flex items-center gap-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                <span className="font-mono">{CONSULT_DATA.id}</span>
                <span className="opacity-50">•</span>
                {CONSULT_DATA.type}
              </p>
            </div>
            <button className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "bg-zinc-800 border-white/[0.05] hover:bg-zinc-700" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}>
              إنهاء الاستشارة
            </button>
          </div>

          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isDark ? "bg-white/[0.02] border-white/[0.04]" : "bg-slate-50 border-slate-100"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.05]" : "bg-white"}`}>
                <UserCircle size={24} className="text-royal" weight="duotone" />
              </div>
              <div>
                <p className={`text-[11px] font-bold mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>العميل</p>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{CONSULT_DATA.clientName}</p>
              </div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-white/[0.06]" />
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.05]" : "bg-white"}`}>
                <UserCircle size={24} className="text-emerald-500" weight="duotone" />
              </div>
              <div>
                <p className={`text-[11px] font-bold mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المستشار</p>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{CONSULT_DATA.lawyerName}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Meeting & Payment (1 col) */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`lg:col-span-1 ${card} p-6 flex flex-col justify-between`}>
          <div>
            <p className={`text-[12px] font-bold mb-4 flex items-center gap-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
              <Clock size={16} className="text-amber-500" /> موعد الجلسة
            </p>
            <div className="flex justify-between items-center mb-4">
              <p className={`text-[14px] font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{CONSULT_DATA.date}</p>
              <p className={`text-[14px] font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{CONSULT_DATA.time}</p>
            </div>
            <button className="w-full py-2.5 rounded-xl bg-blue-500/10 text-blue-500 text-[12px] font-bold hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2 border border-blue-500/20 mb-6">
              <VideoCamera size={16} weight="fill" /> دخول الاجتماع المرئي (Zoom)
            </button>
          </div>

          <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.02] border-emerald-500/20" : "bg-emerald-50/50 border-emerald-200"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>حالة الدفع</p>
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                <CheckCircle size={14} weight="fill" /> مدفوعة
              </div>
            </div>
            <p className={`text-[20px] font-black font-mono mt-2 ${isDark ? "text-white" : "text-slate-800"}`}>{CONSULT_DATA.price} <span className="text-[12px] font-sans font-normal">ريال</span></p>
          </div>
        </motion.div>

      </div>

      {/* Chat Interface */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${card} flex flex-col h-[500px]`}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <h2 className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
            <ChatCircleText size={18} className="text-royal" weight="duotone" />
            المحادثة والمرفقات
          </h2>
        </div>

        <div className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col">
          {CONSULT_DATA.messages.map((msg) => {
            const isLawyer = msg.sender === "lawyer";
            return (
              <div key={msg.id} className={`flex items-start gap-3 max-w-[80%] ${isLawyer ? "self-end flex-row-reverse" : "self-start"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isLawyer ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-200"}`}>
                  <UserCircle size={20} className={isLawyer ? "text-[#C8A762]" : isDark ? "text-zinc-400" : "text-slate-500"} weight={isLawyer ? "fill" : "regular"} />
                </div>
                <div className={`flex flex-col gap-1 ${isLawyer ? "items-end" : "items-start"}`}>
                  <div className={`p-4 rounded-2xl ${
                    isLawyer 
                      ? "bg-[#0B3D2E] text-white rounded-tr-sm" 
                      : isDark ? "bg-zinc-800/80 text-zinc-200 rounded-tl-sm border border-white/[0.05]" : "bg-slate-100 text-slate-800 rounded-tl-sm"
                  }`}>
                    <p className="text-[13px] leading-relaxed">{msg.text}</p>
                    {msg.attachment && (
                      <div className={`mt-3 p-2.5 rounded-xl border flex items-center gap-3 ${isLawyer ? "bg-white/10 border-white/20" : isDark ? "bg-zinc-900 border-white/[0.1]" : "bg-white border-slate-200"}`}>
                        <FileText size={20} className={isLawyer ? "text-[#C8A762]" : "text-royal"} weight="duotone" />
                        <span className={`text-[11px] font-mono flex-1 ${isLawyer ? "text-white" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{msg.attachment}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{msg.time}</span>
                    {isLawyer && <Checks size={14} className="text-emerald-500" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`p-4 border-t ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-100 bg-white"}`}>
          <div className="flex items-end gap-2">
            <button className={`p-3 rounded-xl transition-colors ${isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700" : "bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200"}`}>
              <Paperclip size={20} />
            </button>
            <textarea 
              value={reply} onChange={e => setReply(e.target.value)}
              placeholder="اكتب ردك هنا..." rows={1}
              className={`flex-1 max-h-32 min-h-[44px] rounded-xl px-4 py-3 text-[13px] outline-none resize-none border transition-colors ${
                isDark ? "bg-zinc-800/50 border-white/[0.06] focus:border-royal/40 text-zinc-200" : "bg-slate-50 border-slate-200 focus:border-emerald-300 text-slate-800"
              }`}
            />
            <button disabled={!reply.trim()} className={`p-3 rounded-xl transition-all ${
              reply.trim() ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] cursor-pointer shadow-lg" : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}>
              <PaperPlaneRight size={20} weight={reply.trim() ? "fill" : "regular"} className={reply.trim() ? "" : "-translate-x-0.5"} />
            </button>
          </div>
        </div>
      </motion.div>

    </div>
  );
}
