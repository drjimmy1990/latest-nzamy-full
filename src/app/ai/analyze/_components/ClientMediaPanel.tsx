"use client";

import { useState, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Note, Microphone, VideoCamera, Plus, X,
  CaretDown, SealWarning, BellSimple, Minus,
  Waveform, FilmSlate, ArrowRight,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type MediaType = "note" | "audio" | "video";
export type AiFlag   = "critical" | "notable" | "ignored";

export interface ClientMediaItem {
  id: string;
  type: MediaType;
  label: string;
  content?: string;   // text notes
  fileName?: string;  // audio / video
  fileSize?: string;
}

// Mock result data (same pattern as existing mock tabs)
export const CLIENT_MEDIA_FLAGS: {
  id: string; type: MediaType; label: string;
  quote: string; reason: string; flag: AiFlag;
}[] = [
  {
    id: "f1", type: "audio", label: "تسجيل اجتماع 15 مايو",
    quote: "أقررت بعدم استلام أي مبالغ تتعلق بهذه الصفقة حتى اللحظة",
    reason: "إقرار صريح يعكس مباشرةً ادعاء الخصم في المرفق الثاني — يجب الاستناد إليه في المذكرة",
    flag: "critical",
  },
  {
    id: "f2", type: "note", label: "ملاحظة الاجتماع الأول",
    quote: "ذكر وكيل الطرف الآخر أن موكله منفتح على التسوية الودية",
    reason: "قد يُشير إلى نية التسوية — مفيد لصياغة طلب الإيقاف المؤقت",
    flag: "notable",
  },
  {
    id: "f3", type: "video", label: "تسجيل مكالمة تمهيدية",
    quote: "حديث عام عن خلفية العلاقة بين الطرفين دون وقائع محددة",
    reason: "كلام تمهيدي بلا قيمة إثباتية — تجاهله الـ AI",
    flag: "ignored",
  },
];

// ─── Isolated: Waveform (perpetual — memoized to prevent re-renders) ──────────
const AudioWaveform = memo(function AudioWaveform({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {Array.from({ length: 10 }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-[3px] rounded-full ${isDark ? "bg-[#C8A762]/50" : "bg-[#C8A762]/70"}`}
          style={{ minHeight: 3 }}
          animate={{ scaleY: [0.3, 1, 0.5, 0.8, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
});

// ─── Spotlight border card (CSS-only hover effect) ────────────────────────────
function SpotlightCard({
  isDark, children, onRemove,
}: { isDark: boolean; children: React.ReactNode; onRemove: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className={`group relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200
        ${isDark
          ? "border-white/[0.07] bg-zinc-800/40 hover:border-[#C8A762]/30 hover:bg-zinc-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border-zinc-200/80 bg-white hover:border-[#C8A762]/40 hover:shadow-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
        }`}
    >
      {children}
      <button
        onClick={onRemove}
        className={`mr-auto flex-shrink-0 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity
          ${isDark ? "hover:bg-white/10 text-zinc-500 hover:text-zinc-300" : "hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"}`}
      >
        <X size={13} weight="bold" />
      </button>
    </motion.div>
  );
}

// ─── Main: ClientMediaPanel ───────────────────────────────────────────────────
interface Props {
  isDark: boolean;
  items: ClientMediaItem[];
  onAdd: (item: ClientMediaItem) => void;
  onRemove: (id: string) => void;
}

const TYPE_TABS: { id: MediaType; label: string; Icon: React.ElementType }[] = [
  { id: "note",  label: "ملاحظات", Icon: Note },
  { id: "audio", label: "صوتيات",  Icon: Microphone },
  { id: "video", label: "مرئيات",  Icon: VideoCamera },
];

export default function ClientMediaPanel({ isDark, items, onAdd, onRemove }: Props) {
  const [open, setOpen]           = useState(false);
  const [activeType, setActiveType] = useState<MediaType>("note");
  const [noteText, setNoteText]   = useState("");
  const [noteLabel, setNoteLabel] = useState("");
  const [dragging, setDragging]   = useState(false);
  const audioRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  function addNote() {
    if (!noteText.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      type: "note",
      label: noteLabel.trim() || `ملاحظة ${items.filter(i => i.type === "note").length + 1}`,
      content: noteText.trim(),
    });
    setNoteText("");
    setNoteLabel("");
  }

  function handleMediaFile(files: FileList | null, type: "audio" | "video") {
    if (!files?.length) return;
    const f = files[0];
    onAdd({
      id: crypto.randomUUID(),
      type,
      label: f.name.replace(/\.[^/.]+$/, ""),
      fileName: f.name,
      fileSize: (f.size / 1024 / 1024).toFixed(1) + " MB",
    });
  }

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const fadeUp  = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 26 } } };

  return (
    <div className={`rounded-2xl border transition-all duration-300
      ${isDark
        ? open ? "border-[#C8A762]/20 bg-zinc-900/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
               : "border-white/[0.06] bg-zinc-900/30"
        : open ? "border-[#C8A762]/25 bg-amber-50/40 shadow-sm"
               : "border-zinc-200/70 bg-white/60"
      }`}
    >
      {/* ── Toggle Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5"
      >
        <div className={`flex h-7 w-7 items-center justify-center rounded-xl transition-colors
          ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#C8A762]/15 text-amber-700"}`}>
          <Microphone size={15} weight="fill" />
        </div>
        <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
          مواد العميل المرجعية
        </span>
        {items.length > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black
            ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#C8A762]/20 text-amber-700"}`}>
            {items.length}
          </span>
        )}
        <span className={`mr-auto text-[11px] ${ts}`}>
          {open ? "ملاحظات · صوتيات · مرئيات" : "اختياري — يُحلَّل تلقائياً مع المرفقات"}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
          <CaretDown size={14} className={ts} weight="bold" />
        </motion.div>
      </button>

      {/* ── Expandable Body ── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="overflow-hidden"
          >
            <div className={`border-t px-5 pb-5 pt-4 space-y-4 ${isDark ? "border-white/[0.06]" : "border-zinc-200/60"}`}>

              {/* Type tabs */}
              <div className="flex gap-2">
                {TYPE_TABS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveType(id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all active:scale-[0.97]
                      ${activeType === id
                        ? isDark ? "bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/25"
                                 : "bg-[#C8A762]/20 text-amber-800 border border-[#C8A762]/30"
                        : isDark ? "text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-white/10"
                                 : "text-zinc-400 hover:text-zinc-700 border border-transparent hover:border-zinc-200"
                      }`}
                  >
                    <Icon size={14} weight={activeType === id ? "fill" : "regular"} />
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Note Input ── */}
              {activeType === "note" && (
                <motion.div
                  key="note"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="space-y-2"
                >
                  <input
                    value={noteLabel}
                    onChange={e => setNoteLabel(e.target.value)}
                    placeholder="وصف الملاحظة (اختياري) — مثال: ما قاله العميل في الاجتماع الأول"
                    className={`w-full rounded-xl border px-4 py-2.5 text-[12px] outline-none transition-all
                      focus:ring-2 focus:ring-[#C8A762]/20 focus:border-[#C8A762]/40
                      ${isDark ? "border-white/[0.08] bg-zinc-800/50 text-white placeholder:text-zinc-600"
                               : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`}
                  />
                  <div className="relative">
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      rows={3}
                      placeholder="اكتب ما قاله العميل أو ما لاحظته — الـ AI سيحدد ما له أهمية قانونية ويتجاهل الباقي..."
                      className={`w-full resize-none rounded-xl border px-4 py-3 text-[13px] leading-relaxed outline-none transition-all
                        focus:ring-2 focus:ring-[#C8A762]/20 focus:border-[#C8A762]/40
                        ${isDark ? "border-white/[0.08] bg-zinc-800/50 text-white placeholder:text-zinc-600"
                                 : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`}
                    />
                    <span className={`absolute bottom-2 left-3 text-[10px] font-mono ${ts}`}>
                      {noteText.length}
                    </span>
                  </div>
                  <button
                    onClick={addNote}
                    disabled={!noteText.trim()}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold transition-all active:scale-[0.97] disabled:opacity-40
                      ${isDark ? "bg-zinc-800 border border-white/[0.08] text-zinc-200 hover:border-[#C8A762]/30"
                               : "bg-white border border-zinc-200 text-zinc-700 hover:border-[#C8A762]/40"}`}
                  >
                    <Plus size={13} weight="bold" />
                    إضافة الملاحظة
                  </button>
                </motion.div>
              )}

              {/* ── Audio / Video Dropzone ── */}
              {(activeType === "audio" || activeType === "video") && (
                <motion.div
                  key={activeType}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                >
                  <input
                    ref={activeType === "audio" ? audioRef : videoRef}
                    type="file"
                    accept={activeType === "audio" ? ".mp3,.m4a,.wav,.ogg" : ".mp4,.mov,.webm"}
                    className="hidden"
                    onChange={e => handleMediaFile(e.target.files, activeType)}
                  />
                  <button
                    onClick={() => (activeType === "audio" ? audioRef : videoRef).current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); handleMediaFile(e.dataTransfer.files, activeType); }}
                    className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-8 transition-all active:scale-[0.99]
                      ${dragging
                        ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/5" : "border-amber-400 bg-amber-50"
                        : isDark ? "border-white/[0.08] hover:border-[#C8A762]/30 hover:bg-zinc-800/30"
                                 : "border-zinc-200 hover:border-[#C8A762]/30 hover:bg-amber-50/30"
                      }`}
                  >
                    {activeType === "audio"
                      ? <Microphone size={32} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                      : <FilmSlate  size={32} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                    }
                    <div className="text-center">
                      <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        {activeType === "audio" ? "ارفع تسجيلاً صوتياً" : "ارفع مقطعاً مرئياً"}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${ts}`}>
                        {activeType === "audio" ? "MP3 · M4A · WAV" : "MP4 · MOV · WEBM"}
                      </p>
                    </div>
                  </button>
                </motion.div>
              )}

              {/* ── Added items ── */}
              <AnimatePresence>
                {items.length > 0 && (
                  <motion.div
                    variants={stagger} initial="hidden" animate="show"
                    className="space-y-2 pt-1"
                  >
                    {items.map(item => (
                      <motion.div key={item.id} variants={fadeUp} layout>
                        <SpotlightCard isDark={isDark} onRemove={() => onRemove(item.id)}>
                          {item.type === "note"  && <Note        size={15} weight="duotone" className="text-[#C8A762] flex-shrink-0" />}
                          {item.type === "audio" && <AudioWaveform isDark={isDark} />}
                          {item.type === "video" && <VideoCamera  size={15} weight="duotone" className="text-[#C8A762] flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                              {item.label}
                            </p>
                            {item.fileSize && (
                              <p className={`text-[10px] font-mono ${ts}`}>{item.fileSize}</p>
                            )}
                            {item.content && (
                              <p className={`truncate text-[11px] mt-0.5 ${ts}`}>{item.content}</p>
                            )}
                          </div>
                        </SpotlightCard>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ClientMediaResultTab (used in result tabs) ───────────────────────────────
export function ClientMediaResultTab({ isDark }: { isDark: boolean }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  const visible = CLIENT_MEDIA_FLAGS.filter(f => !dismissed.includes(f.id));
  const critical = visible.filter(f => f.flag === "critical");
  const notable  = visible.filter(f => f.flag === "notable");
  const ignored  = visible.filter(f => f.flag === "ignored");

  if (CLIENT_MEDIA_FLAGS.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Microphone size={36} weight="duotone" className={ts} />
        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          لم تُضَف مواد عميل في هذه الجلسة
        </p>
        <p className={`text-[11px] ${ts}`}>أضف ملاحظات أو تسجيلات في قسم "مواد العميل" أعلاه</p>
      </div>
    );
  }

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const fadeUp  = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 26 } } };

  function FlagCard({ item }: { item: typeof CLIENT_MEDIA_FLAGS[0] }) {
    const isCritical = item.flag === "critical";
    const isIgnored  = item.flag === "ignored";
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className={`relative rounded-2xl border p-4 transition-all
          ${isCritical
            ? isDark ? "border-red-500/20 bg-red-500/[0.05] shadow-[inset_0_1px_0_rgba(239,68,68,0.08)]"
                     : "border-red-200/80 bg-red-50/60"
            : isIgnored
              ? isDark ? "border-white/[0.05] bg-zinc-900/30 opacity-60" : "border-zinc-200/50 bg-zinc-50/50 opacity-60"
              : isDark ? "border-amber-500/20 bg-amber-500/[0.05] shadow-[inset_0_1px_0_rgba(245,158,11,0.08)]"
                       : "border-amber-200/80 bg-amber-50/60"
          }`}
      >
        {/* Header */}
        <div className="flex items-start gap-2 mb-2">
          {isCritical && <SealWarning size={16} weight="fill" className="text-red-500 mt-0.5 flex-shrink-0" />}
          {item.flag === "notable" && <BellSimple size={16} weight="fill" className="text-amber-500 mt-0.5 flex-shrink-0" />}
          {isIgnored  && <Minus size={16} weight="bold" className="text-zinc-400 mt-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={`text-[12px] font-black ${
              isCritical ? isDark ? "text-red-400" : "text-red-700"
              : isIgnored ? ts
              : isDark ? "text-amber-400" : "text-amber-800"
            }`}>
              {isCritical ? "حرجة قانونياً" : isIgnored ? "تجاهلها الـ AI" : "قد تكون ذات صلة"}
            </p>
            <p className={`text-[11px] ${ts}`}>
              {item.type === "audio" ? "تسجيل صوتي" : item.type === "video" ? "مقطع مرئي" : "ملاحظة مكتوبة"}
              {" · "}{item.label}
            </p>
          </div>
          {!isIgnored && (
            <button
              onClick={() => setDismissed(p => [...p, item.id])}
              className={`rounded-lg p-1 transition-colors ${isDark ? "hover:bg-white/10 text-zinc-600 hover:text-zinc-400" : "hover:bg-zinc-100 text-zinc-400"}`}
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>
        {/* Quote */}
        <p className={`text-[12px] italic border-r-2 border-[#C8A762]/30 pr-3 my-2 leading-relaxed
          ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          &quot;{item.quote}&quot;
        </p>
        {/* Reason */}
        {!isIgnored && (
          <p className={`text-[11px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <span className={`font-bold ${isCritical ? isDark ? "text-red-400" : "text-red-600" : isDark ? "text-amber-400" : "text-amber-700"}`}>
              {isCritical ? "لماذا حرجة:" : "لماذا مفيدة:"}
            </span>{" "}
            {item.reason}
          </p>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      {/* Stats strip — asymmetric layout per DESIGN_VARIANCE 8 */}
      <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
        {[
          { label: "حرجة", val: critical.length, color: isDark ? "text-red-400" : "text-red-600" },
          { label: "قابلة للمتابعة", val: notable.length, color: isDark ? "text-amber-400" : "text-amber-700" },
          { label: "تجاهلها الـ AI", val: ignored.length, color: ts },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border px-3 py-2.5 text-center
            ${isDark ? "border-white/[0.06] bg-zinc-800/30" : "border-zinc-200/60 bg-white/60"}`}>
            <p className={`text-xl font-black font-mono ${s.color}`}>{s.val}</p>
            <p className={`text-[10px] font-bold mt-0.5 ${ts}`}>{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Critical items */}
      <AnimatePresence>
        {critical.map(item => <FlagCard key={item.id} item={item} />)}
      </AnimatePresence>

      {/* Notable items */}
      <AnimatePresence>
        {notable.map(item => <FlagCard key={item.id} item={item} />)}
      </AnimatePresence>

      {/* Ignored items — muted */}
      <AnimatePresence>
        {ignored.map(item => <FlagCard key={item.id} item={item} />)}
      </AnimatePresence>

      {visible.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`rounded-2xl border-2 border-dashed py-8 text-center ${isDark ? "border-white/[0.06]" : "border-zinc-200"}`}
        >
          <p className={`text-[12px] font-bold ${ts}`}>تم رفض جميع التنبيهات</p>
        </motion.div>
      )}
    </motion.div>
  );
}
