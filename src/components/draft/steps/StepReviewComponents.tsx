"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Warning, XCircle, Lightbulb, CaretDown, Plus, PencilSimple,
  Trash, Check, Microphone, Copy, DownloadSimple, Eye, X,
} from "@phosphor-icons/react";

import {
  type CheckStatus,
  type ItemAction,
  type SimTarget,
  MOCK_WARGAME,
  SEV_CONFIG,
  SRC_CONFIG,
  MOCK_MEMO_BASE,
} from "./StepReviewData";

// ─── Copy-text button ──────────────────────────────────────────────────────────
export function CopyTextBtn({ text, isDark }: { text: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          : isDark
            ? "border-white/[0.07] bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
      }`}
    >
      {copied ? <><Check size={11} weight="bold" />نُسخ</> : <><Copy size={11} />نسخ كنص</>}
    </motion.button>
  );
}

// ─── Download bar (Word + PDF + CopyText) ─────────────────────────────────────
export function DownloadBar({ isDark, memoText }: { isDark: boolean; memoText?: string }) {
  const MOCK_TEXT = memoText ?? "بسم الله الرحمن الرحيم\n\nأصحاب الفضيلة / قضاة الدائرة العمالية\n\nالموضوع: صحيفة دعوى — فصل تعسفي\n...";
  return (
    <div className="flex gap-2 flex-wrap">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center justify-center gap-2 flex-1 min-w-[120px] rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white"
      >
        <DownloadSimple size={14} />تنزيل Word
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-bold ${
          isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-zinc-600"
        }`}
      >
        <DownloadSimple size={14} />PDF
      </motion.button>
      <CopyTextBtn text={MOCK_TEXT} isDark={isDark} />
    </div>
  );
}

// ─── Inline quick-fix input ────────────────────────────────────────────────────
export function InlineFixInput({ isDark, placeholder }: { isDark: boolean; placeholder?: string }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleVoice() {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "ar-SA";
    rec.continuous = false;
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e: any) => {
      setText((p) => (p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript));
      setListening(false);
    };
    rec.onerror = rec.onend = () => setListening(false);
    rec.start();
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={placeholder ?? "اكتب البيانات المفقودة أو اضغط الميكروفون..."}
          className={`w-full resize-none rounded-xl border px-3 py-2 pe-10 text-[11px] outline-none leading-relaxed ${
            isDark
              ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600"
              : "border-slate-200 bg-white text-zinc-800 placeholder:text-slate-400"
          }`}
        />
        <button
          type="button"
          onClick={handleVoice}
          className={`absolute bottom-2 start-2 w-6 h-6 flex items-center justify-center rounded-lg transition-all ${
            listening ? "bg-red-500 text-white animate-pulse" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Microphone size={11} weight={listening ? "fill" : "regular"} />
        </button>
      </div>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          if (!text.trim()) return;
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        }}
        disabled={!text.trim()}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold disabled:opacity-30 transition-all ${
          saved ? "bg-emerald-500 text-white" : isDark ? "bg-white/[0.05] text-zinc-400" : "bg-slate-100 text-slate-600"
        }`}
      >
        {saved ? <><Check size={10} weight="bold" />تم الحفظ</> : <>حفظ وتطبيق</>}
      </motion.button>
    </div>
  );
}

// ─── Unified expandable action card (used in BOTH review & wargame) ────────────
export function ActionCard({
  id, title, detail, statusOrSeverity, tag, tagColor, suggestion, fixInput, isDark, badgeText,
  action: externalAction, onAction,
}: {
  id: string; title: string; detail: string;
  statusOrSeverity: CheckStatus | "critical" | "medium" | "low";
  tag?: string; tagColor?: string; suggestion?: string; fixInput?: React.ReactNode;
  isDark: boolean; badgeText?: string;
  action?: ItemAction; onAction?: (a: ItemAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [internalAction, setInternalAction] = useState<ItemAction>(null);
  const action = externalAction !== undefined ? externalAction : internalAction;
  
  function setAction(a: ItemAction) {
    if (onAction) onAction(a);
    else setInternalAction(a);
  }

  const isCheckStatus = statusOrSeverity === "ok" || statusOrSeverity === "warn" || statusOrSeverity === "error";

  // Status icon for review items
  function StatusIcon() {
    if (!isCheckStatus) return null;
    if (statusOrSeverity === "ok")    return <CheckCircle size={17} weight="fill" className="text-emerald-500 flex-shrink-0" />;
    if (statusOrSeverity === "error") return <XCircle size={17} weight="fill" className="text-red-500 flex-shrink-0" />;
    return <Warning size={17} weight="fill" className="text-amber-500 flex-shrink-0" />;
  }

  // Severity config for wargame items
  const sevKey = statusOrSeverity as "critical" | "medium" | "low";
  const sev = !isCheckStatus ? SEV_CONFIG[sevKey] : null;

  const detailColor = isCheckStatus
    ? statusOrSeverity === "ok"
      ? isDark ? "text-zinc-600" : "text-slate-400"
      : statusOrSeverity === "error" ? "text-red-500" : "text-amber-500"
    : isDark ? "text-zinc-400" : "text-slate-600";

  const borderColor = isCheckStatus
    ? statusOrSeverity === "ok"
      ? isDark ? "border-white/[0.04]" : "border-slate-100"
      : statusOrSeverity === "error" ? isDark ? "border-red-700/15" : "border-red-100"
      : isDark ? "border-amber-700/15" : "border-amber-100"
    : action === "add"
      ? isDark ? "border-emerald-700/25" : "border-emerald-200"
      : action === "delete"
        ? isDark ? "border-red-700/15 opacity-50" : "border-red-100 opacity-50"
        : action === "edit"
          ? isDark ? "border-[#C8A762]/25" : "border-amber-200"
          : isDark ? "border-white/[0.06]" : "border-slate-200";

  const canExpand = !!(suggestion || fixInput || !isCheckStatus);
  const noAction = !isCheckStatus; // wargame items have add/edit/delete

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all shadow-sm ${isDark ? "bg-zinc-900/60" : "bg-white"} ${borderColor}`}>
      <button
        onClick={() => canExpand && setExpanded(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-right ${canExpand ? "cursor-pointer" : "cursor-default"}`}
      >
        {/* Left: status icon or severity dot */}
        {isCheckStatus ? <StatusIcon /> : (
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${sev!.dot}`} />
        )}

        {/* Title + detail */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Badge (wargame severity or custom) */}
            {badgeText && sev && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isDark ? sev.badge.d : sev.badge.l}`}>{badgeText}</span>
            )}
            {tag && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${tagColor}`}>{tag}</span>
            )}
          </div>
          <p className={`text-[12px] font-semibold leading-snug ${isDark ? "text-zinc-200" : "text-zinc-800"} mt-0.5`}>{title}</p>
          <p className={`text-[10px] leading-snug mt-0.5 ${detailColor}`}>{detail}</p>
        </div>

        {/* Right: action buttons (wargame only) or expand caret */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {noAction && (
            <>
              <button
                onClick={() => setAction(action === "add" ? null : "add")}
                title="إضافة للمذكرة"
                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                  action === "add"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isDark ? "border-white/[0.08] text-zinc-500 hover:border-emerald-500/40 hover:text-emerald-400" : "border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-500"
                }`}
              >
                {action === "add" ? <Check size={10} weight="bold" /> : <Plus size={10} />}
              </button>
              <button
                onClick={() => setAction(action === "edit" ? null : "edit")}
                title="تعديل وإضافة"
                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                  action === "edit"
                    ? "border-[#C8A762] bg-[#C8A762]/10 text-[#C8A762]"
                    : isDark ? "border-white/[0.08] text-zinc-500 hover:border-[#C8A762]/40 hover:text-[#C8A762]" : "border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-500"
                }`}
              >
                <PencilSimple size={10} />
              </button>
              <button
                onClick={() => setAction(action === "delete" ? null : "delete")}
                title="تجاهل"
                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                  action === "delete"
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : isDark ? "border-white/[0.08] text-zinc-500 hover:border-red-500/30 hover:text-red-400" : "border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-400"
                }`}
              >
                <Trash size={10} />
              </button>
            </>
          )}
          {/* Expand caret */}
          {canExpand && (
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
              <CaretDown size={10} className={isDark ? "text-zinc-600" : "text-slate-400"} />
            </motion.span>
          )}
        </div>
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={`border-t px-4 pb-4 pt-3 space-y-2.5 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              {/* Suggestion / response */}
              {suggestion && (
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                  <Lightbulb size={11} weight="duotone" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] font-bold text-[#C8A762] mb-0.5">الرد المقترح</p>
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{suggestion}</p>
                  </div>
                </div>
              )}

              {/* edit mode textarea */}
              {action === "edit" && (
                <textarea
                  rows={2}
                  placeholder="عدّل الرد قبل إضافته للمذكرة..."
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-[11px] outline-none ${
                    isDark ? "border-white/[0.07] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600" : "border-amber-200 bg-white text-zinc-800 placeholder:text-zinc-400"
                  }`}
                  defaultValue={suggestion ?? ""}
                />
              )}

              {/* Fix input (for error review items) */}
              {fixInput}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Memo preview after wargame apply ─────────────────────────────────────────
export function AppliedMemoPreview({ isDark, applied }: { isDark: boolean; applied: string[] }) {
  const wargameApplied = MOCK_WARGAME.filter(p => applied.includes(p.id));
  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${isDark ? "border-white/[0.05] bg-zinc-900/60" : "border-slate-100 bg-slate-50"}`}>
        <Eye size={14} weight="duotone" className="text-[#C8A762]" />
        <p className={`text-[12px] font-bold flex-1 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
          المذكرة الختامية بعد تطبيق {applied.length} تحسين
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-slate-300" /><span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أصلي</span></div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-red-400" /><span className="text-[9px] text-red-400">إضافة جديدة</span></div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className={`rounded-xl p-3 text-[11px] leading-[2] whitespace-pre-line ${isDark ? "bg-zinc-950/40 text-zinc-400" : "bg-slate-50 text-slate-600"}`}>{MOCK_MEMO_BASE}</div>
        <div className="space-y-2">
          <p className={`text-[11px] font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>الإضافات المُطبَّقة ({wargameApplied.length})</p>
          {wargameApplied.map(p => (
            <div key={p.id} className={`border-r-4 border-red-500 rounded-xl px-3 py-2.5 ${isDark ? "bg-red-900/8 border-red-700/20" : "bg-red-50 border-red-200"}`}>
              <p className="text-[9px] font-bold text-red-500 mb-1">إضافة جديدة — {SRC_CONFIG[p.source].label}</p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-red-300/80" : "text-red-800"}`}>{p.response}</p>
            </div>
          ))}
        </div>
        <DownloadBar isDark={isDark} memoText={MOCK_MEMO_BASE + "\n\n" + wargameApplied.map(p => p.response).join("\n")} />
      </div>
    </div>
  );
}
