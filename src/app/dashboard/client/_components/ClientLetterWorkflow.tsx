"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, DownloadSimple, PencilSimple, PaperPlaneTilt,
  WarningCircle, UserCircle, Buildings, Stamp, ArrowRight,
  NotePencil, ChatCircleText, Robot, X, Warning, Sparkle
} from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";

// ─── Client-specific letter types (consumer language, no legal jargon) ──────────
const CLIENT_LETTER_TYPES = [
  {
    id: "demand_money",
    icon: "💸",
    label: "أطالب بأموال",
    sublabel: "مستحقات · إيجار · تعويض · دَيْن",
    hint: "مثال: إيجار متأخر، راتب لم يُدفع، ضمان لم يُعد",
  },
  {
    id: "stop_harm",
    icon: "🛑",
    label: "أطلب وقف ضرر",
    sublabel: "ضوضاء · بناء مخالف · تعدٍّ على ملكي",
    hint: "مثال: جار يبني على حدود ملكي، ضجيج ليلي متكرر",
  },
  {
    id: "cancel_contract",
    icon: "🚫",
    label: "أفسخ عقداً",
    sublabel: "عقد إيجار · خدمة · اشتراك",
    hint: "مثال: منشأة لم تُسلِّم الخدمة، متجر لم يُرجع المنتج",
  },
  {
    id: "get_document",
    icon: "📄",
    label: "أطلب مستنداً",
    sublabel: "صحة وعافية · عمل · تعليم · عقار",
    hint: "مثال: شهادة راتب، خطاب بنك، وثيقة ملكية",
  },
  {
    id: "complain_entity",
    icon: "📢",
    label: "أشكو جهة أو شركة",
    sublabel: "بنك · شركة · خدمة · موظف",
    hint: "مثال: بنك أخطأ في حسابي، شركة اتصالات فصلت خطي",
  },
  {
    id: "object_decision",
    icon: "⚖️",
    label: "أعترض على قرار",
    sublabel: "غرامة · مخالفة · رفض طلب",
    hint: "مثال: مخالفة بلدية غير مستحقة، رفض مطالبة تأمينية",
  },
];

// ─── Recipient presets (consumer-friendly labels) ────────────────────────────────
const RECIPIENT_PRESETS = [
  { id: "landlord",    label: "مالك العقار",        icon: Buildings },
  { id: "company",     label: "شركة أو متجر",        icon: Buildings },
  { id: "employer",    label: "صاحب العمل",          icon: UserCircle },
  { id: "bank",        label: "بنك أو تمويل",        icon: Stamp },
  { id: "individual",  label: "شخص طبيعي",           icon: UserCircle },
  { id: "government",  label: "جهة حكومية",           icon: Stamp },
];

interface ClientLetterWorkflowProps {
  isDark: boolean;
  card: string;
  onBack: () => void;
}

// ─── Block-based Letter Output ───────────────────────────────────────────────
interface Block { id: string; label: string; content: string; isBold?: boolean; isCenter?: boolean; }
interface BlockOutputProps {
  isDark: boolean; card: string;
  recipientPreset: string; recipientName: string; myName: string;
  story: string; selectedTypeLabel: string;
  includeDeadline: boolean; deadlineDays: string;
  onReset: () => void;
}

function LetterBlockOutput({ isDark, card, recipientPreset, recipientName, myName, story, selectedTypeLabel, includeDeadline, deadlineDays, onReset }: BlockOutputProps) {
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  const salutation = recipientPreset === "government"
    ? `معالي / سعادة رئيس ${recipientName || "المعني"}`
    : `السيد / ${recipientName || "المعني"}`;

  const initialBlocks: Block[] = [
    { id: "basmala", label: "البسملة", content: "بسم الله الرحمن الرحيم", isBold: true, isCenter: true },
    { id: "salutation", label: "المخاطَب", content: `${salutation}\nالمحترم،\nتحية طيبة وبعد،`, isBold: true },
    { id: "body", label: "موضوع الخطاب", content: `يتشرف المرسِل ${myName} بإحاطتكم علماً بالموضوع التالي:\n${story}` },
    ...(includeDeadline ? [{ id: "deadline", label: "مهلة الرد", content: `لذا نطلب منكم اتخاذ الإجراء اللازم خلال (${deadlineDays}) أيام من تاريخ استلام هذا الخطاب، وإلا احتفظنا بحق اتخاذ كافة الإجراءات القانونية المتاحة.`, isBold: true }] : []),
    { id: "closing", label: "الختام", content: `مقدمه،\n${myName}`, isBold: true },
  ];

  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [refining, setRefining] = useState<string | null>(null);

  function updateBlock(id: string, content: string) {
    setBlocks(b => b.map(bl => bl.id === id ? { ...bl, content } : bl));
  }

  async function applyNote(id: string) {
    setRefining(id);
    setNoteId(null);
    await new Promise(r => setTimeout(r, 1400));
    setBlocks(b => b.map(bl => bl.id === id ? { ...bl, content: bl.content + `\n[ملاحظة AI: ${noteText}]` } : bl));
    setNoteText("");
    setRefining(null);
  }

  const ghost = isDark
    ? "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900";

  return (
    <motion.div key="cs4-blocks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Success banner */}
      <div className={`rounded-[1.5rem] p-5 border flex items-center gap-4 ${isDark ? "border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xl" : "border-emerald-200 bg-emerald-50 shadow-sm"}`}>
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <CheckCircle size={22} weight="fill" className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <p className={`font-black text-[15px] ${isDark ? "text-emerald-400" : "text-emerald-800"}`}>خطابك جاهز — كلّ فقرة قابلة للتعديل</p>
          <p className={`text-[13px] mt-1 font-medium ${isDark ? "text-emerald-500/70" : "text-emerald-600"}`}>{selectedTypeLabel} — من {myName} إلى {recipientName || "الطرف الآخر"}</p>
        </div>
        <span className={`text-[11px] px-3 py-1 rounded-full border font-bold ${isDark ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-emerald-200 text-emerald-700 bg-white"}`}>انقر أي فقرة للتعديل</span>
      </div>

      {/* Blocks */}
      <div className={`${card} p-6 space-y-3 shadow-lg`} dir="rtl">
        {blocks.map(bl => (
          <motion.div key={bl.id} layout className={`group relative rounded-[1.25rem] border transition-all duration-300 ${
            editingId === bl.id
              ? isDark ? "border-blue-500/40 bg-blue-900/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "border-blue-300 bg-blue-50/50 shadow-sm"
              : isDark ? "border-white/5 hover:border-white/10 hover:bg-white/[0.02]" : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
          }`}>
            {/* Block label + actions */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${ts}`}>{bl.label}</span>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(editingId === bl.id ? null : bl.id); setNoteId(null); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${ghost}`}>
                  <PencilSimple size={12} weight="bold" /> {editingId === bl.id ? "حفظ" : "تعديل"}
                </button>
                <button onClick={() => { setNoteId(noteId === bl.id ? null : bl.id); setEditingId(null); setNoteText(""); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${ghost}`}>
                  <Robot size={14} weight="duotone" className="text-blue-500" /> مساعدة AI
                </button>
              </div>
            </div>

            {/* Content: view or edit */}
            <div className="px-5 pb-5">
              {editingId === bl.id ? (
                <textarea
                  autoFocus
                  value={bl.content}
                  onChange={e => updateBlock(bl.id, e.target.value)}
                  rows={bl.content.split("\n").length + 1}
                  className={`w-full resize-none rounded-[1rem] border px-4 py-3 text-[14px] outline-none leading-relaxed transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-800"}`}
                />
              ) : (
                <p
                  onClick={() => setEditingId(bl.id)}
                  className={`text-[15px] leading-relaxed whitespace-pre-line cursor-text transition-colors ${bl.isBold ? "font-bold" : "font-medium"} ${bl.isCenter ? "text-center" : ""} ${refining === bl.id ? "opacity-50" : ""} ${tp}`}
                >
                  {refining === bl.id ? (
                    <span className="flex items-center gap-2 text-blue-500 font-bold">
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="inline-block">
                        <Robot size={18} weight="duotone" />
                      </motion.span>
                      AI يعيد صياغة الفقرة...
                    </span>
                  ) : bl.content}
                </p>
              )}
            </div>

            {/* AI Note panel */}
            <AnimatePresence>
              {noteId === bl.id && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className={`overflow-hidden border-t px-5 pb-5 ${isDark ? "border-white/10 bg-blue-900/5" : "border-zinc-100 bg-blue-50/30"}`}>
                  <p className={`text-[12px] font-black mt-4 mb-2 flex items-center gap-2 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                    <Robot size={16} weight="duotone" />
                    كيف تريد تعديل هذه الفقرة؟
                  </p>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 relative">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="مثال: اجعل النبرة أكثر حزماً، أو أضف رقم الهوية..."
                        rows={2}
                        className={`w-full resize-none rounded-[1rem] border px-4 py-3 text-[13px] outline-none pb-12 transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
                      />
                      <div className="absolute bottom-3 start-3">
                        <VoiceInput onTranscript={t => setNoteText(p => p ? p + " " + t : t)} compact />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => applyNote(bl.id)} disabled={!noteText.trim()}
                        className="rounded-[1rem] bg-blue-600 px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40 shadow-sm">تطبيق</motion.button>
                      <button onClick={() => { setNoteId(null); setNoteText(""); }}
                        className={`rounded-[1rem] border px-4 py-2.5 text-[12px] font-bold ${ghost}`}><X size={14} weight="bold" /></button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_0_rgba(11,61,46,0.2)] hover:bg-[#0a3328] transition-colors">
          <DownloadSimple size={16} weight="bold" /> تنزيل PDF
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm"}`}>
          <NotePencil size={16} weight="bold" /> تنزيل Word
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onReset} className={`ms-auto flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"}`}>
          خطاب جديد
        </motion.button>
      </div>
    </motion.div>
  );
}

export function ClientLetterWorkflow({ isDark, card, onBack }: ClientLetterWorkflowProps) {
  const [step, setStep] = useState(1);
  const [letterType, setLetterType] = useState("");
  const [recipientPreset, setRecipientPreset] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [myName, setMyName] = useState("");
  const [story, setStory] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("7");
  const [includeDeadline, setIncludeDeadline] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const selectedType = CLIENT_LETTER_TYPES.find(t => t.id === letterType);

  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  async function generate() {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1800));
    setProcessing(false);
    setDone(true);
  }

  function reset() {
    setStep(1); setLetterType(""); setRecipientPreset(""); setRecipientName("");
    setMyName(""); setStory(""); setIncludeDeadline(false); setDone(false);
    onBack();
  }

  // ── Step indicator ─────────────────────────────────────────────────────────────
  const steps = ["نوع الخطاب", "الطرف الآخر", "قصتك", "الخطاب"];
  const currentStep = done ? 4 : step;

  return (
    <AnimatePresence mode="wait">

      {/* Progress Bar */}
      {!done && (
        <div className={`${card} p-4 mb-6 shadow-sm`}>
          <div className="flex items-center gap-2">
            {steps.map((label, i) => {
              const n = i + 1;
              const isActive = currentStep === n;
              const isDone = currentStep > n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => isDone && setStep(n)}
                  disabled={!isDone}
                  className={`flex items-center gap-2 flex-1 ${isDone ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : 'cursor-default'}`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-black flex-shrink-0 transition-all duration-300 ${
                    isDone ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]" : isActive ? "bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]" : isDark ? "bg-zinc-800 text-zinc-500 border border-white/5" : "bg-zinc-100 text-zinc-400 border border-zinc-200"
                  }`}>
                    {isDone ? <CheckCircle size={16} weight="bold" /> : n}
                  </div>
                  <span className={`text-[11px] hidden sm:block truncate font-bold transition-colors duration-300 ${isActive ? tp : ts}`}>{label}</span>
                  {i < 3 && <div className={`flex-1 h-[2px] mx-2 rounded-full transition-colors duration-300 ${isDone ? "bg-emerald-500/50" : isDark ? "bg-white/10" : "bg-zinc-200"}`} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: نوع الخطاب ──────────────────────────────────────────────────── */}
      {step === 1 && !done && (
        <motion.div key="cs1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-8 space-y-8 shadow-lg`}>
          <div>
            <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${ts}`}>ماذا تريد من الخطاب؟</p>
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>اختر الأقرب لوضعك ليتم تخصيص الصياغة</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CLIENT_LETTER_TYPES.map(lt => (
              <motion.button key={lt.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setLetterType(lt.id)}
                className={`flex items-start gap-4 rounded-[1.5rem] border p-5 text-right transition-all duration-300 ${
                  letterType === lt.id
                    ? isDark ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-blue-400 bg-blue-50 shadow-sm"
                    : isDark ? "border-white/10 hover:border-white/20 hover:bg-white/5" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                }`}>
                <span className="text-3xl flex-shrink-0 mt-1 filter drop-shadow-sm">{lt.icon}</span>
                <div>
                  <p className={`text-[15px] font-black mb-1 transition-colors ${letterType === lt.id ? isDark ? "text-blue-400" : "text-blue-700" : tp}`}>{lt.label}</p>
                  <p className={`text-[12px] font-medium leading-relaxed ${isDark ? (letterType === lt.id ? "text-blue-400/70" : "text-zinc-500") : (letterType === lt.id ? "text-blue-600/70" : "text-zinc-500")}`}>{lt.sublabel}</p>
                </div>
              </motion.button>
            ))}
          </div>

          {selectedType && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <div className={`flex items-start gap-3 px-5 py-4 rounded-[1.25rem] ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                <WarningCircle size={18} weight="duotone" className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className={`text-[13px] font-medium leading-relaxed ${isDark ? "text-blue-300" : "text-blue-800"}`}>{selectedType.hint}</p>
              </div>
            </motion.div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={onBack} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}>
              <ArrowRight size={14} weight="bold" /> رجوع
            </button>
            <motion.button whileHover={letterType ? { scale: 1.02 } : {}} whileTap={letterType ? { scale: 0.98 } : {}}
              onClick={() => setStep(2)} disabled={!letterType}
              className={`flex items-center gap-2 rounded-xl px-8 py-3 text-[14px] font-bold transition-all ${letterType ? "bg-blue-600 text-white shadow-md hover:bg-blue-700" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
              التالي
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Step 2: الطرف الآخر ─────────────────────────────────────────────────── */}
      {step === 2 && !done && (
        <motion.div key="cs2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-8 space-y-8 shadow-lg`}>
          <div>
            <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${ts}`}>من الطرف الآخر؟</p>
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>الشخص أو الجهة التي ستُرسَل إليها الخطاب</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {RECIPIENT_PRESETS.map(r => {
              const Icon = r.icon;
              return (
                <button key={r.id} onClick={() => setRecipientPreset(r.id)}
                  className={`flex flex-col items-center justify-center gap-3 rounded-[1.5rem] border p-5 transition-all duration-300 ${
                    recipientPreset === r.id
                      ? isDark ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]" : "border-blue-400 bg-blue-50 shadow-sm"
                      : isDark ? "border-white/10 hover:border-white/20 hover:bg-white/5" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}>
                  <Icon size={28} weight={recipientPreset === r.id ? "duotone" : "regular"} className={recipientPreset === r.id ? "text-blue-500" : ts} />
                  <span className={`text-[13px] font-bold ${recipientPreset === r.id ? isDark ? "text-blue-400" : "text-blue-700" : tp}`}>{r.label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-5 bg-zinc-50/50 dark:bg-white/[0.02] p-6 rounded-[1.5rem] border border-zinc-200 dark:border-white/10">
            <div>
              <label className={`block text-[13px] font-bold mb-2 ${tp}`}>اسم الطرف الآخر <span className="opacity-50 font-normal">(اختياري)</span></label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="مثال: شركة الوطني العقارية — أحمد العنزي"
                className={`w-full rounded-xl border px-4 py-3 text-[14px] outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
            </div>
            <div>
              <label className={`block text-[13px] font-bold mb-2 ${tp}`}>اسمك أنت</label>
              <input value={myName} onChange={e => setMyName(e.target.value)}
                placeholder="اسمك الكامل"
                className={`w-full rounded-xl border px-4 py-3 text-[14px] outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`} />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}><ArrowRight size={14} weight="bold" /> رجوع</button>
            <motion.button whileHover={recipientPreset && myName.trim() ? { scale: 1.02 } : {}} whileTap={recipientPreset && myName.trim() ? { scale: 0.98 } : {}}
              onClick={() => setStep(3)} disabled={!recipientPreset || !myName.trim()}
              className={`flex items-center gap-2 rounded-xl px-8 py-3 text-[14px] font-bold transition-all ${recipientPreset && myName.trim() ? "bg-blue-600 text-white shadow-md hover:bg-blue-700" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
              التالي
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Step 3: قصتك ────────────────────────────────────────────────────────── */}
      {step === 3 && !done && (
        <motion.div key="cs3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className={`${card} p-8 space-y-8 shadow-lg`}>
          <div>
            <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${ts}`}>ماذا حدث؟</p>
            <p className={`text-[15px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>اشرح بكلامك العادي — الذكاء الاصطناعي سيصيغه بأسلوب رسمي قانوني</p>
          </div>

          <div className="relative">
            <textarea value={story} onChange={e => setStory(e.target.value)}
              rows={6}
              placeholder={`مثال:\nأنا خالد الغامدي، دفعت إيجار ${new Date().getFullYear()} كاملاً لكن المالك طردني قبل انتهاء العقد ورفض إرجاع الضمان (٥٠٠٠ ريال). تواصلت معه أكثر من ٥ مرات ولم يرد.`}
              className={`w-full resize-none rounded-[1.5rem] border p-5 text-[14px] outline-none leading-relaxed pb-16 transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 ${isDark ? "border-white/10 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
            <div className="absolute bottom-4 start-4 bg-inherit rounded-full">
              <VoiceInput onTranscript={t => setStory(prev => prev ? prev + " " + t : t)} />
            </div>
          </div>

          {/* Optional deadline — hidden for government entities */}
          {recipientPreset !== "government" && (
            <div className={`rounded-[1.5rem] border p-6 transition-colors ${isDark ? "border-white/10 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                    هل تريد تحديد موعد للرد؟ <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-white/10 text-zinc-400" : "bg-zinc-200 text-zinc-600"}`}>اختياري</span>
                  </p>
                  <p className={`text-[12px] font-medium mt-1.5 ${ts}`}>إذا لم يتم الرد خلال المدة المحددة، يحق لك اتخاذ إجراء قانوني</p>
                </div>
                <button onClick={() => setIncludeDeadline(p => !p)}
                  className={`w-12 h-7 rounded-full transition-colors relative flex-shrink-0 shadow-inner ${includeDeadline ? "bg-blue-600" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${includeDeadline ? "start-[calc(100%-24px)]" : "start-1"}`} />
                </button>
              </div>
              <AnimatePresence>
                {includeDeadline && (
                  <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 20 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} className="overflow-hidden">
                    <div className="flex gap-2">
                      {["3", "7", "14", "30"].map(d => (
                        <button key={d} onClick={() => setDeadlineDays(d)}
                          className={`flex-1 py-2.5 rounded-xl border text-[13px] font-bold transition-all ${
                            deadlineDays === d ? "bg-blue-600 border-blue-600 text-white shadow-md" : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                          }`}>{d} أيام</button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {recipientPreset === "government" && (
            <div className={`rounded-[1.5rem] border p-5 flex items-center gap-3 text-[13px] font-medium ${isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              <Warning size={20} weight="duotone" className="flex-shrink-0 text-amber-500" />
              تحديد موعد الرد لا ينطبق على الجهات الحكومية — لكل جهة مهلها النظامية المحددة في النظام الموحد
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition-all ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}><ArrowRight size={14} weight="bold" /> رجوع</button>
            <motion.button whileHover={story.trim().length >= 15 && !processing ? { scale: 1.02 } : {}} whileTap={story.trim().length >= 15 && !processing ? { scale: 0.98 } : {}}
              onClick={generate} disabled={story.trim().length < 15 || processing}
              className={`flex items-center gap-2 rounded-xl px-8 py-3 text-[14px] font-bold transition-all ${story.trim().length >= 15 && !processing ? "bg-blue-600 text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] hover:bg-blue-700 hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)]" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"}`}>
              {processing ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />جارٍ صياغة الخطاب...</>
              ) : (
                <><Sparkle size={18} weight="fill" />اصنع الخطاب بالذكاء الاصطناعي</>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Step 4: Block-based editable output ─────────────────────────────────── */}
      {done && (
        <LetterBlockOutput
          isDark={isDark} card={card}
          recipientPreset={recipientPreset}
          recipientName={recipientName}
          myName={myName}
          story={story}
          selectedTypeLabel={selectedType?.label ?? ""}
          includeDeadline={includeDeadline && recipientPreset !== "government"}
          deadlineDays={deadlineDays}
          onReset={reset}
        />
      )}
    </AnimatePresence>
  );
}
