"use client";
// ─── Cross-Examination Result View ───────────────────────────────────────────
// Shows 3 tiers of questions: Foundational → Trap → Closure
// Plus: Key admissions to extract + danger signals for us

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Target, Warning, CheckCircle, Sword,
  ArrowRight, Tray, FolderOpen, Monitor,
  DownloadSimple, LockSimple, UserFocus,
} from "@phosphor-icons/react";
import Link from "next/link";
import { addToDesktop, addToSession, getActiveSessions } from "@/lib/draftInboxStore";
import type { CollectorSession } from "@/lib/draftInboxStore";

interface Props {
  isDark: boolean;
  card: string;
  onReset: () => void;
}

type TabId = "foundation" | "trap" | "closure" | "admissions" | "risks";

// ─── Mock Data (to be replaced by real AI output) ────────────────────────────
const FOUNDATION_QUESTIONS = [
  {
    q: "متى تعرّفت على الطرف المدّعي لأول مرة؟ وما طبيعة علاقتك به قبل هذه القضية؟",
    purpose: "تأسيس العلاقة بالخصم — الكشف عن التحيز المحتمل",
    expected: "سيذكر صداقة أو علاقة عمل — نستخدمها لاحقاً في سؤال الفخ",
  },
  {
    q: "أين كنت بالضبط يوم [تاريخ الحادثة]، ومن كان معك؟",
    purpose: "تأسيس رواية الحضور — اختبار قابلية التحقق",
    expected: "يحدد مكاناً — نتحقق إذا كانت روايته ممكنة عملياً",
  },
  {
    q: "كيف علمت بتفاصيل هذا الاتفاق الذي تتحدث عنه؟ هل أخبرك أحد بها أم شهدتها بنفسك؟",
    purpose: "تمييز الشهادة المباشرة من المسموعة — إسقاط الشهادة غير المباشرة",
    expected: "سيكشف أن علمه جاء عبر طرف ثالث → شهادة غير مقبولة شرعاً",
  },
];

const TRAP_QUESTIONS = [
  {
    q: "ذكرت الآن أنك حضرت الاجتماع في مكتب المدعي — لكن في محضر الشرطة بتاريخ X قلت إنك لم تكن موجوداً. كيف تُفسّر هذا التعارض؟",
    type: "تناقض مع أقوال سابقة",
    severity: "critical" as const,
  },
  {
    q: "قلت إنك لم تتقاضَ أي مقابل لحضورك كشاهد — هل تعلم أن القانون يُجرّم الشهادة مقابل مقابل مالي؟",
    type: "تلميح بالمصلحة الشخصية",
    severity: "high" as const,
  },
  {
    q: "كيف تعرّفت على تفاصيل العقد رغم أنك لم توقعه ولم تكن طرفاً فيه؟ من أطلعك عليه تحديداً؟",
    type: "مصدر المعلومة — شبهة التحيز",
    severity: "medium" as const,
  },
];

const CLOSURE_QUESTIONS = [
  {
    q: "إذن ما تقوله هو أنك لم تشهد الحادثة بنفسك — كل ما عندك هو ما أخبرك به الطرف المدّعي؟",
    purpose: "إغلاق مسار الشهادة المباشرة — إجباره على الاعتراف بالمصدر",
  },
  {
    q: "بناءً على ما ذكرته، لا يمكنك تأكيد أن هذا المبلغ كان دفعةً تعاقدية وليس سلفةً شخصية — صح؟",
    purpose: "إغلاق الادعاء المالي — الحصول على إقرار بالغموض",
  },
];

const ADMISSIONS_TO_EXTRACT = [
  { text: "لم يكن حاضراً وقت الحادثة — علمه لاحق وغير مباشر", importance: "يُسقط قوة شهادته" },
  { text: "علاقته بالخصم قديمة وقائمة على المصلحة المشتركة", importance: "يثبت التحيز ويُضعف حياده" },
  { text: "لم يطّلع على العقد قبل التوقيع", importance: "يُفيد في دفع جهل بالشروط" },
];

export function CrossExamResultView({ isDark, card, onReset }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("foundation");
  const [exported, setExported] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [sessions, setSessions] = useState<CollectorSession[]>([]);

  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  function buildReport() {
    return [
      "# بطارية أسئلة الاستجواب — مُولّد الاستجواب",
      "",
      "## أسئلة تأسيسية",
      ...FOUNDATION_QUESTIONS.map((q, i) => `${i+1}. **${q.q}**\n   - الهدف: ${q.purpose}`),
      "",
      "## أسئلة الفخ",
      ...TRAP_QUESTIONS.map((q, i) => `${i+1}. **${q.q}**\n   - النوع: ${q.type}`),
      "",
      "## أسئلة الإغلاق",
      ...CLOSURE_QUESTIONS.map((q, i) => `${i+1}. **${q.q}**\n   - الهدف: ${q.purpose}`),
      "",
      "## الإقرارات المستهدفة",
      ...ADMISSIONS_TO_EXTRACT.map(a => `- ${a.text} ← ${a.importance}`),
    ].join("\n");
  }

  function openExport() {
    setSessions(getActiveSessions());
    setShowExportPopup(true);
  }

  function doExport(target: "desktop" | string) {
    const md = buildReport();
    const title = "بطارية أسئلة الاستجواب";
    if (target === "desktop") {
      addToDesktop("attachment-squeezer", "research", title, md);
    } else {
      addToSession(target, "attachment-squeezer", "research", title, md);
    }
    setExported(true);
    setShowExportPopup(false);
  }

  const tabs: { id: TabId; label: string; icon: React.ElementType; color: string; count: number }[] = [
    { id: "foundation", label: "أسئلة تأسيسية", icon: LockSimple, color: "text-blue-500", count: FOUNDATION_QUESTIONS.length },
    { id: "trap", label: "أسئلة الفخ", icon: Sword, color: "text-rose-500", count: TRAP_QUESTIONS.length },
    { id: "closure", label: "أسئلة الإغلاق", icon: CheckCircle, color: "text-emerald-500", count: CLOSURE_QUESTIONS.length },
    { id: "admissions", label: "إقرارات مستهدفة", icon: Target, color: "text-amber-500", count: ADMISSIONS_TO_EXTRACT.length },
    { id: "risks", label: "مخاطر علينا", icon: Warning, color: "text-orange-500", count: 2 },
  ];

  return (
    <div className="space-y-5">

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "أسئلة تأسيسية", val: String(FOUNDATION_QUESTIONS.length), color: "text-blue-500" },
          { label: "فخاخ مُحكمة", val: String(TRAP_QUESTIONS.length), color: "text-rose-500" },
          { label: "إقرارات مستهدفة", val: String(ADMISSIONS_TO_EXTRACT.length), color: "text-amber-500" },
          { label: "إجمالي الأسئلة", val: String(FOUNDATION_QUESTIONS.length + TRAP_QUESTIONS.length + CLOSURE_QUESTIONS.length), color: "text-emerald-500" },
        ].map((m, i) => (
          <div key={i} className={`${card} p-4 flex flex-col items-center gap-1.5`}>
            <p className={`text-2xl font-black tabular-nums ${m.color}`}>{m.val}</p>
            <p className={`text-[10px] font-bold text-center uppercase tracking-wide ${ts}`}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`${card} overflow-hidden`}>
        <div className={`flex overflow-x-auto border-b ${isDark ? "border-white/[0.07]" : "border-slate-200"}`}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-[11px] font-bold border-b-2 transition-all ${activeTab === t.id ? `border-current ${t.color}` : `border-transparent ${ts} hover:bg-black/5`}`}>
              <t.icon size={12} weight={activeTab === t.id ? "fill" : "regular"} className={activeTab === t.id ? t.color : ""} />
              {t.label}
              <span className={`rounded-full text-[9px] px-1.5 py-0.5 font-black ${activeTab === t.id ? "bg-current/10" : isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-zinc-400"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">

          {/* Foundation */}
          {activeTab === "foundation" && FOUNDATION_QUESTIONS.map((q, i) => (
            <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.07] bg-zinc-900/30" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start gap-2 mb-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                <p className={`text-[13px] font-bold leading-relaxed ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{q.q}</p>
              </div>
              <div className={`rounded-xl border p-3 space-y-1.5 ${isDark ? "border-blue-500/15 bg-blue-500/5" : "border-blue-100 bg-blue-50"}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider text-blue-500`}>الغرض من السؤال</p>
                <p className={`text-[11px] ${isDark ? "text-blue-300/80" : "text-blue-700"}`}>{q.purpose}</p>
                <p className={`text-[10px] font-black uppercase tracking-wider text-blue-500 mt-1`}>الرد المتوقع</p>
                <p className={`text-[11px] italic ${isDark ? "text-blue-400/70" : "text-blue-600/80"}`}>{q.expected}</p>
              </div>
            </div>
          ))}

          {/* Trap */}
          {activeTab === "trap" && TRAP_QUESTIONS.map((q, i) => (
            <div key={i} className={`p-4 rounded-2xl border ${q.severity === "critical" ? isDark ? "border-rose-500/20 bg-rose-500/5" : "border-rose-200 bg-rose-50" : isDark ? "border-orange-500/15 bg-orange-500/5" : "border-orange-100 bg-orange-50"}`}>
              <div className="flex items-start gap-2 mb-3">
                <Sword size={14} className={q.severity === "critical" ? "text-rose-500 mt-0.5 flex-shrink-0" : "text-orange-500 mt-0.5 flex-shrink-0"} weight="fill" />
                <p className={`text-[13px] font-bold leading-relaxed ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{q.q}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${q.severity === "critical" ? isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-100 text-rose-700" : isDark ? "bg-orange-500/10 text-orange-400" : "bg-orange-100 text-orange-700"}`}>
                  {q.type}
                </span>
                {q.severity === "critical" && (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${isDark ? "border-rose-500/30 text-rose-400" : "border-rose-300 text-rose-600"}`}>
                    🔴 حرج
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Closure */}
          {activeTab === "closure" && CLOSURE_QUESTIONS.map((q, i) => (
            <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-emerald-500/15 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-start gap-2 mb-2">
                <CheckCircle size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" weight="fill" />
                <p className={`text-[13px] font-bold leading-relaxed ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{q.q}</p>
              </div>
              <p className={`text-[11px] ms-5 ${isDark ? "text-emerald-400/80" : "text-emerald-700"}`}>↳ {q.purpose}</p>
            </div>
          ))}

          {/* Admissions */}
          {activeTab === "admissions" && ADMISSIONS_TO_EXTRACT.map((a, i) => (
            <div key={i} className={`p-4 rounded-2xl border ${isDark ? "border-amber-500/15 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start gap-2 mb-2">
                <Target size={14} className="text-amber-500 mt-0.5 flex-shrink-0" weight="fill" />
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{a.text}</p>
              </div>
              <p className={`text-[11px] ms-5 font-bold ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>⚡ {a.importance}</p>
            </div>
          ))}

          {/* Risks */}
          {activeTab === "risks" && [
            { title: "الشاهد قد يلجأ للغموض وعدم التذكر", desc: "الرد: اطلب تحديد السبب — 'هل نسيت أم لا تعلم؟' — الفرق جوهري قانونياً", level: "medium" },
            { title: "قد يدّعي وجود شهود آخرين لم يُذكروا", desc: "الرد: اطلب أسماءهم فوراً في الجلسة — والتزام القاضي بتسجيل الطلب", level: "low" },
          ].map((r, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border ${isDark ? "border-orange-500/15 bg-orange-500/5" : "border-orange-100 bg-orange-50"}`}>
              <Warning size={16} className="text-orange-500 mt-0.5 flex-shrink-0" weight="duotone" />
              <div>
                <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-orange-400" : "text-orange-800"}`}>{r.title}</p>
                <p className={`text-[11px] ${isDark ? "text-orange-300/70" : "text-orange-700/80"}`}>{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={onReset} className={`px-5 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-zinc-400 hover:text-zinc-700"}`}>
          استجواب جديد
        </button>
        <div className="flex gap-2">
          <button className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-zinc-500 hover:text-zinc-800"}`}>
            <DownloadSimple size={14} /> تصدير PDF
          </button>
          {exported ? (
            <Link href="/ai/collector" className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-black border ${isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              <CheckCircle size={14} weight="fill" /> تم — افتح المجمع <ArrowRight size={12} />
            </Link>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }} onClick={openExport}
              className="flex items-center gap-2 bg-rose-600 text-white font-black px-5 py-2.5 rounded-xl text-[12px] hover:bg-rose-700 shadow-lg shadow-rose-500/20">
              <Tray size={14} weight="fill" /> أضف للمجمع <ArrowRight size={12} />
            </motion.button>
          )}
        </div>
      </div>

      {/* Export Popup */}
      {showExportPopup && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowExportPopup(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className={`fixed z-50 inset-x-4 top-1/3 max-w-sm mx-auto ${card} p-5 space-y-4 shadow-2xl`} dir="rtl">
            <div className="flex items-center gap-2">
              <UserFocus size={16} className="text-rose-500" weight="duotone" />
              <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>أين تريد حفظ بطارية الأسئلة؟</p>
            </div>
            <button onClick={() => doExport("desktop")}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start ${isDark ? "border-white/[0.07] hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"}`}>
              <Monitor size={16} className="text-purple-500" weight="duotone" />
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>الديسك توب</p>
                <p className={`text-[10px] ${ts}`}>متاح من كل القضايا</p>
              </div>
            </button>
            {sessions.length > 0 && (
              <div className="space-y-2">
                <p className={`text-[10px] font-bold ${ts}`}>أو اختر جلسة:</p>
                {sessions.map(s => (
                  <button key={s.id} onClick={() => doExport(s.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start ${isDark ? "border-white/[0.07] hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"}`}>
                    <FolderOpen size={14} className="text-blue-500" weight="duotone" />
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{s.name}</p>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowExportPopup(false)} className={`w-full text-center text-[11px] py-2 ${ts}`}>إلغاء</button>
          </motion.div>
        </>
      )}
    </div>
  );
}
