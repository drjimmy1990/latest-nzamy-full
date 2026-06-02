"use client";
// ─── Context: Cross-Examination Questions Generator ───────────────────────────
// Workflow:
//   Phase 1 — Quick Scan: user pastes/describes the witness testimony/statement
//   Phase 2 — Dynamic Questions (3 targeted probes)
//   Phase 3 — AI builds question battery → Result
//
// Design philosophy (from DYNAMIC_QUESTIONS_BLUEPRINT):
//   • Ask before analyze — we need context to target the questions
//   • Separate: who is this witness? what is their role? what do we want to destroy?
//   • Produce 3 tiers: Foundational → Trap → Closure

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserFocus, Warning, Question, ArrowRight, CheckCircle,
  FileText, Target, Funnel, UploadSimple, TextT, Paperclip, X,
} from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";

interface Props {
  description: string;
  setDescription: (v: string) => void;
  isDark: boolean;
  card: string;
}

type ScanPhase = "input" | "scanning" | "questions" | "ready";

interface DynQ { q: string; placeholder: string; key: string; }

const WITNESS_ROLES = [
  "شاهد إثبات (للخصم)",
  "شاهد نفي (لنا)",
  "خبير الخصم",
  "مُدّعٍ شخصياً",
  "مُدّعى عليه شخصياً",
  "موظف حكومي",
  "أطراف أخرى",
];

const DESTROY_GOALS = [
  "إثبات مصلحة الشاهد (تهمة التحيز)",
  "كشف التناقض مع شهادة سابقة",
  "إثبات عدم الإدراك أو الغياب",
  "إسقاط الأهلية الشرعية للشهادة",
  "الكشف عن معلومات مدفوعة أو موجّهة",
  "إثبات التعارض مع مستندات رسمية",
];

export function ContextCrossExam({ description, setDescription, isDark, card }: Props) {
  const [phase, setPhase] = useState<ScanPhase>("input");
  const [dynQuestions, setDynQuestions] = useState<DynQ[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [witnessRole, setWitnessRole] = useState("");
  const [destroyGoal, setDestroyGoal] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Combined validity: has content (text OR files) + role + goal
  const hasContent = inputMode === "text"
    ? description.trim().length >= 20
    : uploadedFiles.length > 0;

  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";

  function buildDynQuestions(text: string): DynQ[] {
    const qs: DynQ[] = [
      {
        key: "relation",
        q: "ما علاقة هذا الشاهد بالخصم وبك؟ (مثال: موظف سابق، شريك، صديق، لا علاقة)",
        placeholder: "موظف سابق لدى الخصم، ترك العمل بعد النزاع بشهر...",
      },
      {
        key: "contradiction",
        q: "هل أدلى بأقوال سابقة أو شهادات في مواضع أخرى تتعارض مع ما سيقوله؟",
        placeholder: "نعم — أدلى بتصريح في محضر الشرطة بتاريخ X يقول عكس ما يزعمه الآن...",
      },
      {
        key: "target",
        q: "ما الهدف الأساسي من استجوابه؟ ما الذي تريد أن يُقرّ به أو يتناقض فيه؟",
        placeholder: "أريده يُقرّ بأنه لم يكن حاضراً وقت الحادثة وأن علمه بها جاء لاحقاً...",
      },
    ];

    // Context-aware additions based on testimony text
    const lowerText = text.toLowerCase();
    if (lowerText.includes("خبير") || lowerText.includes("تقرير")) {
      qs.push({
        key: "expert_bias",
        q: "هل تقرير الخبير مبني على معطيات قدمها الخصم حصراً؟ ما المعطيات الناقصة؟",
        placeholder: "نعم، لم يطلع الخبير على مستندات الدفع من طرفنا...",
      });
    }
    if (lowerText.includes("عقد") || lowerText.includes("اتفاق")) {
      qs.push({
        key: "contract_knowledge",
        q: "هل الشاهد كان طرفاً في العقد أم مجرد مطلع عليه؟ متى علم بتفاصيله؟",
        placeholder: "مطلع فقط، علم بالعقد بعد توقيعه بأسبوع...",
      });
    }

    return qs;
  }

  function handleFiles(fileList: FileList) {
    const newFiles = Array.from(fileList).map(f => ({
      name: f.name,
      size: f.size > 1024 * 1024
        ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
        : `${(f.size / 1024).toFixed(0)} KB`,
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    // Set a placeholder description for downstream processing
    if (!description) setDescription(`[ملفات مرفوعة: ${newFiles.map(f => f.name).join("، ")}]`);
  }

  async function startScan() {
    if (!hasContent) return;
    // Build text context from files if in file mode
    if (inputMode === "file" && uploadedFiles.length > 0 && !description.includes("===")) {
      setDescription(
        `=== مستندات الشهادة ===\n${uploadedFiles.map((f, i) => `المستند ${i + 1}: ${f.name}`).join("\n")}`
      );
    }
    setPhase("scanning");
    await new Promise(r => setTimeout(r, 1600));
    const textForAnalysis = inputMode === "file"
      ? uploadedFiles.map(f => f.name).join(" ")
      : description;
    setDynQuestions(buildDynQuestions(textForAnalysis));
    setAnswers(Array(buildDynQuestions(textForAnalysis).length).fill(""));
    setPhase("questions");
  }

  const canProceed = answers.length > 0 && answers.every(a => a.trim().length > 2) && witnessRole && destroyGoal;

  function confirmReady() {
    // Build a comprehensive description for the AI
    const enrichedDesc = [
      `=== الشهادة / الموقف ===\n${description}`,
      `=== صفة الشاهد ===\n${witnessRole}`,
      `=== هدف الاستجواب ===\n${destroyGoal}`,
      ...dynQuestions.map((q, i) => `=== ${q.q} ===\n${answers[i] || "—"}`),
    ].join("\n\n");
    setDescription(enrichedDesc);
    setPhase("ready");
  }

  return (
    <div className="space-y-4">

      {/* ── Phase: INPUT ── */}
      {phase === "input" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {/* Header */}
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <UserFocus size={16} weight="duotone" className="text-rose-500" />
              <p className={`text-[11px] font-black uppercase tracking-widest text-rose-500`}>
                الخطوة الأولى — شهادة الشاهد / موقف الخصم
              </p>
            </div>
            <p className={`text-[12px] leading-relaxed ${ts}`}>
              الصق نص شهادة الشاهد أو ملخص موقفه أو ما تعرفه عن أقواله — كلما كانت التفاصيل أكثر، كانت الأسئلة أكثر حدةً وتركيزاً.
            </p>
          </div>

          {/* Input mode switcher */}
          <div className={`${card} p-1 flex gap-1`}>
            {(["text", "file"] as const).map(mode => (
              <button key={mode} onClick={() => setInputMode(mode)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all ${
                  inputMode === mode
                    ? "bg-rose-500 text-white shadow-sm"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"
                }`}>
                {mode === "text" ? <><TextT size={13} weight="bold" /> كتابة / لصق</> : <><Paperclip size={13} weight="bold" /> رفع ملف</>}
              </button>
            ))}
          </div>

          {/* TEXT MODE */}
          {inputMode === "text" && (
            <div className={`${card} p-4`}>
              <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                شهادة الشاهد أو موقف الخصم
              </p>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={`مثال:\n— الشاهد (فؤاد المالكي) ادّعى أنه حضر مجلساً في مكتب المدعي ورأى خالد الجدعاني يتسلّم مبلغاً نقدياً...\n— أو: الصق نص محضر الجلسة أو ملابسات الشهادة كاملةً...`}
                  rows={7}
                  className={`w-full resize-none rounded-xl border px-4 py-3 text-[13px] outline-none leading-relaxed transition-all focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500/30 ${
                    isDark ? "border-white/[0.07] bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-700"
                           : "border-slate-200 bg-white text-zinc-900 placeholder:text-zinc-400"
                  }`}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <VoiceInput onTranscript={t => setDescription(description ? `${description}\n${t}` : t)} compact />
                <p className={`text-[10px] ${ts}`}>{description.length} حرف</p>
              </div>
            </div>
          )}
          {/* Witness role selector */}
          <div className={`${card} p-4 space-y-2`}>
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>صفة الشاهد في القضية</p>
            <div className="flex flex-wrap gap-2">
              {WITNESS_ROLES.map(r => (
                <button key={r} onClick={() => setWitnessRole(r)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${witnessRole === r ? "bg-rose-500 border-rose-500 text-white" : isDark ? `${border} text-zinc-400 hover:text-zinc-200` : "border-slate-200 text-zinc-500 hover:text-zinc-800"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Destroy goal selector */}
          <div className={`${card} p-4 space-y-2`}>
            <div className="flex items-center gap-2 mb-1">
              <Target size={13} className="text-rose-500" weight="fill" />
              <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>هدف الاستجواب الأساسي</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DESTROY_GOALS.map(g => (
                <button key={g} onClick={() => setDestroyGoal(g)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${destroyGoal === g ? "bg-rose-500 border-rose-500 text-white" : isDark ? `${border} text-zinc-400 hover:text-zinc-200` : "border-slate-200 text-zinc-500 hover:text-zinc-800"}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={startScan}
              disabled={!hasContent || !witnessRole || !destroyGoal}
              className="flex items-center gap-2 bg-rose-600 text-white font-black px-6 py-2.5 rounded-xl text-[13px] hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-rose-500/20">
              <Funnel size={15} weight="fill" />
              ابدأ التحليل السريع
              <ArrowRight size={13} />
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Phase: SCANNING ── */}
      {phase === "scanning" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-8 flex flex-col items-center gap-4`}>
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <UserFocus size={28} className="text-rose-500 animate-pulse" weight="duotone" />
            </div>
          </div>
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>جاري قراءة الشهادة...</p>
          <p className={`text-[12px] ${ts}`}>تحديد نقاط الاستغلال والتناقضات المحتملة</p>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div key={i} animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, delay: i * 0.2, duration: 0.8 }}
                className="w-2 h-2 rounded-full bg-rose-500/60" />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Phase: QUESTIONS ── */}
      {phase === "questions" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <Question size={14} weight="fill" className="text-rose-500" />
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">
                تدقيق في السياق — {dynQuestions.length} أسئلة
              </p>
            </div>
            <p className={`text-[12px] leading-relaxed ${ts}`}>
              قرأت الشهادة. أحتاج تفاصيل إضافية لأبني أسئلة الاستجواب بدقة جراحية — أجب بالقدر الذي تعرفه:
            </p>
          </div>

          {dynQuestions.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className={`${card} p-4 space-y-2`}>
              <label className={`flex items-start gap-2 text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5 bg-rose-500/10 text-rose-500">{i + 1}</span>
                {item.q}
              </label>
              <div className="relative">
                <textarea
                  value={answers[i] ?? ""}
                  onChange={e => setAnswers(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  placeholder={item.placeholder}
                  rows={3}
                  className={`w-full resize-none rounded-xl border px-4 py-3 pe-12 text-[13px] outline-none leading-relaxed transition-all focus:ring-2 focus:ring-rose-500/15 focus:border-rose-500/30 ${isDark ? "border-white/[0.07] bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-700" : "border-slate-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`}
                />
                <div className="absolute bottom-2.5 start-3">
                  <VoiceInput onTranscript={t => setAnswers(prev => { const n = [...prev]; n[i] = (n[i] ? n[i] + " " : "") + t; return n; })} compact />
                </div>
              </div>
            </motion.div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setPhase("input")} className={`text-[12px] font-bold px-4 py-2 rounded-xl border transition-colors ${isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-zinc-400 hover:text-zinc-700"}`}>
              رجوع
            </button>
            <motion.button whileTap={canProceed ? { scale: 0.97 } : {}}
              onClick={() => canProceed && confirmReady()}
              disabled={!canProceed}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-black transition-all ${canProceed ? "bg-rose-600 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-700" : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-zinc-400 cursor-not-allowed"}`}>
              <UserFocus size={14} weight="fill" />
              ابنِ أسئلة الاستجواب
              <ArrowRight size={13} />
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Phase: READY ── */}
      {phase === "ready" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-5 space-y-3`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <CheckCircle size={20} weight="fill" className="text-rose-500" />
            </div>
            <div>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>السياق جاهز — انتقل لتحليل الشهادة</p>
              <p className={`text-[11px] ${ts}`}>اضغط "ابدأ التحليل" أدناه لبناء بطارية الأسئلة</p>
            </div>
          </div>

          {/* Summary preview */}
          <div className={`rounded-xl border p-3 space-y-2 text-[11px] ${isDark ? "border-white/[0.06] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`}>
            <div className="flex gap-2">
              <span className={`font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الشاهد:</span>
              <span className={`${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{witnessRole}</span>
            </div>
            <div className="flex gap-2">
              <span className={`font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الهدف:</span>
              <span className={`text-rose-500 font-bold`}>{destroyGoal}</span>
            </div>
            <div className="flex gap-2">
              <span className={`font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>السياق:</span>
              <span className={`${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{dynQuestions.length} نقاط استغلال محددة</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
