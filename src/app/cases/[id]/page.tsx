"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  ChatCircle,
  DownloadSimple,
  Star,
  Lock,
  CheckCircle,
  Clock,
  Hourglass,
  FilePlus,
  ArrowClockwise,
  Warning,
  UserCircle,
  Gavel,
  CalendarCheck,
  PaperPlaneRight,
  MapPin,
  Door,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

const MOCK_CASE = {
  id: "NZ-2026-47821",
  type: "عمالية",
  typeEn: "Labor",
  status: "جارية",
  statusEn: "Active",
  filed: "١٢ مارس ٢٠٢٦",
  court: "المحكمة العمالية بالرياض",
  room: "قاعة ١٤",
  nextHearing: "٢٢ أبريل ٢٠٢٦",
  lawyer: {
    name: "أحمد الغامدي",
    specialty: "قانون عمالي وتجاري",
    rating: 4.8,
    reviews: 127,
    initials: "أغ",
  },
  escrow: { reserved: 4500, completed: 1200, remaining: 3300 },
};

const TIMELINE = [
  {
    id: 1,
    title: "تقديم القضية",
    titleEn: "Case Filed",
    date: "١٢ مارس ٢٠٢٦",
    status: "done",
    icon: FileText,
    color: "#0B3D2E",
  },
  {
    id: 2,
    title: "تعيين المحامي",
    titleEn: "Lawyer Assigned",
    date: "١٣ مارس ٢٠٢٦",
    status: "done",
    icon: UserCircle,
    color: "#0B3D2E",
  },
  {
    id: 3,
    title: "الجلسة الأولى",
    titleEn: "First Hearing",
    date: "٢٨ مارس ٢٠٢٦",
    status: "done",
    icon: Gavel,
    color: "#C8A762",
  },
  {
    id: 4,
    title: "الجلسة الثانية",
    titleEn: "Second Hearing",
    date: "١٥ أبريل ٢٠٢٦",
    status: "current",
    icon: CalendarCheck,
    color: "#e8a528",
  },
  {
    id: 5,
    title: "الجلسة القادمة",
    titleEn: "Next Hearing",
    date: "٢٢ أبريل ٢٠٢٦",
    status: "pending",
    icon: Hourglass,
    color: "#6b7280",
  },
];

const MESSAGES = [
  {
    id: 1,
    sender: "lawyer",
    name: "أحمد الغامدي",
    text: "مرحباً، استلمت ملف القضية بالكامل وقمت بمراجعته. سأتواصل مع المحكمة لتحديد موعد الجلسة الأولى.",
    time: "١٢ مارس، ١٠:٣٠ ص",
  },
  {
    id: 2,
    sender: "client",
    name: "أنت",
    text: "شكراً جزيلاً. هل تحتاج إلى أي مستندات إضافية؟",
    time: "١٢ مارس، ١١:٠٠ ص",
  },
  {
    id: 3,
    sender: "lawyer",
    name: "أحمد الغامدي",
    text: "نعم، أحتاج إلى كشف حساب الراتب للأشهر الثلاثة الأخيرة وصورة من عقد العمل الأصلي.",
    time: "١٢ مارس، ١١:٤٥ ص",
  },
  {
    id: 4,
    sender: "client",
    name: "أنت",
    text: "تم رفع المستندات المطلوبة.",
    time: "١٣ مارس، ٩:٠٠ ص",
  },
];

const DOCUMENTS = [
  { name: "عقد العمل الأصلي.pdf", type: "PDF", size: "٢.٣ MB", date: "١٢ مارس" },
  { name: "كشف الراتب.pdf", type: "PDF", size: "٨٤٤ KB", date: "١٣ مارس" },
  { name: "شهادة الخدمة.docx", type: "DOCX", size: "١٢٠ KB", date: "١٣ مارس" },
  { name: "قرار الفصل.pdf", type: "PDF", size: "١.١ MB", date: "١٣ مارس" },
];

export default function CaseDetailPage() {
  const { isRTL, isDark } = useTheme();
  const [msgInput, setMsgInput] = useState("");

  const cardClass = `rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const headingClass = `font-bold text-base mb-4 ${isDark ? "text-white" : "text-gray-800"}`;

  const escrowTotal =
    MOCK_CASE.escrow.reserved +
    MOCK_CASE.escrow.completed +
    MOCK_CASE.escrow.remaining;
  const completedPct = Math.round(
    (MOCK_CASE.escrow.completed / escrowTotal) * 100
  );

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-6 mb-8 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}
        >
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-[#0B3D2E] text-white text-xs font-bold px-3 py-1.5 rounded-full">
                {MOCK_CASE.id}
              </span>
              <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                {isRTL ? MOCK_CASE.type : MOCK_CASE.typeEn}
              </span>
              <span className="flex items-center gap-1.5 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {isRTL ? MOCK_CASE.status : MOCK_CASE.statusEn}
              </span>
            </div>
            <div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              <Clock size={14} className="inline ml-1" />
              {isRTL ? `تاريخ التقديم: ${MOCK_CASE.filed}` : `Filed: ${MOCK_CASE.filed}`}
            </div>
          </div>
        </motion.div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Timeline */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className={cardClass}
            >
              <h2 className={headingClass}>
                {isRTL ? "مسار القضية" : "Case Timeline"}
              </h2>
              <div className="relative">
                {TIMELINE.map((item, idx) => {
                  const Icon = item.icon;
                  const isDone = item.status === "done";
                  const isCurrent = item.status === "current";
                  return (
                    <div key={item.id} className="flex gap-4 relative">
                      {/* Line */}
                      {idx < TIMELINE.length - 1 && (
                        <div
                          className={`absolute top-8 ${isRTL ? "right-4" : "left-4"} w-0.5 h-full -z-0`}
                          style={{
                            backgroundColor: isDone ? "#0B3D2E" : isDark ? "#2d3748" : "#e5e7eb",
                          }}
                        />
                      )}
                      {/* Icon */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 mt-0.5"
                        style={{ backgroundColor: `${item.color}20`, border: `2px solid ${item.color}` }}
                      >
                        <Icon size={14} color={item.color} weight="duotone" />
                      </div>
                      {/* Content */}
                      <div className={`pb-6 flex-1 ${idx === TIMELINE.length - 1 ? "pb-0" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>
                            {isRTL ? item.title : item.titleEn}
                          </p>
                          {isCurrent && (
                            <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                              {isRTL ? "جارية" : "In Progress"}
                            </span>
                          )}
                          {item.status === "pending" && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                              {isRTL ? "قادم" : "Upcoming"}
                            </span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>{item.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Messages */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className={cardClass}
            >
              <h2 className={headingClass}>
                <ChatCircle size={18} className="inline ml-2" weight="duotone" />
                {isRTL ? "المراسلات" : "Messages"}
              </h2>
              <div className="space-y-4 mb-4 max-h-72 overflow-y-auto pr-1">
                {MESSAGES.map((msg) => {
                  const isLawyer = msg.sender === "lawyer";
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${!isLawyer ? (isRTL ? "flex-row-reverse" : "flex-row-reverse") : ""}`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: isLawyer ? "#0B3D2E" : "#C8A762",
                          color: "#fff",
                        }}
                      >
                        {isLawyer ? "أغ" : "أ"}
                      </div>
                      <div className={`max-w-xs ${!isLawyer ? (isRTL ? "items-start" : "items-end") : ""}`}>
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isLawyer
                              ? isDark
                                ? "bg-[#0B3D2E]/30 text-gray-200"
                                : "bg-[#0B3D2E]/10 text-gray-800"
                              : "bg-[#C8A762] text-[#0B3D2E]"
                          }`}
                        >
                          {msg.text}
                        </div>
                        <p className={`text-xs mt-1 ${isDark ? "text-gray-600" : "text-gray-400"} ${!isLawyer ? "text-end" : ""}`}>
                          {msg.time}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Input */}
              <div className={`flex gap-2 border-t pt-4 ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <input
                  type="text"
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  placeholder={isRTL ? "اكتب رسالة..." : "Type a message..."}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm outline-none border transition-colors ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder-gray-600 focus:border-[#C8A762]" : "bg-gray-50 border-gray-200 text-gray-800 focus:border-[#0B3D2E]"}`}
                />
                <button className="w-10 h-10 rounded-xl bg-[#0B3D2E] flex items-center justify-center hover:bg-[#0a3328] transition-colors flex-shrink-0">
                  <PaperPlaneRight size={16} color="#C8A762" weight="duotone" />
                </button>
              </div>
            </motion.div>

            {/* Documents */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className={cardClass}
            >
              <h2 className={headingClass}>
                <FileText size={18} className="inline ml-2" weight="duotone" />
                {isRTL ? "المستندات" : "Documents"}
              </h2>
              <div className="space-y-3">
                {DOCUMENTS.map((doc, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 border ${isDark ? "border-[#2d3748] bg-[#0c0f12]" : "border-gray-100 bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`text-xs font-bold px-2 py-1 rounded-lg ${doc.type === "PDF" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"}`}>
                        {doc.type}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>{doc.name}</p>
                        <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{doc.size} — {doc.date}</p>
                      </div>
                    </div>
                    <button className={`p-2 rounded-lg hover:bg-[#0B3D2E]/10 transition-colors ${isDark ? "text-gray-400 hover:text-[#C8A762]" : "text-gray-400 hover:text-[#0B3D2E]"}`}>
                      <DownloadSimple size={18} weight="duotone" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Lawyer card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className={cardClass}
            >
              <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isRTL ? "المحامي المعين" : "Assigned Lawyer"}
              </h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {MOCK_CASE.lawyer.initials}
                </div>
                <div>
                  <p className={`font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                    {MOCK_CASE.lawyer.name}
                  </p>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {MOCK_CASE.lawyer.specialty}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={12}
                        weight={i < Math.floor(MOCK_CASE.lawyer.rating) ? "fill" : "regular"}
                        color="#C8A762"
                      />
                    ))}
                    <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      {MOCK_CASE.lawyer.rating} ({MOCK_CASE.lawyer.reviews})
                    </span>
                  </div>
                </div>
              </div>
              <button className="w-full py-2.5 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
                <ChatCircle size={16} weight="duotone" />
                {isRTL ? "تواصل مباشر" : "Direct Message"}
              </button>
            </motion.div>

            {/* Escrow */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className={cardClass}
            >
              <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                <Lock size={14} className="inline ml-1" />
                {isRTL ? "حالة الضمان" : "Escrow Status"}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className={isDark ? "text-gray-400" : "text-gray-500"}>{isRTL ? "محجوز" : "Reserved"}</span>
                  <span className="font-bold text-[#C8A762]">{MOCK_CASE.escrow.reserved.toLocaleString()} ر.س</span>
                </div>
                <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? "bg-[#2d3748]" : "bg-gray-200"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${completedPct}%` }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="h-full bg-[#0B3D2E] rounded-full"
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? `منجز ${completedPct}%` : `${completedPct}% completed`}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className={`rounded-lg p-2.5 text-center ${isDark ? "bg-[#0B3D2E]/20" : "bg-[#0B3D2E]/5"}`}>
                    <p className="text-xs text-[#0B3D2E] dark:text-[#C8A762] font-bold">{MOCK_CASE.escrow.completed.toLocaleString()} ر.س</p>
                    <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>{isRTL ? "منجز" : "Completed"}</p>
                  </div>
                  <div className={`rounded-lg p-2.5 text-center ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                    <p className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{MOCK_CASE.escrow.remaining.toLocaleString()} ر.س</p>
                    <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>{isRTL ? "متبقي" : "Remaining"}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Hearing info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className={cardClass}
            >
              <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isRTL ? "الجلسة القادمة" : "Next Hearing"}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarCheck size={18} color="#C8A762" weight="duotone" />
                  <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? "التاريخ" : "Date"}</p>
                    <p className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>{MOCK_CASE.nextHearing}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin size={18} color="#C8A762" weight="duotone" />
                  <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? "المحكمة" : "Court"}</p>
                    <p className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>{MOCK_CASE.court}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Door size={18} color="#C8A762" weight="duotone" />
                  <div>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{isRTL ? "رقم القاعة" : "Room"}</p>
                    <p className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>{MOCK_CASE.room}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Case actions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className={cardClass}
            >
              <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isRTL ? "إجراءات القضية" : "Case Actions"}
              </h3>
              <div className="space-y-2.5">
                <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#0B3D2E]/20 hover:border-[#0B3D2E]/50" : "border-gray-200 text-gray-700 hover:bg-[#0B3D2E]/5 hover:border-[#0B3D2E]/30"}`}>
                  <FilePlus size={18} color="#0B3D2E" weight="duotone" />
                  {isRTL ? "رفع مستند" : "Upload Document"}
                </button>
                <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#C8A762]/10 hover:border-[#C8A762]/40" : "border-gray-200 text-gray-700 hover:bg-[#C8A762]/10 hover:border-[#C8A762]/30"}`}>
                  <ArrowClockwise size={18} color="#C8A762" weight="duotone" />
                  {isRTL ? "طلب تحديث" : "Request Update"}
                </button>
                <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                  <Warning size={18} color="#ef4444" weight="duotone" />
                  {isRTL ? "إنهاء التوكيل" : "Terminate Authorization"}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
