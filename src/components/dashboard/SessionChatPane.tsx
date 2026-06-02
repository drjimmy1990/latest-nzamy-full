"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  PaperPlaneTilt,
  Microphone,
  MicrophoneSlash,
  Paperclip,
  Robot,
  Clock,
  Phone,
  Video,
  FileText,
  CheckCircle,
  Download,
  X,
  SealCheck,
} from "@phosphor-icons/react";

type ConsultType = "in-person" | "video" | "ai";
type ConsultStatus = "upcoming" | "active" | "completed" | "cancelled";

interface Consultation {
  id: string;
  type: ConsultType;
  status: ConsultStatus;
  lawyerName: string;
  lawyerSpecialty: string;
  lawyerInitial: string;
  lawyerColor: string;
  topic: string;
  date: string;
  time: string;
  duration: string;
  price: number;
  rating?: number;
  hasPdf?: boolean;
  pdfName?: string;
  caseId?: string;
  notes?: string;
  questionText?: string;
}

interface Message {
  id: string;
  sender: "client" | "lawyer" | "ai";
  text: string;
  time: string;
  isVoice?: boolean;
  voiceDuration?: string;
  attachment?: { name: string; size: string };
  isRead?: boolean;
}

function VoiceBubble({ duration, isDark, isSelf }: { duration: string; isDark: boolean; isSelf: boolean }) {
  const [playing, setPlaying] = useState(false);
  const bars = [4, 8, 12, 6, 14, 10, 7, 13, 5, 9, 11, 8, 6, 12, 7];
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer min-w-[160px] ${
        isSelf
          ? "bg-[#0B3D2E] text-white"
          : isDark
          ? "bg-zinc-800 text-zinc-200"
          : "bg-zinc-100 text-zinc-800"
      }`}
      onClick={() => setPlaying(!playing)}
    >
      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          isSelf ? "bg-white/20" : "bg-[#0B3D2E]/10"
        }`}
      >
        <Microphone size={14} weight="fill" className={isSelf ? "text-white" : "text-[#0B3D2E]"} />
      </motion.div>
      <div className="flex items-end gap-[2px] h-6 flex-1">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            animate={
              playing
                ? {
                    scaleY: [1, h / 8, 1],
                    transition: { repeat: Infinity, duration: 0.6, delay: i * 0.04 },
                  }
                : { scaleY: 1 }
            }
            style={{ height: `${h}px` }}
            className={`w-[2px] rounded-full origin-bottom ${isSelf ? "bg-white/70" : "bg-[#0B3D2E]/50"}`}
          />
        ))}
      </div>
      <span
        className={`text-[11px] font-mono flex-shrink-0 ${
          isSelf ? "text-white/70" : isDark ? "text-zinc-500" : "text-zinc-400"
        }`}
      >
        {duration}
      </span>
    </div>
  );
}

function AttachmentBubble({
  file,
  isDark,
  isSelf,
}: {
  file: { name: string; size: string };
  isDark: boolean;
  isSelf: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
        isSelf
          ? "border-white/20 bg-[#0B3D2E]"
          : isDark
          ? "border-white/[0.06] bg-zinc-800"
          : "border-zinc-200 bg-zinc-50"
      }`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
          isSelf ? "bg-white/20" : "bg-[#0B3D2E]/10"
        }`}
      >
        <FileText size={16} weight="fill" className={isSelf ? "text-white" : "text-[#0B3D2E]"} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13px] font-semibold ${
            isSelf ? "text-white" : isDark ? "text-zinc-200" : "text-zinc-800"
          }`}
        >
          {file.name}
        </p>
        <p className={`text-[11px] ${isSelf ? "text-white/60" : isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {file.size}
        </p>
      </div>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`flex-shrink-0 ${
          isSelf ? "text-white/70 hover:text-white" : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
        }`}
      >
        <Download size={15} />
      </motion.button>
    </div>
  );
}

interface SessionChatPaneProps {
  consultation: Consultation;
  messages: Message[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isRecording: boolean;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  showAIPanel: boolean;
  setShowAIPanel: React.Dispatch<React.SetStateAction<boolean>>;
  sessionTimeLeft: string;
  isDark: boolean;
  sendMessage: () => void;
}

export default function SessionChatPane({
  consultation,
  messages,
  input,
  setInput,
  isRecording,
  setIsRecording,
  showAIPanel,
  setShowAIPanel,
  sessionTimeLeft,
  isDark,
  sendMessage,
}: SessionChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const panelBg = isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70";

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Messages area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => {
            const isSelf = msg.sender === "client";
            const isAI = msg.sender === "ai";

            if (isAI)
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex justify-center"
                >
                  <div
                    className={`flex items-start gap-2 rounded-2xl px-4 py-2.5 max-w-md text-center ${
                      isDark
                        ? "bg-[#0B3D2E]/20 border border-[#0B3D2E]/30"
                        : "bg-emerald-50 border border-emerald-200/60"
                    }`}
                  >
                    <Robot size={13} className="flex-shrink-0 mt-0.5 text-[#0B3D2E]" />
                    <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{msg.text}</p>
                  </div>
                </motion.div>
              );

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-end gap-2.5 ${isSelf ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar */}
                {!isSelf && (
                  <div
                    className={`h-7 w-7 flex-shrink-0 rounded-full ${consultation.lawyerColor} flex items-center justify-center shadow-sm`}
                  >
                    <span className="text-white text-[10px] font-bold">{consultation.lawyerInitial}</span>
                  </div>
                )}

                <div className={`max-w-[75%] space-y-1.5 ${isSelf ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Bubble */}
                  {msg.isVoice && msg.voiceDuration ? (
                    <VoiceBubble duration={msg.voiceDuration} isDark={isDark} isSelf={isSelf} />
                  ) : msg.attachment ? (
                    <AttachmentBubble file={msg.attachment} isDark={isDark} isSelf={isSelf} />
                  ) : (
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                        isSelf
                          ? "bg-[#0B3D2E] text-white rounded-tl-md"
                          : isDark
                          ? "bg-zinc-800 text-zinc-200 rounded-tr-md"
                          : "bg-white text-zinc-800 rounded-tr-md shadow-sm border border-zinc-100"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  {/* Time + read */}
                  <div className={`flex items-center gap-1 ${isSelf ? "flex-row-reverse" : ""}`}>
                    <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{msg.time}</span>
                    {isSelf && msg.isRead && <CheckCircle size={11} weight="fill" className="text-[#C8A762]" />}
                  </div>
                </div>
              </motion.div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        {consultation.status !== "completed" && consultation.status !== "cancelled" && (
          <div
            className={`flex-shrink-0 border-t px-4 py-3 ${
              isDark ? "border-white/[0.06] bg-zinc-950" : "border-zinc-200 bg-white"
            }`}
          >
            <div
              className={`flex items-end gap-2 rounded-2xl border px-3 py-2 transition-colors ${
                isDark
                  ? "border-white/[0.08] bg-zinc-800/60 focus-within:border-[#C8A762]/40"
                  : "border-zinc-200 bg-zinc-50 focus-within:border-[#0B3D2E]/40"
              }`}
            >
              {/* Attach */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => fileRef.current?.click()}
                className={`flex-shrink-0 p-1 ${
                  isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                <Paperclip size={18} />
              </motion.button>
              <input ref={fileRef} type="file" className="hidden" />

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="اكتب رسالتك..."
                rows={1}
                className={`flex-1 resize-none bg-transparent text-[14px] outline-none leading-relaxed placeholder:text-zinc-400 ${
                  isDark ? "text-zinc-100" : "text-zinc-800"
                }`}
                style={{ maxHeight: "120px" }}
              />

              {/* Voice */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsRecording(!isRecording)}
                className={`flex-shrink-0 p-1 transition-colors ${
                  isRecording ? "text-red-500" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {isRecording ? <MicrophoneSlash size={18} /> : <Microphone size={18} />}
              </motion.button>

              {/* Send */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={sendMessage}
                disabled={!input.trim()}
                className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[#0B3D2E] text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PaperPlaneTilt size={15} weight="fill" />
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* AI Assistant Panel */}
      <AnimatePresence>
        {showAIPanel && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`hidden lg:flex flex-shrink-0 flex-col overflow-hidden border-r ${panelBg}`}
          >
            <div
              className={`flex items-center justify-between px-4 py-3.5 border-b ${
                isDark ? "border-white/[0.06]" : "border-zinc-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <Robot size={16} weight="duotone" className="text-[#C8A762]" />
                <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  مساعد نظامي AI
                </span>
              </div>
              <button
                onClick={() => setShowAIPanel(false)}
                className={isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                اقتراحات ذكية
              </p>
              {[
                "ما هي حقوقي في نظام العمل والتعويض؟",
                "ما هي الإجراءات القانونية الودية للنزاع؟",
                "أريد مراجعة المهل النظامية لإنذار الطرف المخل.",
              ].map((q, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.02, x: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setInput(q)}
                  className={`w-full text-right text-[12px] rounded-xl px-3 py-2.5 leading-relaxed transition-colors ${
                    isDark ? "bg-zinc-800 hover:bg-zinc-700/80 text-zinc-300" : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700"
                  } border ${isDark ? "border-white/[0.06]" : "border-zinc-200"}`}
                >
                  {q}
                </motion.button>
              ))}

              <div
                className={`rounded-xl p-3 border ${
                  isDark ? "border-white/[0.06] bg-zinc-800/50" : "border-zinc-100 bg-zinc-50"
                }`}
              >
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
                    isDark ? "text-zinc-600" : "text-zinc-400"
                  }`}
                >
                  معلومات الجلسة
                </p>
                {[
                  { k: "رقم الجلسة", v: consultation.id },
                  { k: "النوع", v: consultation.lawyerSpecialty },
                  { k: "المدة", v: consultation.duration },
                  { k: "المبلغ", v: `${consultation.price} ر.س` },
                ].map(({ k, v }) => (
                  <div key={k} className="flex justify-between py-1">
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{k}</span>
                    <span className={`text-[11px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
