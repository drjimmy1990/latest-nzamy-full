"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LockKey, Buildings, User, Phone, CheckCircle,
  ChatCircleDots, ShieldCheck, DownloadSimple,
  Eye, EyeSlash, CaretDown, Sparkle, Clock,
  Warning, Info, Paperclip, Check,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { sanitizeRichHtml } from "@/utils/sanitize";

// ─── Types ─────────────────────────────────────────────────────────────────────

type VisibilityMode = "none" | "department";

interface ReviewerInfo {
  name: string;
  title: string;
  department: string;
  whatsapp: string;
}

interface Annotation {
  id: number;
  reviewerName: string;
  reviewerTitle: string;
  department: string;
  departmentColor: string;
  text: string;
  time: string;
  status: "note" | "approved" | "concern";
}

// ─── Mock data (will come from API based on token) ─────────────────────────────

const MOCK_DOCUMENT = {
  title: "عقد خدمات استشارية (شركة المستقبل التقني)",
  sentBy: "أ. فهد العتيبي — مكتب الشمري للمحاماة",
  contractValue: "٢,٤٠٠,٠٠٠ ريال",
  deadline: "٢٠ مارس ٢٠٢٥",
  visibilityMode: "none" as VisibilityMode, // controlled by document owner
  body: `
<h2 class="text-center text-lg font-bold mb-6">عقد تقديم خدمات استشارية</h2>

<p class="mb-4">إنه في يوم الأربعاء الموافق ١٢/٠٨/١٤٤٦هـ، تم الاتفاق بين كل من:</p>

<p class="mb-4"><strong>الطرف الأول (الشركة المستفيدة):</strong> شركة المستقبل التقني، سجل تجاري رقم (١٠١٠٢٣٤٥٦٧)، يمثلها السيد/ خالد المنصور بصفته المدير العام، والمشار إليه فيما بعد بـ"الشركة".</p>

<p class="mb-6"><strong>الطرف الثاني (مقدم الخدمة):</strong> شركة حلول التحول الرقمي، سجل تجاري رقم (٢٠٥٠٩٨٧٦٥٤)، يمثلها السيد/ طارق الغامدي بصفته الرئيس التنفيذي، والمشار إليه فيما بعد بـ"مقدم الخدمة".</p>

<h3 class="font-bold text-base mt-6 mb-3 pb-2 border-b">البند الأول: موضوع العقد</h3>
<p class="mb-4 leading-loose">يتعهد مقدم الخدمة بتقديم خدمات استشارية متخصصة في مجال التحول الرقمي وتطوير البنية التحتية لتقنية المعلومات للشركة، وذلك وفق الأهداف والمخرجات المحددة في الملحق رقم (١) المرفق بهذا العقد والمعتبر جزءاً لا يتجزأ منه.</p>

<h3 class="font-bold text-base mt-6 mb-3 pb-2 border-b">البند الثاني: مدة العقد والقيمة المالية</h3>
<p class="mb-4 leading-loose">تبدأ مدة هذا العقد من تاريخ توقيعه وتنتهي بعد اثني عشر (١٢) شهراً قابلة للتجديد بموافقة طرفين. وتبلغ القيمة الإجمالية للعقد مبلغ <strong>(٢,٤٠٠,٠٠٠) ريال سعودي</strong> يُصرف وفقاً لجدول الأداء الفصلي المُرفق.</p>

<h3 class="font-bold text-base mt-6 mb-3 pb-2 border-b">البند الثالث: التزامات الأطراف</h3>
<p class="mb-3 leading-loose">يلتزم مقدم الخدمة بما يلي:</p>
<ul class="list-disc list-inside space-y-2 mb-4 text-[13px]">
  <li>تشكيل فريق متخصص لا يقل عن خمسة (٥) استشاريين معتمدين.</li>
  <li>تقديم تقارير أداء شهرية للشركة.</li>
  <li>الالتزام بالسرية التامة لجميع البيانات والمعلومات.</li>
  <li>عدم التعاقد مع منافسين مباشرين للشركة خلال فترة العقد.</li>
</ul>

<h3 class="font-bold text-base mt-6 mb-3 pb-2 border-b">البند الرابع: بنود السرية وعدم المنافسة</h3>
<p class="mb-4 leading-loose">يلتزم الطرفان بالمحافظة على سرية جميع المعلومات والبيانات التي يطلعان عليها خلال تنفيذ هذا العقد لمدة ثلاث (٣) سنوات بعد انتهائه. ويحظر على مقدم الخدمة العمل لدى أي منافس مباشر للشركة خلال سنة (١) من تاريخ انتهاء العقد.</p>

<h3 class="font-bold text-base mt-6 mb-3 pb-2 border-b">البند الخامس: حل النزاعات</h3>
<p class="mb-4 leading-loose">في حال نشوء أي خلاف بين الطرفين، يُسوّى أولاً بالتراضي خلال (١٥) يوم عمل. فإن تعذّر ذلك، يُحال النزاع إلى التحكيم التجاري وفق أنظمة هيئة التحكيم التجاري السعودية.</p>

<div class="mt-16 pt-6 border-t border-dashed flex gap-16">
  <div class="flex-1 text-center">
    <p class="font-bold mb-12">الطرف الأول<br/><span class="text-[12px] font-normal">شركة المستقبل التقني</span></p>
    <span class="text-zinc-400 text-[11px]">(بانتظار الاعتماد)</span>
  </div>
  <div class="flex-1 text-center">
    <p class="font-bold mb-12">الطرف الثاني<br/><span class="text-[12px] font-normal">حلول التحول الرقمي</span></p>
    <span class="text-zinc-400 text-[11px]">(بانتظار الاعتماد)</span>
  </div>
</div>
  `,
};

const DEPT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "التشغيل":      { bg: "bg-blue-500/10",   text: "text-blue-500",   border: "border-blue-500/30",   dot: "bg-blue-500" },
  "التسويق":      { bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/30", dot: "bg-purple-500" },
  "المالية":      { bg: "bg-emerald-500/10",text: "text-emerald-500",border: "border-emerald-500/30",dot: "bg-emerald-500" },
  "الموارد البشرية": { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/30", dot: "bg-orange-500" },
  "القانونية":    { bg: "bg-red-500/10",    text: "text-red-500",    border: "border-red-500/30",    dot: "bg-red-500" },
  "تقنية المعلومات": { bg: "bg-cyan-500/10",  text: "text-cyan-500",  border: "border-cyan-500/30",  dot: "bg-cyan-500" },
};

const MOCK_ANNOTATIONS: Annotation[] = [
  {
    id: 1, reviewerName: "أ. محمد الحربي", reviewerTitle: "مدير التشغيل", department: "التشغيل",
    departmentColor: "blue", text: "البند الثالث — يرجى زيادة عدد الاستشاريين إلى ٧ بدلاً من ٥ نظراً لحجم المشروع وتعقيده.",
    time: "منذ ٢ ساعة", status: "note",
  },
  {
    id: 2, reviewerName: "ريم العتيبي", reviewerTitle: "مديرة التسويق", department: "التسويق",
    departmentColor: "purple", text: "البند الرابع — فترة عدم المنافسة (سنة كاملة) مقبولة، لكن يُفضل تحديد نطاق جغرافي واضح للمملكة فقط.",
    time: "منذ ٤ ساعات", status: "note",
  },
];

const DEPARTMENTS = Object.keys(DEPT_COLORS);

// ─── Components ────────────────────────────────────────────────────────────────

function GovBadge({ value, isDark }: { value: string; isDark: boolean }) {
  const isHigh = value.includes("٢") || value.includes("3") || value.includes("4");
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${
      isHigh
        ? "bg-red-500/10 border-red-500/30 text-red-500"
        : "bg-amber-500/10 border-amber-500/30 text-amber-500"
    }`}>
      {isHigh ? <Warning size={12} weight="fill" /> : <Info size={12} />}
      {isHigh ? "يتطلب موافقة CEO" : "يتطلب موافقة CFO"}
      · قيمة {value}
    </div>
  );
}

function AnnotationCard({ ann, isDark }: { ann: Annotation; isDark: boolean }) {
  const colors = DEPT_COLORS[ann.department] ?? DEPT_COLORS["التشغيل"];
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      className={`relative rounded-2xl border p-4 ${colors.bg} ${colors.border}`}
    >
      {/* Connector dot */}
      <div className={`absolute -start-2 top-5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-950 ${colors.dot}`} />

      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
            {ann.department}
          </span>
        </div>
        <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{ann.time}</span>
      </div>
      <p className={`text-[12px] leading-relaxed mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{ann.text}</p>
      <p className={`text-[10px] font-medium ${colors.text}`}>{ann.reviewerName} — {ann.reviewerTitle}</p>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Screen = "auth" | "identity" | "review" | "success";

export default function CorporateReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { isDark } = useTheme();

  const [screen, setScreen] = useState<Screen>("auth");
  const [passcode, setPasscode] = useState("");
  const [pcError, setPcError] = useState("");
  const [reviewer, setReviewer] = useState<ReviewerInfo>({ name: "", title: "", department: "", whatsapp: "" });
  const [noteText, setNoteText] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>(MOCK_ANNOTATIONS);
  const [activeTab, setActiveTab] = useState<"read" | "annotate">("read");
  const [submitted, setSubmitted] = useState<"approved" | "noted" | null>(null);
  const [showOtherDepts, setShowOtherDepts] = useState(MOCK_DOCUMENT.visibilityMode !== "none");

  const doc = MOCK_DOCUMENT;
  const card = isDark
    ? "rounded-2xl border border-white/[0.07] bg-zinc-900"
    : "rounded-2xl border border-zinc-200/70 bg-white";
  const reviewerDeptColors = DEPT_COLORS[reviewer.department] ?? DEPT_COLORS["التشغيل"];

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (passcode === "123456" || passcode.length === 6) {
      setPcError("");
      setScreen("identity");
    } else {
      setPcError("الرمز غير صحيح. تأكد من الرمز المرسل إليك.");
    }
  }

  function handleIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewer.name || !reviewer.title || !reviewer.department) return;
    setScreen("review");
  }

  function handleSubmitNote() {
    if (!noteText.trim()) return;
    const newAnn: Annotation = {
      id: Date.now(), reviewerName: reviewer.name, reviewerTitle: reviewer.title,
      department: reviewer.department, departmentColor: "blue",
      text: noteText, time: "الآن", status: "note",
    };
    setAnnotations(prev => [...prev, newAnn]);
    setNoteText("");
    setSubmitted("noted");
  }

  function handleApprove() { setSubmitted("approved"); }

  // ─── Auth Screen ──────────────────────────────────────────────────────────

  if (screen === "auth") {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`} dir="rtl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`w-full max-w-sm p-8 text-center shadow-xl ${card}`}>
          <div className={`mx-auto w-16 h-16 flex items-center justify-center rounded-2xl mb-5 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <Buildings size={30} className="text-[#C8A762]" weight="duotone" />
          </div>
          <h1 className={`text-xl font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>بوابة مراجعة المستندات</h1>
          <p className={`text-[12px] mb-1 font-semibold ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{doc.title}</p>
          <p className={`text-[11px] mb-6 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>مُرسل من: {doc.sentBy}</p>

          <GovBadge value={doc.contractValue} isDark={isDark} />

          <form onSubmit={handleAuth} className="space-y-4 mt-5">
            <input
              type="text" maxLength={6} value={passcode}
              onChange={e => setPasscode(e.target.value.replace(/\D/g, ""))}
              placeholder="أدخل الرمز السري (٦ أرقام)"
              className={`w-full text-center tracking-[0.4em] font-mono text-xl py-3 rounded-xl border outline-none transition-colors ${
                pcError
                  ? "border-red-500/50 bg-red-500/5 text-red-500"
                  : isDark ? "border-white/[0.1] bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-300 bg-zinc-50 text-zinc-800 placeholder:text-zinc-300"
              }`}
            />
            {pcError && <p className="text-red-500 text-[11px] font-bold">{pcError}</p>}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
              className="w-full py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[14px]">
              دخول للمراجعة
            </motion.button>
          </form>
          <p className={`mt-5 text-[10px] ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>
            محمي بتشفير من نظامي للذكاء الاصطناعي القانوني
          </p>
        </motion.div>
      </div>
    );
  }

  // ─── Identity Screen ──────────────────────────────────────────────────────

  if (screen === "identity") {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`} dir="rtl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`w-full max-w-md p-8 shadow-xl ${card}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/20" : "bg-royal/10"}`}>
              <User size={22} weight="duotone" className="text-royal" />
            </div>
            <div>
              <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>عرّف بنفسك أولاً</h1>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>سيُسجَّل اسمك مع ملاحظاتك</p>
            </div>
          </div>

          <form onSubmit={handleIdentity} className="space-y-4">
            <div>
              <label className={`text-[11px] font-bold mb-1.5 block ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الاسم الكامل *</label>
              <input value={reviewer.name} onChange={e => setReviewer(r => ({ ...r, name: e.target.value }))}
                placeholder="مثال: محمد بن عبدالله الحارثي"
                className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.1] bg-zinc-800 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}
              />
            </div>
            <div>
              <label className={`text-[11px] font-bold mb-1.5 block ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الصفة الوظيفية *</label>
              <input value={reviewer.title} onChange={e => setReviewer(r => ({ ...r, title: e.target.value }))}
                placeholder="مثال: مدير التشغيل"
                className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.1] bg-zinc-800 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}
              />
            </div>
            <div>
              <label className={`text-[11px] font-bold mb-1.5 block ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الإدارة / القسم *</label>
              <select value={reviewer.department} onChange={e => setReviewer(r => ({ ...r, department: e.target.value }))}
                className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.1] bg-zinc-800 text-zinc-100" : "border-zinc-200 bg-white text-zinc-800"}`}
              >
                <option value="">اختر إدارتك</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={`text-[11px] font-bold mb-1.5 block ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>رقم الواتساب (اختياري - للإشعارات)</label>
              <input value={reviewer.whatsapp} onChange={e => setReviewer(r => ({ ...r, whatsapp: e.target.value }))}
                placeholder="مثال: 05xxxxxxxx"
                className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.1] bg-zinc-800 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}
              />
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
              disabled={!reviewer.name || !reviewer.title || !reviewer.department}
              className="w-full py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] disabled:opacity-40 mt-2">
              متابعة لقراءة المستند
            </motion.button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Success Screens ──────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? "bg-[#0A0A0A]" : "bg-zinc-50"}`} dir="rtl">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`w-full max-w-md p-8 text-center ${card}`}>
          <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-5 ${submitted === "approved" ? "bg-emerald-500/10" : "bg-blue-500/10"}`}>
            {submitted === "approved"
              ? <ShieldCheck size={40} className="text-emerald-500" weight="fill" />
              : <ChatCircleDots size={40} className="text-blue-500" weight="fill" />
            }
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
            {submitted === "approved" ? "تم اعتمادك للمستند!" : "تم تسجيل ملاحظاتك!"}
          </h2>
          <p className={`text-[13px] mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            {submitted === "approved"
              ? "تم تسجيل اعتمادك من إدارة التشغيل. سيُشعر صاحب المستند فور اكتمال جميع الاعتمادات."
              : "وصلت ملاحظاتك للمحامي المختص وصاحب المستند. ستصلك رسالة واتساب عند التحديث."
            }
          </p>
          {reviewer.department && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold mb-4 ${reviewerDeptColors.bg} ${reviewerDeptColors.text} border ${reviewerDeptColors.border}`}>
              <Buildings size={12} /> {reviewer.department} — {reviewer.name}
            </div>
          )}
          <button onClick={() => setSubmitted(null)} className={`mt-2 text-[12px] underline ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            العودة للمستند
          </button>
        </motion.div>
      </div>
    );
  }

  // ─── Main Review Screen ───────────────────────────────────────────────────

  const visibleAnnotations = showOtherDepts
    ? annotations
    : annotations.filter(a => a.department === reviewer.department);

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0A0A0A] text-zinc-200" : "bg-zinc-50 text-zinc-800"}`} dir="rtl">

      {/* Header */}
      <header className={`sticky top-0 z-10 px-4 py-3 sm:px-6 flex items-center justify-between border-b backdrop-blur-md ${isDark ? "border-white/[0.05] bg-[#0A0A0A]/90" : "border-zinc-200 bg-white/90"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            <span className="font-bold text-[#C8A762] text-base">N</span>
          </div>
          <div className="min-w-0">
            <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{doc.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>بواسطة {doc.sentBy}</span>
              <GovBadge value={doc.contractValue} isDark={isDark} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${reviewerDeptColors.bg} ${reviewerDeptColors.text} ${reviewerDeptColors.border}`}>
            <Buildings size={11} /> {reviewer.department}
          </div>
          <button className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-colors ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
            <DownloadSimple size={14} /> تحميل
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleApprove}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-[12px] font-bold shadow-md shadow-emerald-500/20">
            <ShieldCheck size={14} weight="fill" /> اعتماد
          </motion.button>
        </div>
      </header>

      {/* Tab bar */}
      <div className={`px-4 sm:px-6 py-2 border-b flex items-center gap-1 ${isDark ? "border-white/[0.05]" : "border-zinc-200"}`}>
        {[
          { id: "read" as const, label: "قراءة المستند" },
          { id: "annotate" as const, label: `ملاحظاتي (${annotations.filter(a => a.department === reviewer.department).length})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${activeTab === tab.id
              ? isDark ? "bg-zinc-800 text-white" : "bg-white text-zinc-800 shadow-sm"
              : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
            }`}>
            {tab.label}
          </button>
        ))}

        {/* Visibility toggle */}
        <div className="ms-auto flex items-center gap-2">
          <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>ملاحظات الإدارات الأخرى:</span>
          <button
            onClick={() => setShowOtherDepts(v => !v)}
            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
              showOtherDepts
                ? "border-royal/30 bg-royal/5 text-royal"
                : isDark ? "border-white/[0.08] text-zinc-600" : "border-zinc-200 text-zinc-400"
            }`}
          >
            {showOtherDepts ? <Eye size={12} /> : <EyeSlash size={12} />}
            {showOtherDepts ? "مرئية" : "مخفية"}
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className={`grid gap-6 ${visibleAnnotations.length > 0 && activeTab === "read" ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>

          {/* Document */}
          {activeTab === "read" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`lg:col-span-2 p-8 sm:p-12 min-h-[600px] text-[14px] leading-loose shadow-xl rounded-2xl border ${
                isDark ? "bg-[#0f0f0f] border-white/[0.08] text-zinc-300" : "bg-white border-zinc-200 text-zinc-800"
              }`}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(doc.body) }}
            />
          )}

          {/* Annotations sidebar */}
          {activeTab === "read" && visibleAnnotations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {showOtherDepts ? "ملاحظات الإدارات" : "ملاحظات إدارتك"} ({visibleAnnotations.length})
                </p>
              </div>
              <AnimatePresence>
                {visibleAnnotations.map(ann => (
                  <AnnotationCard key={ann.id} ann={ann} isDark={isDark} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Annotate tab */}
          {activeTab === "annotate" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`${card} p-6 max-w-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${reviewerDeptColors.bg}`}>
                  <ChatCircleDots size={20} className={reviewerDeptColors.text} weight="duotone" />
                </div>
                <div>
                  <h3 className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>أضف ملاحظتك</h3>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    ستُسجَّل باسمك كـ {reviewer.name} — {reviewer.department}
                  </p>
                </div>
              </div>

              <textarea
                value={noteText} onChange={e => setNoteText(e.target.value)}
                rows={5}
                placeholder="مثال: البند الثالث — يُنصح بتحديد ساعات العمل الأسبوعية لمقدم الخدمة بشكل واضح لتفادي النزاعات..."
                className={`w-full rounded-xl border p-4 text-[13px] outline-none mb-4 resize-none ${isDark ? "border-white/[0.1] bg-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-royal/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/30"}`}
              />

              <div className="flex gap-3">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleSubmitNote} disabled={!noteText.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] disabled:opacity-40">
                  <ChatCircleDots size={15} weight="fill" /> إرسال الملاحظة
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleApprove}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold text-[13px] shadow-md shadow-emerald-500/20">
                  <Check size={15} weight="bold" /> اعتماد بدون ملاحظات
                </motion.button>
              </div>

              {/* Previous notes */}
              {annotations.filter(a => a.department === reviewer.department).length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/[0.06] dark:border-white/[0.06]">
                  <p className={`text-[11px] font-bold mb-3 uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    ملاحظاتك السابقة
                  </p>
                  <div className="space-y-3">
                    {annotations.filter(a => a.department === reviewer.department).map(ann => (
                      <AnnotationCard key={ann.id} ann={ann} isDark={isDark} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
