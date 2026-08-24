"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudArrowUp, X, FileText, Warning, Spinner } from "@phosphor-icons/react";
import { VoiceInput } from "@/components/ui/VoiceInput";
import type { OrderAttachment } from "@/lib/services/orderIntake";

// ─── 27 قسم قانوني ────────────────────────────────────────────────────────────

const LEGAL_AREAS_27 = [
  { id: "commercial",   label: "تجاري" },
  { id: "labor",        label: "عمالي" },
  { id: "civil",        label: "مدني" },
  { id: "admin",        label: "إداري" },
  { id: "family",       label: "أحوال شخصية" },
  { id: "real_estate",  label: "عقاري" },
  { id: "criminal",     label: "جنائي" },
  { id: "companies",    label: "شركات" },
  { id: "contracts",    label: "تحرير عقود" },
  { id: "ip",           label: "ملكية فكرية" },
  { id: "tax",          label: "ضريبي وزكوي" },
  { id: "insurance",    label: "تأمين" },
  { id: "banking",      label: "بنكي ومالي" },
  { id: "ma",           label: "اندماج واستحواذ" },
  { id: "bankruptcy",   label: "إفلاس وإعادة هيكلة" },
  { id: "execution",    label: "تنفيذ وإشكالات" },
  { id: "arbitration",  label: "تحكيم دولي" },
  { id: "maritime",     label: "بحري وجوي" },
  { id: "competition",  label: "منافسة وحماية مستهلك" },
  { id: "capital",      label: "سوق مالية وأوراق مالية" },
  { id: "gov_contract", label: "عقود حكومية" },
  { id: "environment",  label: "بيئة وموارد طبيعية" },
  { id: "digital",      label: "جرائم معلوماتية" },
  { id: "medical",      label: "طبي وصحي" },
  { id: "tourism",      label: "سياحة وضيافة" },
  { id: "inheritance",  label: "ميراث وتركات" },
  { id: "other",        label: "أخرى" },
];

// ─── غرض الدراسة — اختيار واحد (يحكم باقي الخطوات) ─────────────────────────

export const STUDY_GOALS = [
  {
    id: "dispute",
    label: "دعوى / نزاع قائم",
    desc: "لديّ قضية منظورة أمام جهة قضائية",
    icon: "⚖️",
    hint: "سيُعرض لك لاحقاً تحديد المرحلة القضائية",
  },
  {
    id: "planning",
    label: "استشارة وقائية",
    desc: "لم يقع النزاع بعد — أريد تحليل المخاطر مسبقاً",
    icon: "🛡️",
    hint: null,
  },
  {
    id: "drafting",
    label: "تحرير مستند / عقد",
    desc: "مسودة أو مراجعة عقد أو لائحة أو نظام داخلي",
    icon: "📝",
    hint: null,
  },
  {
    id: "academic",
    label: "بحث أكاديمي / مقارن",
    desc: "دراسة قانونية نظرية أو مقارنة أنظمة",
    icon: "📚",
    hint: null,
  },
  {
    id: "compliance",
    label: "امتثال تنظيمي",
    desc: "التحقق من مطابقة إجراءات الشركة للأنظمة",
    icon: "✅",
    hint: null,
  },
] as const;

export type StudyGoalId = typeof STUDY_GOALS[number]["id"];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  topicArea: string;
  setTopicArea: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  studyGoal: StudyGoalId | "";
  setStudyGoal: (v: StudyGoalId | "") => void;
  isDark: boolean;
  card: string;
  attachments: OrderAttachment[];
  uploading: boolean;
  attachError: string;
  attachFiles: (files: FileList | File[]) => Promise<OrderAttachment[]>;
  removeAttachment: (documentId: string) => void;
}

// attachments used to be local useState here (name/type only, File
// discarded) — Props had no attachment callback, so every upload died local
// and never reached the order (Task C4 recon). Now real uploads via
// useOrderAttachments(), lifted to page.tsx like the rest of this file's
// shared state. The per-attachment free-text description this used to offer
// is dropped rather than lifted: OrderAttachment has no field for it, no
// other sub-flow's attachments carry one, and the admin fulfilling the
// order by hand already has the filename plus the study's own description
// field for context — see task-C4-report.md for the full rationale.
export function ContextStudy({
  topicArea, setTopicArea,
  description, setDescription,
  studyGoal, setStudyGoal,
  isDark, card,
  attachments, uploading, attachError, attachFiles, removeAttachment,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  // One batch call rather than a loop of single attachFile() calls — see
  // useOrderAttachments.ts's attachFiles.
  // Array.from() before the reset: e.target.files is a live FileList, and the
  // `e.target.value = ""` that lets the same filename be re-picked empties it
  // in place — reading length after the reset always saw zero, so nothing was
  // ever uploaded.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) await attachFiles(files);
  }

  const selectedGoal = STUDY_GOALS.find(g => g.id === studyGoal);

  return (
    <motion.div
      key="ctx-study"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      {/* ─── 1. غرض الدراسة — الأول والأهم ─── */}
      <div className={`${card} p-4`}>
        <div className="mb-3">
          <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            ما الغرض من هذه الدراسة؟
          </p>
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            يحدد هذا الاختيار طريقة البحث والأدوات المستخدمة
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STUDY_GOALS.map(g => (
            <button
              key={g.id}
              onClick={() => setStudyGoal(g.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-start transition-all ${
                studyGoal === g.id
                  ? isDark ? "border-blue-500/40 bg-blue-900/15" : "border-blue-400/50 bg-blue-50"
                  : isDark ? "border-white/[0.07] hover:border-white/[0.14]" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="text-xl flex-shrink-0">{g.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-[12px] font-bold ${
                  studyGoal === g.id
                    ? isDark ? "text-blue-300" : "text-blue-800"
                    : isDark ? "text-zinc-200" : "text-zinc-800"
                }`}>{g.label}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{g.desc}</p>
              </div>
              {studyGoal === g.id && (
                <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${isDark ? "bg-blue-500" : "bg-blue-500"}`}>
                  <span className="w-1.5 h-1.5 bg-white rounded-full" />
                </span>
              )}
            </button>
          ))}
        </div>
        {selectedGoal?.hint && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className={`text-[10px] mt-3 px-3 py-2 rounded-lg ${isDark ? "bg-blue-900/20 text-blue-400" : "bg-blue-50 text-blue-600"}`}
          >
            ℹ️ {selectedGoal.hint}
          </motion.p>
        )}
      </div>

      {/* ─── 2. المجال القانوني ─── */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          المجال القانوني — ٢٧ قسم
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LEGAL_AREAS_27.map(area => (
            <button
              key={area.id}
              onClick={() => setTopicArea(area.id)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-medium border transition-all ${
                topicArea === area.id
                  ? "bg-blue-500 border-blue-500 text-white"
                  : isDark
                  ? "border-white/[0.08] text-zinc-500 hover:border-blue-500/30 hover:text-zinc-300"
                  : "border-slate-200 text-slate-500 hover:border-blue-500/30"
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── 3. موضوع الدراسة ─── */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            موضوع الدراسة والأسئلة المطلوبة
          </p>
          <VoiceInput
            onTranscript={t => setDescription(description ? description + " " + t : t)}
            compact
          />
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={
            studyGoal === "dispute"    ? "مثال: فصل موظف بعد سنتين دون سبب واضح — ما مدى صحة المطالبة بالتعويض؟" :
            studyGoal === "drafting"   ? "مثال: أريد صياغة عقد استشارات لشركة مع شرط عدم المنافسة لمدة سنتين..." :
            studyGoal === "compliance" ? "مثال: هل إجراءاتنا في التعامل مع بيانات العملاء متوافقة مع نظام حماية البيانات الشخصية؟" :
            studyGoal === "academic"   ? "مثال: أود المقارنة بين نظام التحكيم السعودي ونظيره المصري في مسائل الاختصاص..." :
            "صِف موضوع الدراسة والأسئلة التي تريد إجابة عليها..."
          }
          rows={5}
          className={`w-full resize-none rounded-xl border p-3.5 text-[13px] outline-none leading-relaxed ${
            isDark
              ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500/40"
              : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400 focus:border-blue-500/40"
          }`}
        />
        {description.length > 0 && (
          <p className={`text-[10px] mt-1.5 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
            {description.length} حرف {description.length < 30 ? "— كلما أضفت تفاصيل كانت النتيجة أدق" : ""}
          </p>
        )}
      </div>

      {/* ─── 4. المستندات المرجعية ─── */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              المستندات المرجعية
              <span className="normal-case font-normal opacity-60 ms-1">(اختياري)</span>
            </p>
            <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              أرفق ما يدعم الدراسة — PDF · Word · صورة — ومكن إضافة أكثر من مرفق
            </p>
          </div>
          {attachments.length > 0 && !uploading && (
            <button
              onClick={() => fileRef.current?.click()}
              className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition-all ${
                isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              إضافة مرفق
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={handleFile}
        />

        {attachError && (
          <p className="flex items-center gap-1.5 text-[11px] text-red-500 mb-2">
            <Warning size={12} />{attachError}
          </p>
        )}

        <AnimatePresence>
          {attachments.map(att => (
            <motion.div
              key={att.documentId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className={`mb-2 rounded-xl border overflow-hidden ${
                isDark ? "border-white/[0.07] bg-zinc-800/40" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-blue-500 bg-blue-500/10`}>
                  <FileText size={14} weight="duotone" />
                </div>
                <span className={`flex-1 text-[12px] truncate font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  {att.name}
                </span>
                <button onClick={() => removeAttachment(att.documentId)} className="text-red-400 hover:text-red-500 p-1">
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {attachments.length === 0 && (
          <button
            onClick={() => { if (!uploading) fileRef.current?.click(); }}
            disabled={uploading}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed text-[12px] transition-colors disabled:opacity-60 ${
              isDark
                ? "border-white/[0.07] text-zinc-500 hover:border-blue-500/30 hover:text-zinc-300"
                : "border-slate-200 text-slate-400 hover:border-blue-400/40 hover:text-slate-600"
            }`}
          >
            {uploading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Spinner size={16} />
              </motion.div>
            ) : (
              <CloudArrowUp size={16} />
            )}
            {uploading ? "جارٍ رفع الملف..." : "أرفق مستنداً مرجعياً — PDF · Word · صورة"}
            {!uploading && <span className={`text-[10px] ms-1 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>(متعدد)</span>}
          </button>
        )}
      </div>
    </motion.div>
  );
}
