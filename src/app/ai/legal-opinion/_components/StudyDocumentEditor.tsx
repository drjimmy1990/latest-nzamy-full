"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Sparkle, BookmarkSimple, Copy, CheckCircle, Trash, Plus,
  DotsSixVertical, PencilSimple, ArrowDown, Warning,
  SealCheck, X, FloppyDisk, PaperPlaneTilt, Microphone,
} from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType = "heading" | "analysis" | "conclusion" | "risk" | "recommendation" | "note" | "custom";

interface StudySection {
  id: string;
  type: SectionType;
  title: string;
  body: string;
  quality: number; // 0-100 AI confidence
  saved: boolean;
  edited: boolean;
}

// ─── Initial mock sections (would come from AI result in production) ──────────

function buildInitialSections(draft: string): StudySection[] {
  return [
    {
      id: "s1", type: "analysis", quality: 96, saved: false, edited: false,
      title: "الأساس النظامي",
      body: "يُعدّ نظام العمل السعودي (م/٥١) والمادة ٧٧ الأساس الرئيسي للموضوع المعروض. المبدأ القضائي رقم ٨٩/٣ من المحكمة العليا يدعم الموقف القانوني في هذه الحالة.",
    },
    {
      id: "s2", type: "analysis", quality: 91, saved: false, edited: false,
      title: "تحليل الوقائع والمطابقة",
      body: "بمطابقة الوقائع مع المادة ٧٧، يتبيّن أن إنهاء العقد تم دون سبب مشروع موثّق، وهو ما يُعرّض صاحب العمل للمسؤولية القانونية الكاملة بموجب النظام.",
    },
    {
      id: "s3", type: "risk", quality: 88, saved: false, edited: false,
      title: "المخاطر والدفوع المحتملة",
      body: "• الدفع الأول: قد يدّعي الخصم بعدم القدرة المالية لاحتساب التعويض الكامل.\n• الدفع الثاني: احتمالية انقضاء مدة التقادم (٣ سنوات من انتهاء العقد) — التحرك الفوري ضرورة قصوى.",
    },
    {
      id: "s4", type: "recommendation", quality: 99, saved: false, edited: false,
      title: "التوصية",
      body: "يُوصى بتقديم الدعوى أمام المحكمة العمالية مدعّمةً بمستندات إثبات الأجر وكشف الرواتب وخطاب الفصل، مع التحرك الفوري تجنباً لمشكلة التقادم.",
    },
    {
      id: "s5", type: "conclusion", quality: 94, saved: false, edited: false,
      title: "الخلاصة",
      body: "الحق النظامي ثابت وواضح استناداً إلى المادة ٧٧ ومبدأ المحكمة العليا ٨٩/٣. يُنصح بالتحرك القانوني الفوري.",
    },
  ];
}

const SECTION_META: Record<SectionType, { label: string; color: string; bg: string; border: string; icon: typeof Sparkle }> = {
  heading:        { label: "عنوان رئيسي", color: "text-zinc-500",    bg: "bg-zinc-500/10",    border: "border-zinc-500/20",    icon: PencilSimple },
  analysis:       { label: "تحليل قانوني", color: "text-blue-500",   bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Sparkle       },
  conclusion:     { label: "خلاصة",        color: "text-emerald-500",bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: SealCheck     },
  risk:           { label: "مخاطر",        color: "text-orange-500", bg: "bg-orange-500/10",  border: "border-orange-500/20",  icon: Warning       },
  recommendation: { label: "توصية",        color: "text-[#C8A762]",  bg: "bg-[#C8A762]/10",   border: "border-[#C8A762]/25",   icon: SealCheck     },
  note:           { label: "ملاحظة",       color: "text-purple-500", bg: "bg-purple-500/10",  border: "border-purple-500/20",  icon: BookmarkSimple},
  custom:         { label: "مخصص",         color: "text-zinc-400",   bg: "bg-zinc-400/10",    border: "border-zinc-400/20",    icon: PencilSimple  },
};

const NEW_SECTION_TYPES: SectionType[] = ["analysis", "recommendation", "risk", "conclusion", "note", "custom"];

// ─── Single Section Card ──────────────────────────────────────────────────────

function SectionCard({
  section, isDark, onUpdate, onDelete, onSave,
}: {
  section: StudySection;
  isDark: boolean;
  onUpdate: (id: string, patch: Partial<StudySection>) => void;
  onDelete: (id: string) => void;
  onSave: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [aiRefine, setAiRefine] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [localTitle, setLocalTitle] = useState(section.title);
  const [localBody, setLocalBody] = useState(section.body);
  const [copiedId, setCopiedId] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const meta = SECTION_META[section.type];

  async function sendAiRefine() {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    // Simulate AI processing (replace with real API call)
    await new Promise(r => setTimeout(r, 1800));
    const refined = `[تم التنقيح بناءً على: "${aiInstruction.trim()}"]

${section.body}`;
    onUpdate(section.id, { body: refined, edited: true, quality: Math.min(100, section.quality + 2) });
    setLocalBody(refined);
    setAiInstruction("");
    setAiLoading(false);
    setAiRefine(false);
  }

  useEffect(() => {
    if (editing && bodyRef.current) {
      bodyRef.current.style.height = "auto";
      bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
    }
  }, [editing, localBody]);

  function saveEdit() {
    onUpdate(section.id, { title: localTitle, body: localBody, edited: true });
    setEditing(false);
  }

  function cancelEdit() {
    setLocalTitle(section.title);
    setLocalBody(section.body);
    setEditing(false);
  }

  function copySection() {
    navigator.clipboard.writeText(`${section.title}\n\n${section.body}`);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`rounded-2xl border overflow-hidden transition-all ${
        editing
          ? isDark ? "border-blue-500/40 bg-zinc-800/60" : "border-blue-400/50 bg-blue-50/40"
          : isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        <DotsSixVertical
          size={16}
          className={`flex-shrink-0 cursor-grab active:cursor-grabbing ${isDark ? "text-zinc-700" : "text-slate-300"}`}
        />

        {/* Type badge */}
        <span className={`flex-shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
          {meta.label}
        </span>

        {/* Title */}
        {editing ? (
          <input
            value={localTitle}
            onChange={e => setLocalTitle(e.target.value)}
            className={`flex-1 text-[13px] font-bold bg-transparent outline-none border-b pb-0.5 ${
              isDark ? "text-white border-blue-500/40" : "text-slate-900 border-blue-400/50"
            }`}
          />
        ) : (
          <span className={`flex-1 text-[13px] font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
            {section.title}
            {section.edited && (
              <span className={`ms-2 text-[9px] font-normal ${isDark ? "text-blue-400" : "text-blue-500"}`}>• معدّل</span>
            )}
          </span>
        )}

        {/* Quality score */}
        <div className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-mono font-bold ${
          section.quality >= 90 ? "text-emerald-500" : section.quality >= 75 ? "text-amber-500" : "text-red-500"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            section.quality >= 90 ? "bg-emerald-500" : section.quality >= 75 ? "bg-amber-500" : "bg-red-500"
          }`} />
          {section.quality}٪
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button onClick={saveEdit}
                className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg ${isDark ? "bg-blue-600 text-white" : "bg-blue-500 text-white"}`}>
                <FloppyDisk size={11} /> حفظ
              </button>
              <button onClick={cancelEdit}
                className={`p-1.5 rounded-lg ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              {/* AI Refine */}
              <button onClick={() => { setAiRefine(p => !p); setEditing(false); }}
                className={`p-1.5 rounded-lg transition-colors ${
                  aiRefine
                    ? isDark ? "text-purple-400 bg-purple-900/20" : "text-purple-600 bg-purple-50"
                    : isDark ? "text-zinc-500 hover:text-purple-400" : "text-slate-400 hover:text-purple-500"
                }`}
                title="تنقيح بالذكاء الاصطناعي">
                <Sparkle size={13} weight={aiRefine ? "fill" : "regular"} />
              </button>
              {/* Manual Edit */}
              <button onClick={() => { setEditing(true); setAiRefine(false); }}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:text-blue-400" : "text-slate-400 hover:text-blue-500"}`}
                title="تعديل يدوي">
                <PencilSimple size={13} />
              </button>
              <button onClick={copySection}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
                title="نسخ">
                {copiedId ? <CheckCircle size={13} className="text-emerald-500" /> : <Copy size={13} />}
              </button>
              <button onClick={() => onSave(section.id)}
                className={`p-1.5 rounded-lg transition-colors ${section.saved ? "text-[#C8A762]" : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}
                title="حفظ في المرجع">
                <BookmarkSimple size={13} weight={section.saved ? "fill" : "regular"} />
              </button>
              <button onClick={() => onDelete(section.id)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}
                title="حذف">
                <Trash size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={`px-4 pb-4 ${isDark ? "border-t border-white/[0.04]" : "border-t border-slate-100"}`}>
        {editing ? (
          <textarea
            ref={bodyRef}
            value={localBody}
            onChange={e => {
              setLocalBody(e.target.value);
              if (bodyRef.current) {
                bodyRef.current.style.height = "auto";
                bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
              }
            }}
            className={`w-full mt-3 text-[13px] leading-[2] bg-transparent outline-none resize-none ${
              isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"
            }`}
            rows={4}
          />
        ) : (
          <p
            className={`mt-3 text-[13px] leading-[2] whitespace-pre-line ${isDark ? "text-zinc-400" : "text-zinc-600"}`}
            onDoubleClick={() => setEditing(true)}
            title="انقر مرتين للتعديل"
          >
            {section.body}
          </p>
        )}
      </div>

      {/* AI Refine Panel */}
      <AnimatePresence>
        {aiRefine && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 border-t ${
              isDark ? "border-purple-500/20 bg-purple-900/10" : "border-purple-200/50 bg-purple-50/60"
            }`}>
              <div className="flex items-center gap-2 pt-3 mb-2">
                <Sparkle size={12} weight="fill" className={isDark ? "text-purple-400" : "text-purple-600"} />
                <p className={`text-[10px] font-black uppercase tracking-wider ${
                  isDark ? "text-purple-400" : "text-purple-700"
                }`}>تعليمات للذكاء الاصطناعي</p>
                <p className={`text-[10px] ms-1 ${
                  isDark ? "text-zinc-600" : "text-slate-400"
                }`}>— أخبره ماذا تريد تحسينه في هذا القسم</p>
              </div>

              <div className={`flex gap-2 rounded-xl border p-3 ${
                isDark ? "border-purple-500/20 bg-zinc-900/60" : "border-purple-200 bg-white"
              }`}>
                <textarea
                  value={aiInstruction}
                  onChange={e => setAiInstruction(e.target.value)}
                  placeholder={`مثال: "أضف مزيداً من التفاصيل حول مدة التقادم" أو "اجعل الأسلوب أكثر رسمية" أو "أضف سابقة قضائية داعمة"...`}
                  rows={2}
                  disabled={aiLoading}
                  className={`flex-1 bg-transparent text-[12px] leading-relaxed resize-none outline-none ${
                    isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-slate-400"
                  } disabled:opacity-50`}
                />
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <VoiceInput
                    onTranscript={t => setAiInstruction(p => p ? p + " " + t : t)}
                    compact
                  />
                  <button
                    onClick={sendAiRefine}
                    disabled={!aiInstruction.trim() || aiLoading}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 ${
                      isDark ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                    }`}
                  >
                    {aiLoading
                      ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <PaperPlaneTilt size={13} weight="fill" />
                    }
                  </button>
                </div>
              </div>

              {aiLoading && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-[10px] mt-2 flex items-center gap-1.5 ${
                    isDark ? "text-purple-400" : "text-purple-600"
                  }`}
                >
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  الذكاء الاصطناعي يعيد صياغة هذا القسم...
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Add Section Menu ─────────────────────────────────────────────────────────

function AddSectionMenu({ isDark, onAdd }: { isDark: boolean; onAdd: (type: SectionType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-[12px] font-bold transition-all ${
          open
            ? isDark ? "border-blue-500/50 text-blue-400 bg-blue-900/10" : "border-blue-400/50 text-blue-600 bg-blue-50"
            : isDark ? "border-white/[0.07] text-zinc-600 hover:border-blue-500/30 hover:text-zinc-400" : "border-slate-200 text-slate-400 hover:border-blue-400/40 hover:text-slate-600"
        }`}
      >
        <Plus size={14} weight="bold" /> إضافة قسم جديد
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            className={`absolute bottom-full mb-2 inset-x-0 rounded-2xl border p-3 z-10 grid grid-cols-3 gap-2 ${
              isDark ? "border-white/[0.08] bg-zinc-900 shadow-xl shadow-black/40" : "border-slate-200 bg-white shadow-lg"
            }`}
          >
            {NEW_SECTION_TYPES.map(type => {
              const meta = SECTION_META[type];
              const Icon = meta.icon;
              return (
                <button key={type} onClick={() => { onAdd(type); setOpen(false); }}
                  className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border transition-all ${meta.border} ${meta.bg} hover:scale-105`}>
                  <Icon size={14} className={meta.color} weight="duotone" />
                  <span className={`text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  draft: string;
  isDark: boolean;
}

export function StudyDocumentEditor({ draft, isDark }: Props) {
  const [sections, setSections] = useState<StudySection[]>(() => buildInitialSections(draft));
  const [copiedAll, setCopiedAll] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  function updateSection(id: string, patch: Partial<StudySection>) {
    setSections(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  function deleteSection(id: string) {
    setSections(p => p.filter(s => s.id !== id));
  }

  function toggleSave(id: string) {
    setSections(p => p.map(s => s.id === id ? { ...s, saved: !s.saved } : s));
  }

  function addSection(type: SectionType) {
    const newSec: StudySection = {
      id: `s${Date.now()}`,
      type,
      title: SECTION_META[type].label + " جديد",
      body: "",
      quality: 0,
      saved: false,
      edited: false,
    };
    setSections(p => [...p, newSec]);
  }

  function copyAll() {
    const text = sections.map(s => `${s.title}\n\n${s.body}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  }

  const savedCount  = sections.filter(s => s.saved).length;
  const editedCount = sections.filter(s => s.edited).length;

  return (
    <div className={`mt-2 rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.07] bg-zinc-900/50" : "border-slate-200 bg-white shadow-sm"}`}>
      {/* Header toggle */}
      <button
        onClick={() => setShowEditor(p => !p)}
        className={`w-full flex items-center justify-between p-4 transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-blue-900/30" : "bg-blue-50"}`}>
            <PencilSimple size={15} weight="duotone" className={isDark ? "text-blue-400" : "text-blue-600"} />
          </div>
          <div className="text-start">
            <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>محرر الدراسة القانونية</p>
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {sections.length} قسم
              {savedCount > 0 && ` · ${savedCount} محفوظ`}
              {editedCount > 0 && ` · ${editedCount} معدّل`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-50 text-blue-600 border border-blue-200/50"}`}>
            قابل للتعديل
          </span>
          <ArrowDown size={13} className={`transition-transform duration-300 ${showEditor ? "rotate-180" : ""} ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
        </div>
      </button>

      <AnimatePresence>
        {showEditor && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Toolbar */}
            <div className={`flex items-center justify-between px-4 py-2 border-t ${isDark ? "border-white/[0.05] bg-zinc-800/40" : "border-slate-100 bg-slate-50/80"}`}>
              <div className="flex items-center gap-2">
                <p className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                  اضغط مرتين على النص للتعديل — اسحب الأقسام لإعادة الترتيب
                </p>
              </div>
              <button
                onClick={copyAll}
                className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                  isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}
              >
                {copiedAll ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
                {copiedAll ? "تم النسخ" : "نسخ الكل"}
              </button>
            </div>

            {/* Sections — Reorderable */}
            <div className="p-4 space-y-3">
              <Reorder.Group
                axis="y"
                values={sections}
                onReorder={setSections}
                className="space-y-3"
              >
                <AnimatePresence>
                  {sections.map(sec => (
                    <Reorder.Item key={sec.id} value={sec} className="list-none">
                      <SectionCard
                        section={sec}
                        isDark={isDark}
                        onUpdate={updateSection}
                        onDelete={deleteSection}
                        onSave={toggleSave}
                      />
                    </Reorder.Item>
                  ))}
                </AnimatePresence>
              </Reorder.Group>

              <AddSectionMenu isDark={isDark} onAdd={addSection} />
            </div>

            {/* Disclaimer */}
            <div className={`mx-4 mb-4 rounded-xl flex items-start gap-2.5 p-3 border ${isDark ? "border-orange-700/20 bg-orange-900/10" : "border-orange-200/60 bg-orange-50/60"}`}>
              <Warning size={13} className="text-orange-500 flex-shrink-0 mt-0.5" weight="duotone" />
              <p className={`text-[10px] leading-relaxed ${isDark ? "text-orange-400/70" : "text-orange-700/80"}`}>
                هذه الدراسة أُعدّت بمساعدة الذكاء الاصطناعي. يجب مراجعتها والتحقق من النصوص القانونية الواردة فيها قبل أي استخدام رسمي.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
