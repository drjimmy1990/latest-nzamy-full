"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FilePdf, FileDoc, CheckCircle, Warning, FileText, ArrowRight, X, Sparkle,
  CalendarCheck, MagnifyingGlass, Scales, ShieldWarning,
  ChatCircleDots, Tray, Microphone, Question, Clock, Monitor, FolderOpen, Plus
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToDesktop, addToSession, getActiveSessions, createSession, type CollectorSession } from "@/lib/services/researchService";
import { ClientMediaResultTab, CLIENT_MEDIA_FLAGS } from "./ClientMediaPanel";
import InputPhase, { type CaseFile, type MediaItem } from "./InputPhase";

interface Props { isDark: boolean; isRTL: boolean; }

interface DynQ {
  q: string;
  placeholder: string;
  allowsFile?: boolean;
}

// ─── Dynamic Questions Generator (Blueprint §2) ───────────────────────────────
// For the Attachment Squeezer, questions aim to clarify what the lawyer wants
// to extract/focus on, NOT to fill gaps like client tools.
function generateSqueezerQuestions(fileCount: number, fileNames: string[]): DynQ[] {
  const namesStr = fileNames.join(" ").toLowerCase();
  const qs: DynQ[] = [];

  // Q1: Always — who do we represent?
  qs.push({
    q: "من تمثل في هذه القضية؟",
    placeholder: "المدعي / المدعى عليه / المستأنف / الطاعن...",
  });

  // Q2: Target product?
  qs.push({
    q: "ما المنتج القانوني المستهدف بعد تحليل المرفقات؟",
    placeholder: "نقض / استئناف / رد / التماس / مذكرة ختامية...",
  });

  // Q3: Focus area — contextual on filenames
  const hasHukm = /حكم|صك|قرار/.test(namesStr);
  const hasContract = /عقد|اتفاق/.test(namesStr);
  const hasExpert = /خبير|تقرير/.test(namesStr);

  if (hasHukm) {
    qs.push({
      q: "ما أبرز ما تريد استخراجه من الحكم المرفق؟",
      placeholder: "عيوب التسبيب / إقرارات الخصم / الأخطاء الإجرائية...",
    });
  } else if (hasContract) {
    qs.push({
      q: "ما البنود أو الإشكاليات التي تريد التركيز عليها في العقد؟",
      placeholder: "شرط جزائي / التزامات منتهكة / بند غامض...",
    });
  } else if (hasExpert) {
    qs.push({
      q: "هل تقرير الخبير يخدم موقفك أم يضره؟ وما النقاط المحل خلاف؟",
      placeholder: "يخدمنا في... / يضرنا في... / أريد كشف قصوره...",
    });
  } else if (fileCount >= 3) {
    qs.push({
      q: "ما أولوية استخراجك؟ (يمكنك اختيار أكثر من واحد)",
      placeholder: "إقرارات الخصم / التسلسل الزمني / الثغرات / التناقضات...",
    });
  }

  return qs.slice(0, 3);
}

const sp = { type: "spring" as const, stiffness: 280, damping: 26 };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: sp } };

function ThinkingSkeleton({ isDark }: { isDark: boolean }) {
  const b = isDark ? "bg-zinc-800" : "bg-slate-200";
  return (
    <div className="space-y-4 animate-pulse">
      <div className={`h-3 w-2/5 rounded-full ${b}`} />
      <div className={`h-14 rounded-2xl ${b}`} />
      <div className={`h-14 rounded-2xl ${b}`} />
      <div className={`h-14 rounded-2xl ${b}`} />
    </div>
  );
}

export default function AttachmentSqueezer({ isDark, isRTL }: Props) {
  const [files, setFiles]           = useState<CaseFile[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [context, setContext]       = useState("");
  const [phase, setPhase]           = useState<"input"|"thinking"|"questions"|"squeezing"|"result">("input");
  const [dynQuestions, setDynQuestions] = useState<DynQ[]>([]);
  const [answers, setAnswers]       = useState<string[]>([]);
  const [activeTab, setActiveTab]   = useState<string>("admissions");
  const [exportDone, setExportDone] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [sessions, setSessions]     = useState<CollectorSession[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const router  = useRouter();
  const [newSessionName, setNewSessionName] = useState("");
  const [showNewSessionInput, setShowNewSessionInput] = useState(false);


  const clientFlagCount = CLIENT_MEDIA_FLAGS.filter(f => f.flag !== "ignored").length;
  const legacyFiles = files.map(f => ({ name: f.name, size: f.size, type: f.kind }));


  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const border = isDark ? "border-white/10" : "border-zinc-200";
  const cardBg = isDark ? "bg-zinc-900/50 backdrop-blur-xl" : "bg-white shadow-lg";
  const card = `rounded-[2rem] border ${border} ${cardBg}`;

  async function startThinking() {
    setPhase("thinking");
    await new Promise(r => setTimeout(r, 1200));
    const qs = generateSqueezerQuestions(files.length, files.map(f => f.name));
    setDynQuestions(qs);
    setAnswers(Array(qs.length).fill(""));
    setPhase("questions");
  }

  async function startSqueezing() {
    setPhase("squeezing");
    await new Promise(r => setTimeout(r, 4000));
    setPhase("result");
  }

  function reset() {
    setFiles([]); setMediaItems([]); setContext("");
    setPhase("input"); setDynQuestions([]); setAnswers([]);
    setExportDone(false); setShowExportPopup(false);
  }

  function buildReportMarkdown() {
    return [
      `# ملف مرجعي — عصارة مرفقات (${files.length} ملف)`,
      `الطرف: ${answers[0]||"—"} | المنتج: ${answers[1]||"—"} | التركيز: ${answers[2]||"—"}`,
      ``, `## فهرس المرفقات`, ...files.map((f,i) => `- مرفق_${String(i+1).padStart(2,"0")}: ${f.name} (${f.size})`),
      ``, `## إقرارات واعترافات الخصم`,
      `- إقرار باستلام الدفعة — (مرفق_02، ص1) | **أهمية:** يثبت العلاقة المالية`,
      `- علاقة تعاقدية غير موثقة — (مرفق_01، ص3) | **أهمية:** يضعف موقف الخصم`,
      ``, `## تناقضات الخصم`,
      `- تعارض في التواريخ: سند التحويل يسبق العقد بـ 12 يوم`,
      `- غياب توكيل الموقّع من الطرف الثاني`,
      ``, `## الوقائع الجوهرية التي تخدمنا`,
      `- شرط جزائي مبهم — قابل للطعن (مرفق_01، ص5)`,
      ``, `## نقاط الخطر والضعف في موقفنا`,
      `- غياب توثيق رسمي للعلاقة التعاقدية`,
    ].join("\n");
  }

  async function openExportPopup() {
    setSessions(await getActiveSessions());
    setShowExportPopup(true);
  }

  async function doExport(target: "desktop" | string) {
    const md = buildReportMarkdown();
    const title = `ملف مرجعي — ${files.map(f=>f.name).join(" · ").slice(0, 50)}`;
    if (target === "desktop") {
      await addToDesktop("attachment-squeezer", "case", title, md);
    } else {
      await addToSession(target, "attachment-squeezer", "case", title, md);
    }
    setExportDone(true);
    setShowExportPopup(false);
    setShowNewSessionInput(false);
    setNewSessionName("");
  }

  async function handleCreateAndExport() {
    const s = await createSession(newSessionName.trim() || undefined);
    await doExport(s.id);
  }

  const canProceed = answers.length > 0 && answers.every(a => a.trim().length > 0);

  // ── THINKING ─────────────────────────────────────────────────────────────────
  if (phase === "thinking") return (
    <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-8 ${card}`}>
      <p className={`text-[13px] font-black mb-6 flex items-center gap-2 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
        <Sparkle size={18} weight="fill" className="animate-pulse" />
        AI يقرأ المرفقات بسرعة ويجهّز أسئلة تحديد التركيز...
      </p>
      <ThinkingSkeleton isDark={isDark} />
    </motion.div>
  );

  // ── QUESTIONS ─────────────────────────────────────────────────────────────────
  if (phase === "questions") return (
    <motion.div key="questions" variants={stagger} initial="hidden" animate="show" className={`p-8 space-y-6 ${card}`}>
      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-2">
          <Question size={18} weight="duotone" className="text-[#C8A762]" />
          <p className="text-[11px] font-black uppercase tracking-widest text-[#C8A762]">قبل العصر — ٣ أسئلة سريعة</p>
        </div>
        <p className={`text-[14px] font-medium leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
          قرأت المرفقات. قبل البدء، أخبرني بهذه التفاصيل لأركز على ما يخدمك:
        </p>
      </motion.div>

      <div className="space-y-4">
        {dynQuestions.map((item, i) => (
          <motion.div key={i} variants={fadeUp} className="space-y-3">
            <label className={`flex items-start gap-3 text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
              <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5 ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-zinc-500"}`}>{i + 1}</span>
              {item.q}
            </label>
            <input
              value={answers[i] ?? ""}
              onChange={e => setAnswers(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
              placeholder={item.placeholder}
              className={`w-full rounded-[1rem] border px-5 py-3.5 text-[14px] outline-none transition-all focus:ring-2 focus:ring-[#0B3D2E]/25 focus:border-[#0B3D2E]/40 ${isDark ? "border-white/10 bg-zinc-900/50 text-white placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`}
            />
          </motion.div>
        ))}
      </div>

      <motion.div variants={fadeUp} className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-white/10">
        <button onClick={() => setPhase("input")} className={`flex items-center gap-2 text-[13px] font-bold px-5 py-2.5 rounded-xl border transition-colors ${isDark ? "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"}`}>
          <ArrowRight size={14} weight="bold" /> رجوع
        </button>
        <motion.button
          whileTap={canProceed ? { scale: 0.97 } : {}}
          onClick={() => canProceed && startSqueezing()}
          disabled={!canProceed}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-bold transition-all shadow-md ${canProceed ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328]" : isDark ? "bg-white/5 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed shadow-none"}`}
        >
          <MagnifyingGlass size={16} weight="bold" />
          ابدأ العصر الكامل
        </motion.button>
      </motion.div>
    </motion.div>
  );

  // ── SQUEEZING ─────────────────────────────────────────────────────────────────
  if (phase === "squeezing") return (
    <motion.div key="squeezing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex flex-col items-center justify-center py-20 ${card}`}>
      <div className="relative mb-10">
        <div className={`absolute inset-0 rounded-full blur-3xl opacity-30 bg-[#C8A762]`} />
        <div className={`relative h-28 w-28 rounded-[2rem] flex items-center justify-center ${isDark ? "bg-zinc-900/80 border border-white/10 backdrop-blur-md" : "bg-white border border-zinc-200 shadow-2xl"}`}>
          <MagnifyingGlass size={56} className="text-[#C8A762] animate-pulse" weight="duotone" />
        </div>
      </div>
      <h2 className={`text-2xl font-black mb-3 tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>جاري عصر المرفقات...</h2>
      <p className={`text-[14px] mb-10 font-medium ${ts}`}>AI يقرأ كل صفحة، يفرز الأصوات، ويبني الملف المرجعي</p>
      <div className="w-full max-w-md space-y-4 px-6">
        {["إعادة تسمية المرفقات وبناء الفهرس...", "استخراج الوقائع وإقرارات الخصم...", "بناء التسلسل الزمني ورصد التناقضات..."].map((step, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 1.2 }} className={`flex items-center gap-4 p-4 rounded-2xl border ${isDark ? "border-white/10 bg-zinc-800/50" : "border-zinc-200 bg-zinc-50 shadow-sm"}`}>
            <div className="h-6 w-6 rounded-full border-2 border-[#C8A762] border-t-transparent animate-spin flex-shrink-0" />
            <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{step}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  // ── RESULT ────────────────────────────────────────────────────────────────────
  if (phase === "result") return (
    <motion.div key="result" variants={stagger} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "صفحات ممسوحة", val: String(files.length * 18 + 12), icon: FileText, color: "text-blue-500" },
          { label: "وقائع مستخرجة", val: "14", icon: Sparkle, color: "text-emerald-500" },
          { label: "تواريخ حرجة", val: "8", icon: Clock, color: "text-amber-500" },
          { label: "ثغرات مكتشفة", val: "3", icon: Warning, color: "text-red-500" },
        ].map((m, i) => (
          <div key={i} className={`p-5 rounded-[1.5rem] border flex flex-col items-center justify-center gap-3 shadow-sm ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-sm" : "border-zinc-200 bg-white"}`}>
            <m.icon size={28} weight="duotone" className={m.color} />
            <p className={`text-3xl font-black tabular-nums ${isDark ? "text-white" : "text-zinc-900"}`}>{m.val}</p>
            <p className={`text-[12px] font-bold uppercase tracking-wider ${ts}`}>{m.label}</p>
          </div>
        ))}
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div variants={fadeUp} className={`${card} overflow-hidden shadow-xl`}>
        <div className={`flex items-center overflow-x-auto border-b px-1 ${isDark ? "border-white/10 bg-zinc-800/20" : "border-zinc-200 bg-zinc-50/50"}`}>
          {[
            { id: "admissions", label: "إقرارات الخصم", icon: ChatCircleDots, badge: 0 },
            { id: "contradictions", label: "تناقضاته", icon: Warning, badge: 0 },
            { id: "facts", label: "وقائع تخدمنا", icon: Sparkle, badge: 0 },
            { id: "timeline", label: "الخط الزمني", icon: CalendarCheck, badge: 0 },
            { id: "weaknesses", label: "نقاط الضعف", icon: ShieldWarning, badge: 0 },
            { id: "laws", label: "نصوص نظامية", icon: Scales, badge: 0 },
            { id: "client-media", label: "إشارات العميل", icon: Microphone, badge: clientFlagCount },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-3.5 text-[12px] font-bold border-b-[3px] transition-all ${activeTab === t.id ? `border-[#C8A762] ${isDark ? "text-[#C8A762]" : "text-amber-700"} bg-amber-500/5` : `border-transparent ${ts} hover:bg-black/5`}`}>
              <t.icon size={14} weight={activeTab === t.id ? "fill" : "regular"} /> {t.label}
              {t.badge > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black
                  ${isDark ? "bg-red-500 text-white" : "bg-red-500 text-white"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-5">
          {activeTab === "admissions" && <div className="space-y-3">
            {[
              { title: "إقرار باستلام الدفعة", quote: "أقر الطرف الثاني باستلام الدفعة الأولى بتاريخ 12 مارس.", ref: "مرفق_02، ص1", why: "يثبت العلاقة المالية بين الطرفين" },
              { title: "علاقة تعاقدية بلا توثيق", quote: "تم هذا الاتفاق دون تحرير عقد مكتوب، اكتفاء بالثقة المتبادلة.", ref: "مرفق_01، ص3", why: "يضعف موقف الخصم — يحتج عليه بإقراره" },
            ].map((f, i) => (
              <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-white/10 bg-zinc-800/30" : "border-zinc-200 bg-white"}`}>
                <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{f.title}</p>
                <p className={`text-[12px] italic border-r-2 border-[#C8A762]/40 pr-3 my-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>"{f.quote}"</p>
                <p className={`text-[11px] mb-2 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>⚡ أهمية للصياغة: {f.why}</p>
                <span className={`inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-lg border ${isDark ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/10" : "border-emerald-200 text-emerald-700 bg-emerald-50"}`}>
                  <CheckCircle size={10} className="me-1" /> {f.ref}
                </span>
              </div>
            ))}
          </div>}
          {activeTab === "contradictions" && <div className="space-y-3">
            {[
              { title: "تناقض في توجيه المطالبة", q1: "مطالبة المدعى عليه بصفته شريكاً (مرفق_01)", q2: "ثم يطلب السداد من أي شخص بغض النظر عن صفته (مرفق_02)", why: "يُظهر تخبط المدعي وانعدام أساس دعواه" },
              { title: "تعارض في التواريخ", q1: "سند التحويل بتاريخ 3 يناير", q2: "العقد موقع بتاريخ 15 يناير — أي بعد 12 يوم", why: "يضعف ادعاء أن التحويل كان دفعة تعاقدية" },
            ].map((c, i) => (
              <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-red-500/15 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-start gap-2 mb-2"><Warning size={16} className="text-red-500 mt-0.5" weight="fill" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-800"}`}>{c.title}</p></div>
                <div className={`text-[12px] space-y-1 mb-2 ${isDark ? "text-red-300/80" : "text-red-700/80"}`}>
                  <p>• القول الأول: {c.q1}</p><p>• القول المناقض: {c.q2}</p></div>
                <p className={`text-[11px] ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>⚡ {c.why}</p>
              </div>
            ))}
          </div>}
          {activeTab === "facts" && <div className="space-y-3">
            {[
              { title: "شرط جزائي مبهم وقابل للطعن", desc: "المادة 4 تتضمن شرطاً جزائياً مفتوحاً وغير محدد بسقف.", ref: "مرفق_01، ص5" },
              { title: "تأكيد دور الوسيط من المحادثات", desc: "المدعي كان يأمر بإحضار المبالغ من الطرف الثالث، مما يدمر زعمه بالشراكة.", ref: "مرفق_08، ص6" },
            ].map((f, i) => (
              <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-emerald-500/15 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50"}`}>
                <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>{f.title}</p>
                <p className={`text-[12px] mb-2 ${isDark ? "text-emerald-400/70" : "text-emerald-700/80"}`}>{f.desc}</p>
                <span className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>📎 {f.ref}</span>
              </div>
            ))}
          </div>}
          {activeTab === "timeline" && <div className="relative border-r-2 border-[#C8A762]/30 pr-5 space-y-6 my-3 mr-2">
            {[
              { date: "15 يناير 2024", text: "توقيع العقد المبدئي", doc: "مرفق_01، ص1" },
              { date: "12 مارس 2024", text: "تحويل الدفعة الأولى (150,000 ريال)", doc: "مرفق_03" },
              { date: "05 مايو 2024", text: "توقف الطرف الثاني وإرسال إيميل اعتذار", doc: "مرفق_04" },
            ].map((t, i) => (
              <div key={i} className="relative">
                <div className="absolute -right-[28px] top-1 h-3 w-3 rounded-full bg-[#C8A762] border-4 border-white dark:border-zinc-900" />
                <p className={`text-[11px] font-black tracking-widest mb-1 ${isDark ? "text-amber-500" : "text-amber-700"}`}>{t.date}</p>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{t.text}</p>
                <p className={`text-[11px] mt-0.5 ${ts}`}>{t.doc}</p>
              </div>
            ))}
          </div>}
          {activeTab === "weaknesses" && <div className="space-y-3">
            {[
              { title: "غياب توثيق رسمي للعلاقة", desc: "لا يوجد عقد رسمي موثق في أي منصة حكومية — قد يُستخدم ضدنا." },
              { title: "غياب توكيل الموقّع", desc: "الموقّع على العقد من الطرف الثاني ليس المدير — لا يوجد مرفق يثبت وكالته." },
            ].map((w, i) => (
              <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border ${isDark ? "border-orange-500/15 bg-orange-500/5" : "border-orange-200 bg-orange-50"}`}>
                <ShieldWarning size={18} className="text-orange-500 mt-0.5 flex-shrink-0" weight="duotone" />
                <div>
                  <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-orange-400" : "text-orange-800"}`}>{w.title}</p>
                  <p className={`text-[12px] ${isDark ? "text-orange-300/70" : "text-orange-700/80"}`}>{w.desc}</p>
                </div>
              </div>
            ))}
          </div>}
          {activeTab === "laws" && <div className="space-y-3">
            {[
              { text: "لا يجوز الإثبات بشهادة الشهود فيما يخالف أو يجاوز ما اشتمل عليه دليل كتابي", src: "م.67 فقرة 3 — نظام الإثبات", helps: true },
              { text: "لا تقبل شهادة الشهود في إثبات وجود أو انقضاء التصرفات", src: "م.66 فقرة 2 — نظام الإثبات", helps: true },
            ].map((l, i) => (
              <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-indigo-500/15 bg-indigo-500/5" : "border-indigo-200 bg-indigo-50"}`}>
                <p className={`text-[12px] italic leading-relaxed mb-2 ${isDark ? "text-indigo-300" : "text-indigo-800"}`}>"{l.text}"</p>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${isDark ? "text-indigo-400/80" : "text-indigo-600"}`}>
                    {l.src}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${l.helps ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700" : isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"}`}>
                    {l.helps ? "يخدمنا" : "يضرنا"}
                  </span>
                </div>
              </div>
            ))}
          </div>}
          {activeTab === "client-media" && <ClientMediaResultTab isDark={isDark} />}
        </div>
      </motion.div>

      {/* ── Export Bar ── */}
      <motion.div variants={fadeUp} className="flex gap-3 justify-end pt-3">
        <button onClick={reset} className={`px-5 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${isDark ? "border-white/10 text-zinc-400 hover:text-white" : "border-zinc-200 text-zinc-500 hover:text-zinc-900"}`}>
          عصر جديد
        </button>
        {exportDone ? (
          <Link href="/ai/collector" className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-black border shadow-lg ${isDark ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            <CheckCircle size={16} weight="fill" /> تم الإضافة — افتح المجمع <ArrowRight size={14} />
          </Link>
        ) : (
          <motion.button whileTap={{ scale: 0.97 }} onClick={openExportPopup}
            className="flex items-center gap-2 bg-[#0B3D2E] text-white font-black px-6 py-2.5 rounded-xl text-[13px] hover:bg-[#0a3328] shadow-lg">
            <Tray size={16} weight="fill" /> أضف للمجمع القانوني <ArrowRight size={14} />
          </motion.button>
        )}
      </motion.div>

      {/* ── Export Popup ── */}
      <AnimatePresence>
        {showExportPopup && (<>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowExportPopup(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed z-50 inset-x-4 top-1/3 max-w-sm mx-auto ${card} p-5 space-y-4 shadow-2xl`} dir="rtl">
            <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>أين تريد إضافة الملف المرجعي؟</p>
            <button onClick={() => doExport("desktop")}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition-all ${isDark ? "border-white/10 hover:bg-white/5" : "border-zinc-200 hover:bg-zinc-50"}`}>
              <Monitor size={18} className="text-purple-500" weight="duotone" />
              <div><p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>الديسك توب</p>
                <p className={`text-[11px] ${ts}`}>مساحة عامة مشتركة</p></div>
            </button>
            {sessions.length > 0 && <>
              <p className={`text-[11px] font-bold ${ts}`}>أو اختر جلسة:</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {sessions.map(s => (
                  <button key={s.id} onClick={() => doExport(s.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition-all ${isDark ? "border-white/10 hover:bg-white/5" : "border-zinc-200 hover:bg-zinc-50"}`}>
                    <FolderOpen size={16} className="text-blue-500" weight="duotone" />
                    <div><p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{s.name}</p>
                      <p className={`text-[10px] ${ts}`}>{new Date(s.createdAt).toLocaleDateString("ar-SA")}</p></div>
                  </button>
                ))}
              </div>
            </>
            }
            {/* ── إنشاء جلسة جديدة ── */}
            {!showNewSessionInput ? (
              <button onClick={() => setShowNewSessionInput(true)}
                className={`w-full flex items-center gap-2 p-3 rounded-xl border border-dashed text-start transition-all text-[12px] font-bold
                  ${isDark ? "border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20" : "border-zinc-300 text-zinc-400 hover:text-zinc-700 hover:border-zinc-400"}`}>
                <Plus size={13} weight="bold" /> إنشاء جلسة جديدة وحفظ فيها
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCreateAndExport()}
                  placeholder="اسم الجلسة (اختياري)"
                  autoFocus
                  className={`flex-1 rounded-xl border px-3 py-2 text-[12px] outline-none
                    ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600"
                             : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
                <button onClick={handleCreateAndExport}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-[12px] font-bold text-white">
                  إنشاء
                </button>
                <button onClick={() => { setShowNewSessionInput(false); setNewSessionName(""); }}
                  className={`px-3 py-2 rounded-xl border text-[12px] ${isDark ? "border-white/[0.08] text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
                  <X size={12} />
                </button>
              </div>
            )}
            <button onClick={() => setShowExportPopup(false)} className={`w-full text-center text-[12px] font-bold py-2 ${ts}`}>إلغاء</button>
          </motion.div>
        </>)}
      </AnimatePresence>
    </motion.div>
  );

  // ── INPUT ─────────────────────────────────────────────────────────────────────
  return (
    <motion.div key="input" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={sp} className={`p-6 md:p-8 ${card}`}>
      <InputPhase
        isDark={isDark}
        files={files}
        mediaItems={mediaItems}
        context={context}
        onFiles={setFiles}
        onAddMedia={item => setMediaItems(p => [...p, item])}
        onRemoveMedia={id  => setMediaItems(p => p.filter(m => m.id !== id))}
        onContext={setContext}
        onSubmit={startThinking}
      />
    </motion.div>
  );
}
