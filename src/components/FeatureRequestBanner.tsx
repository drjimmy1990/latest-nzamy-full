"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb, X, PaperPlaneTilt, CheckCircle,
  ClockCounterClockwise, CaretDown,
  Star, CheckFat, Microphone, MicrophoneSlash, Stop,
} from "@phosphor-icons/react";

// ─── Voice hook (Web Speech API) ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recogRef = useRef<AnySpeechRecognition>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const recog = new SR();
    recog.lang           = "ar-SA";
    recog.continuous     = false;
    recog.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<SpeechRecognitionResult>)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(" ");
      onResult(transcript);
    };
    recog.onend  = () => setListening(false);
    recog.onerror = () => setListening(false);
    recogRef.current = recog;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    if (!recogRef.current) return;
    if (listening) {
      recogRef.current.stop();
      setListening(false);
    } else {
      recogRef.current.start();
      setListening(true);
    }
  }

  return { listening, supported, toggle };
}
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  submittedAt: string;
  status?: "pending" | "in_review" | "implemented"; // set by admin in future
  implementedNote?: string;
}

const CATEGORIES = ["تحسين أداة موجودة", "أداة جديدة", "تكامل خارجي", "تقرير أو تحليل", "أخرى"];
const PRIORITIES  = ["ضروري جداً", "مفيد", "لطيف أن يكون"];
const STORAGE_KEY = "nzamy_feature_requests";

// status config
const STATUS_CONFIG = {
  pending:     { label: "قيد المراجعة",   dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-400/10 border-amber-400/20" },
  in_review:   { label: "بالدراسة",        dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/20" },
  implemented: { label: "تم التطبيق! 🎉",  dot: "bg-emerald-500", text: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useFeatureRequests() {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRequests(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  function saveRequest(r: Omit<FeatureRequest, "id" | "submittedAt" | "status">) {
    const newReq: FeatureRequest = {
      ...r,
      id: Math.random().toString(36).slice(2),
      submittedAt: new Date().toISOString(),
      status: "pending",
    };
    setRequests(prev => {
      const updated = [newReq, ...prev];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }

  const implemented = requests.filter(r => r.status === "implemented");
  const pending      = requests.filter(r => r.status !== "implemented");

  return { requests, saveRequest, implemented, pending };
}

// ─── Compact form (inline in sidebar) ─────────────────────────────────────────
function InlineForm({
  isDark,
  onSubmit,
  onDone,
}: {
  isDark: boolean;
  onSubmit: (r: Omit<FeatureRequest, "id" | "submittedAt" | "status">) => void;
  onDone: () => void;
}) {
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState(CATEGORIES[0]);
  const [priority,    setPriority]    = useState(PRIORITIES[0]);
  const [submitted,   setSubmitted]   = useState(false);

  // Voice input — appends transcript to description
  const voice = useVoiceInput((text) => {
    setDescription(prev => (prev ? prev + " " + text : text));
  });

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), description: description.trim(), category, priority });
    setSubmitted(true);
    setTimeout(onDone, 2000);
  }

  const inputCls = `w-full px-2.5 py-2 rounded-lg border text-[11px] outline-none transition ${
    isDark
      ? "bg-zinc-800/80 border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:border-[#C8A762]/40"
      : "bg-white border-slate-200 text-zinc-800 placeholder-slate-400 focus:border-[#C8A762]/60"
  }`;
  const labelCls = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`;

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="py-4 flex flex-col items-center gap-2 text-center"
      >
        <CheckCircle size={28} weight="fill" className="text-emerald-500" />
        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
          تم الاستلام! 🎉
        </p>
        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          سنتواصل معك بأقرب فرصة
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-2.5 pt-1">
      {/* Title */}
      <div>
        <label className={labelCls}>عنوان الفكرة</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="مثال: تصدير Excel في التقارير"
          className={inputCls}
        />
      </div>

      {/* Reward callout */}
      <div className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${
        isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50/60"
      }`}>
        <span className="text-[14px] flex-shrink-0 mt-px">🎁</span>
        <div>
          <p className={`text-[10px] font-bold leading-tight ${
            isDark ? "text-amber-400" : "text-amber-700"
          }`}>إذا تم اعتماد فكرتك</p>
          <p className={`text-[9px] leading-relaxed mt-0.5 ${
            isDark ? "text-zinc-500" : "text-slate-500"
          }`}>
            تحصل على <span className={`font-bold ${ isDark ? "text-amber-400" : "text-amber-700"}`}>خصم 20% لمدة سنة</span> على اشتراكك، ويحق لك مشاركته مع ٥ أشخاص من اختيارك.
          </p>
        </div>
      </div>

      {/* Description + Voice */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls} style={{ marginBottom: 0 }}>الوصف والغرض</label>
          {/* Mic button */}
          {voice.supported ? (
            <motion.button
              type="button"
              title={voice.listening ? "إيقاف التسجيل" : "تحدث بدلاً من الكتابة 🎙️"}
              onClick={voice.toggle}
              whileTap={{ scale: 0.9 }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all border ${
                voice.listening
                  ? isDark
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : "border-red-300 bg-red-50 text-red-500"
                  : isDark
                    ? "border-white/[0.08] text-zinc-500 hover:text-[#C8A762] hover:border-[#C8A762]/30"
                    : "border-slate-200 text-slate-400 hover:text-[#C8A762] hover:border-[#C8A762]/40"
              }`}
            >
              {voice.listening ? (
                <>
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"
                  />
                  إيقاف
                </>
              ) : (
                <>
                  <Microphone size={10} weight="duotone" />
                  تحدث
                </>
              )}
            </motion.button>
          ) : (
            <span className={`text-[9px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
              الصوت غير مدعوم
            </span>
          )}
        </div>

        <div className="relative">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder={voice.listening ? "🎙️ جارٍ الاستماع..." : "اشرح الفكرة، ما المشكلة التي تحلها... (أو تحدث بالصوت)"}
            className={`${inputCls} resize-none leading-relaxed ${voice.listening ? isDark ? "border-red-500/30" : "border-red-300" : ""}`}
          />
          {/* Listening pulse overlay */}
          {voice.listening && (
            <motion.div
              className={`absolute inset-0 rounded-lg pointer-events-none ${isDark ? "border border-red-500/30" : "border border-red-300"}`}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>

        {/* Status hint */}
        {voice.listening && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[9px] text-red-400 mt-0.5 flex items-center gap-1"
          >
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-1 h-1 rounded-full bg-red-400 inline-block"
            />
            جارٍ التسجيل... تكلم الآن
          </motion.p>
        )}
      </div>

      {/* Category + Priority */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>التصنيف</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>الأهمية</label>
          <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Submit */}
      <motion.button
        whileHover={canSubmit ? { scale: 1.02 } : {}}
        whileTap={canSubmit ? { scale: 0.98 } : {}}
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-bold transition ${
          canSubmit
            ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90 shadow-sm"
            : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
        }`}
      >
        <PaperPlaneTilt size={13} />
        إرسال الفكرة
      </motion.button>
    </div>
  );
}


// ─── Previous requests list ────────────────────────────────────────────────────
function PreviousRequests({
  requests,
  isDark,
}: {
  requests: FeatureRequest[];
  isDark: boolean;
}) {
  if (!requests.length) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        <ClockCounterClockwise size={11} />
        مقترحاتك السابقة
      </p>
      {requests.slice(0, 5).map(req => {
        const st = STATUS_CONFIG[req.status ?? "pending"];
        return (
          <div
            key={req.id}
            className={`p-2.5 rounded-xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}
          >
            {/* Title row */}
            <div className="flex items-start justify-between gap-1.5">
              <p className={`text-[11px] font-semibold leading-snug flex-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                {req.title}
              </p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${st.bg} ${st.text}`}>
                {st.label}
              </span>
            </div>

            {/* Implemented note */}
            {req.status === "implemented" && req.implementedNote && (
              <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                <CheckFat size={10} weight="fill" />
                <span>{req.implementedNote}</span>
              </div>
            )}

            {/* Date */}
            <p className={`text-[9px] mt-1 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
              {new Date(req.submittedAt).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Implemented notification banner ──────────────────────────────────────────
function ImplementedBanner({
  count,
  isDark,
  onDismiss,
}: {
  count: number;
  isDark: boolean;
  onDismiss: () => void;
}) {
  if (!count) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={`mx-0 mb-2 rounded-xl border p-2.5 relative ${
        isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <button
        onClick={onDismiss}
        className={`absolute top-1.5 left-1.5 w-4 h-4 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 ${isDark ? "text-zinc-400" : "text-slate-500"}`}
      >
        <X size={9} />
      </button>
      <div className="flex items-center gap-1.5">
        <Star size={12} weight="fill" className="text-emerald-500 flex-shrink-0" />
        <p className={`text-[10px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
          تم تطبيق {count} من مقترحاتك! 🎉
        </p>
      </div>
      <p className={`text-[9px] mt-0.5 ${isDark ? "text-emerald-500/60" : "text-emerald-600/60"}`}>
        شكراً لمساهمتك في تطوير نظامي
      </p>
    </motion.div>
  );
}

// ─── Main Widget (for sidebar) ─────────────────────────────────────────────────
export function SidebarFeatureRequest({ compact = false }: { compact?: boolean }) {
  const { isDark } = useTheme();
  const { requests, saveRequest, implemented } = useFeatureRequests();
  const [open,        setOpen]        = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const hasImplemented = implemented.length > 0 && !bannerDismissed;
  const hasPrevious    = requests.length > 0;

  const border = isDark ? "border-white/[0.06]" : "border-slate-100";

  return (
    <div className={`mx-3 mb-2 rounded-2xl border ${border} overflow-hidden ${isDark ? "bg-white/[0.02]" : "bg-slate-50/80"}`}>

      {/* Implemented notifications */}
      <AnimatePresence>
        {hasImplemented && (
          <div className="px-2 pt-2">
            <ImplementedBanner
              count={implemented.length}
              isDark={isDark}
              onDismiss={() => setBannerDismissed(true)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Header trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors ${
          isDark ? "hover:bg-white/[0.03]" : "hover:bg-slate-100/60"
        }`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isDark ? "bg-[#C8A762]/10" : "bg-amber-50"
        }`}>
          <Lightbulb size={14} weight="duotone" className="text-[#C8A762]" />
        </div>

        <div className="flex-1 text-right min-w-0">
          <p className={`text-[11px] font-bold leading-tight ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            💡 عندك فكرة جديدة؟
          </p>
          {hasPrevious && !open && (
            <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {requests.length} مقترح مرسل
            </p>
          )}
        </div>

        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
        </motion.span>
      </button>

      {/* Expanded body */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={`px-3 pb-3 border-t ${border}`}>

              {/* Inline form */}
              <InlineForm
                isDark={isDark}
                onSubmit={saveRequest}
                onDone={() => {
                  setTimeout(() => setOpen(false), 300);
                }}
              />

              {/* Previous requests toggle */}
              {hasPrevious && (
                <>
                  <button
                    onClick={() => setShowHistory(v => !v)}
                    className={`w-full flex items-center justify-between mt-3 text-[10px] font-bold py-1.5 transition-colors ${
                      isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <ClockCounterClockwise size={11} />
                      مقترحاتك السابقة ({requests.length})
                    </span>
                    <motion.span animate={{ rotate: showHistory ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <CaretDown size={10} />
                    </motion.span>
                  </button>

                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <PreviousRequests requests={requests} isDark={isDark} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
