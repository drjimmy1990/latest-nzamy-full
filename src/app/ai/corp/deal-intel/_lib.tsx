"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartLine, ShieldWarning, Buildings, Handshake,
  CheckCircle, CaretDown, CaretUp, Warning, Scales,
  Lightbulb, Globe, TrendUp, Newspaper, Bank,
  FileText, ArrowRight, DownloadSimple, Copy, Check,
  Sparkle, ShareNetwork, Spinner, MagnifyingGlass,
  ListChecks, Robot,
} from "@phosphor-icons/react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Stage   = "form" | "dimensions" | "processing" | "report";
export type Risk    = "critical" | "medium" | "low";
export type Verdict = "proceed" | "caution" | "review";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const DEAL_TYPES = ["شراكة تجارية", "عقد تنفيذ أعمال", "فعالية / ايفنت مشترك", "استحواذ أو دمج", "عقد توريد خدمات", "اتفاقية تمويل", "إيجار تجاري", "وكالة أو توزيع", "غير ذلك"];
export const SECTORS    = ["عقاري", "مقاولات وبنية تحتية", "تقنية المعلومات", "تجزئة وتجارة", "صناعي وتصنيع", "مالي وتأميني", "صحي وصيدلاني", "سياحي وضيافة", "خدمات مهنية", "غير ذلك"];
export const PARTY_TYPES = ["شركة خاصة", "شركة مدرجة", "فرد / شخص طبيعي", "جهة حكومية", "مؤسسة دولية"];

export interface Dimension { id: string; icon: React.ElementType; label: string; desc: string; }
export const DIMENSIONS: Dimension[] = [
  { id: "legal",        icon: Scales,         label: "التحليل القانوني والامتثال",         desc: "النصوص النظامية + البنود الإلزامية + الرأي القانوني" },
  { id: "commercial",   icon: ChartLine,       label: "الجدوى التجارية والمالية",           desc: "مؤشرات الجدوى + معدلات السوق + التدفق النقدي" },
  { id: "risk",         icon: ShieldWarning,   label: "المخاطر والفجوات",                   desc: "مصفوفة مخاطر مُصنَّفة + حلول مقترحة" },
  { id: "regulatory",   icon: Buildings,       label: "متطلبات التراخيص والجهات الرقابية", desc: "التراخيص المطلوبة + الإجراءات + الجدول الزمني" },
  { id: "macro",        icon: Globe,           label: "البيئة الاقتصادية والتشريعية",       desc: "رؤية 2030 + السياسات الحكومية + التشريعات الحديثة وأثرها" },
  { id: "counterparty", icon: Handshake,       label: "تقييم الطرف الآخر",                  desc: "معايير الفحص + Red Flags + أسئلة Due Diligence" },
  { id: "verdict",      icon: Lightbulb,       label: "التوصية التنفيذية",                  desc: "خلاصة + التوصية + الخطوات التالية" },
];

export const RISK_STYLE: Record<Risk, { dot: string; label: string; bg: { dark: string; light: string } }> = {
  critical: { dot: "bg-red-500",   label: "حرجة",   bg: { dark: "bg-red-900/20 border-red-700/20",     light: "bg-red-50 border-red-200" } },
  medium:   { dot: "bg-amber-400", label: "متوسطة", bg: { dark: "bg-amber-900/20 border-amber-700/20", light: "bg-amber-50 border-amber-200" } },
  low:      { dot: "bg-green-500", label: "مقبولة", bg: { dark: "bg-green-900/20 border-green-700/20", light: "bg-green-50 border-green-200" } },
};

export const VERDICT_STYLE: Record<Verdict, { Icon: React.ElementType; label: string; bg: { dark: string; light: string }; text: string }> = {
  proceed: { Icon: CheckCircle, label: "موصى بالمضي قُدماً",    bg: { dark: "border-green-700/30 bg-green-900/10",  light: "border-green-200 bg-green-50" },  text: "text-green-500" },
  caution: { Icon: ShieldWarning, label: "مضي مع تحفظات وضمانات", bg: { dark: "border-amber-700/30 bg-amber-900/10", light: "border-amber-200 bg-amber-50" }, text: "text-amber-500" },
  review:  { Icon: Warning, label: "يستوجب مراجعة عميقة",   bg: { dark: "border-red-700/30 bg-red-900/10",     light: "border-red-200 bg-red-50" },    text: "text-red-500" },
};

// ─── Mock Report ───────────────────────────────────────────────────────────────

export const MOCK_REPORT = {
  legal: {
    icon: Scales, color: "text-blue-500", title: "التحليل القانوني والامتثال",
    texts: [
      { ref: "نظام التجارة السعودي — المادة (١٤)", body: "يُشترط توثيق عقد الشراكة التجارية لدى الغرفة التجارية وإفصاح بنود الربح والخسارة بشكل صريح." },
      { ref: "نظام الشركات — المادة (٢٢٢)", body: "يجب تضمين الاتفاقية آلية فض النزاعات، ويُنصح بالاتفاق على التحكيم وفق نظام التحكيم السعودي لتسريع الفصل." },
    ],
    clauses: ["بند السرية وعدم الإفصاح", "بند التنازل والمشاركة في الملكية الفكرية", "آلية الخروج من الشراكة", "شرط عدم المنافسة لـ ٢ سنة"],
    opinion: "الصفقة جائزة نظامياً مع ضرورة توثيقها رسمياً وتضمين بنود حماية واضحة للطرف الأول.",
  },
  commercial: {
    icon: ChartLine, color: "text-emerald-500", title: "الجدوى التجارية والمالية",
    factors: [
      { label: "العائد المتوقع",         value: "متوسط إلى مرتفع",             positive: true },
      { label: "فترة الاسترداد",         value: "١٢ – ١٨ شهراً",               positive: true },
      { label: "مخاطر التدفق النقدي",   value: "متوسطة — يحتاج ضمانات",       positive: false },
      { label: "توافق مع معدل السوق",   value: "متوافق (قطاعك)",              positive: true },
    ],
    note: "بناءً على معدلات قطاعك في السوق السعودي، يُعدّ هيكل الصفقة المقترح ضمن النطاق المقبول تجارياً.",
  },
  risk: {
    icon: ShieldWarning, color: "text-red-500", title: "خارطة المخاطر",
    risks: [
      { level: "critical" as Risk, label: "غياب ضمانات التنفيذ",     desc: "لا توجد آلية تضمن التزام الطرف الآخر بالجدول الزمني",  fix: "إضافة شرط غرامات تأخير بنسبة ٢٪/أسبوع" },
      { level: "medium"  as Risk, label: "تعارض محتمل في الصلاحيات", desc: "تداخل في مسؤوليات الإدارة التشغيلية",                   fix: "تحديد مصفوفة RACI في ملحق العقد" },
      { level: "medium"  as Risk, label: "مخاطر العملة / التسعير",   desc: "إذا كانت الصفقة مرتبطة بعملة أجنبية",                   fix: "تثبيت سعر صرف مرجعي أو إضافة بند تعديل" },
      { level: "low"     as Risk, label: "تغير الأنظمة",              desc: "احتمال تعديل اللوائح خلال مدة الصفقة",                 fix: "إضافة بند المراجعة عند تغيير الأنظمة" },
    ],
  },
  regulatory: {
    icon: Buildings, color: "text-amber-500", title: "متطلبات التراخيص والجهات الرقابية",
    requirements: [
      { agency: "وزارة التجارة",              action: "تسجيل العقد وإيداع النسخ",             timeline: "٥ – ١٠ أيام عمل",       required: true },
      { agency: "غرفة التجارة",               action: "عضوية سارية للطرفين",                  timeline: "فوري إن كانت موجودة",    required: true },
      { agency: "هيئة الاستثمار (إن اقتضى)", action: "موافقة الاستثمار الأجنبي إن وُجد",     timeline: "٣ – ٤ أسابيع",           required: false },
    ],
  },
  macro: {
    icon: Globe, color: "text-teal-500", title: "البيئة الاقتصادية والتشريعية",
    economic: [
      { icon: TrendUp,   label: "مؤشر نمو القطاع",      value: "متسارع",       note: "ارتفع قطاعكم ١٢٪ خلال ٢٠٢٤ مدعوماً برؤية ٢٠٣٠",              positive: true  },
      { icon: Bank,      label: "معدل الفائدة الحالي",  value: "٥.٥٪ – ٦٪",   note: "ارتفاع تكلفة الاقتراض يؤثر على جدوى الصفقات ذات التمويل",    positive: false },
      { icon: Globe,     label: "الناتج المحلي الإجمالي", value: "نمو ٣.٦٪",  note: "بيئة اقتصادية إيجابية داعمة للتوسع والشراكات التجارية",      positive: true  },
      { icon: Newspaper, label: "استقرار التشريعي",     value: "متوسط – مرتفع", note: "تعديلات متوقعة في أنظمة الشركات وعمالة الوافدين لعام ٢٠٢٥", positive: null  },
    ],
    legislative: [
      { title: "نظام الشركات المحدَّث ٢٠٢٢",     impact: "يفرض اشتراطات حوكمة جديدة على الشراكات التجارية — تحتاج هيكل عقد محدّث",       level: "high"   },
      { title: "قرارات التوطين (نطاقات ٢٠٢٤)",   impact: "يؤثر على القطاعات كثيفة العمالة — راجع معدل التوطين المطلوب في الصفقة",          level: "medium" },
      { title: "التحول الرقمي ومتطلبات البيانات", impact: "قطاعات التقنية والصحة والتعليم تخضع لاشتراطات تخزين بيانات محلية",                level: "medium" },
      { title: "نظام تنظيم المنافسة",              impact: "صفقات الاستحواذ ودمج الحصص >٤٠٪ تستوجب إشعار هيئة المنافسة",                   level: "low"    },
    ],
    policyImpact: "بناءً على توجهات رؤية ٢٠٣٠ وخطة التحول الوطني، تندرج هذه الصفقة ضمن قطاع ذي أولوية حكومية مما يعني: سهولة نسبية في التراخيص، دعم محتمل من صندوق الاستثمارات العامة، واهتمام رقابي أعلى بمعايير الحوكمة والشفافية.",
  },
  counterparty: {
    icon: Handshake, color: "text-purple-500", title: "تقييم الطرف الآخر",
    redFlags: ["التحقق من السجل التجاري وتاريخ الإنشاء", "الاستفسار عن أي قضايا تجارية سابقة", "طلب القوائم المالية لآخر ٢ سنوات"],
    ddQuestions: ["ما هو الهيكل التنظيمي وعدد الموظفين الحالي؟", "هل لديكم عقود جارية مع أطراف منافسين لنا؟", "ما هوامش ربحكم المتوقعة من هذه الصفقة؟", "ما الضمانات التي تقدمونها في حال التأخر عن الجدول؟"],
  },
  verdict: {
    icon: Lightbulb, color: "text-[#C8A762]", title: "التوصية التنفيذية",
    verdict: "caution" as Verdict,
    summary: "الصفقة مجدية تجارياً وجائزة نظامياً مع ضرورة معالجة مخاطر التنفيذ قبل التوقيع. يُنصح بضمانات تعاقدية أقوى ومراجعة ملاءة الطرف الآخر. الخطوة التالية: صياغة مسودة العقد مع إدراج البنود المُوصى بها.",
    nextSteps: ["توثيق المتفق عليه في مسودة عقد أولية", "طلب ضمانات مالية أو بنكية من الطرف الآخر", "إرسال المسودة لمراجعة مستشار قانوني"],
  },
};

// ─── PDF Export helper ─────────────────────────────────────────────────────────

export async function exportReportToPDF(el: HTMLElement, filename: string, dealType: string, sector: string) {
  const { default: jsPDF }       = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const prev = el.style.background;
  el.style.background = "#ffffff";

  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", scrollY: -window.scrollY, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight } as any);
  el.style.background = prev;

  const imgData = canvas.toDataURL("image/png");
  const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW   = pdf.internal.pageSize.getWidth();
  const pageH   = pdf.internal.pageSize.getHeight();
  const margin  = 14;
  const usableW = pageW - margin * 2;

  pdf.setFillColor(11, 61, 46); pdf.rect(0, 0, pageW, 22, "F");
  pdf.setTextColor(200, 167, 98); pdf.setFontSize(13); pdf.setFont("helvetica", "bold");
  pdf.text("NZAMY | Deal Intelligence Report", margin, 14);
  pdf.setFontSize(8); pdf.setTextColor(200, 200, 200);
  pdf.text(new Date().toLocaleDateString("ar-SA"), pageW - margin, 14, { align: "right" });

  const subY = 28;
  pdf.setFontSize(10); pdf.setTextColor(50, 50, 50); pdf.setFont("helvetica", "normal");
  pdf.text(`Deal: ${dealType}  |  Sector: ${sector}`, margin, subY);

  const contentY    = subY + 6;
  const imgH        = (canvas.height / canvas.width) * usableW;
  const pagesNeeded = Math.ceil(imgH / (pageH - contentY - 12));

  for (let p = 0; p < pagesNeeded; p++) {
    if (p > 0) {
      pdf.addPage();
      pdf.setFillColor(11, 61, 46); pdf.rect(0, 0, pageW, 12, "F");
      pdf.setFontSize(8); pdf.setTextColor(200, 167, 98);
      pdf.text("NZAMY | محلل الصفقات والفرص", margin, 8);
    }
    const srcY     = p * ((pageH - contentY - 12) / imgH) * canvas.height;
    const sliceH   = ((pageH - contentY - 12) / imgH) * canvas.height;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = Math.min(sliceH, canvas.height - srcY);
    const ctx = offscreen.getContext("2d")!;
    ctx.drawImage(canvas, 0, -srcY);
    const slice     = offscreen.toDataURL("image/png");
    const sliceImgH = (offscreen.height / canvas.width) * usableW;
    pdf.addImage(slice, "PNG", margin, p === 0 ? contentY : 14, usableW, sliceImgH);
  }

  const pages = (pdf as any).getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFillColor(245, 245, 245); pdf.rect(0, pageH - 10, pageW, 10, "F");
    pdf.setFontSize(7); pdf.setTextColor(150, 150, 150);
    pdf.text("نظامي — المنصة القانونية الذكية  |  nzamy.sa", pageW / 2, pageH - 4, { align: "center" });
    pdf.text(`${i} / ${pages}`, pageW - margin, pageH - 4, { align: "right" });
  }

  pdf.save(filename);
}

// ─── AccordionCard ─────────────────────────────────────────────────────────────

export function AccordionCard({ icon: Icon, title, children, color, isDark, defaultOpen = false }: {
  icon: React.ElementType; title: string; children: React.ReactNode; color: string; isDark: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  return (
    <div className={card}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
            <Icon size={16} weight="duotone" className={color} />
          </div>
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{title}</p>
        </div>
        {open ? <CaretUp size={13} className={isDark ? "text-zinc-600" : "text-slate-400"} />
               : <CaretDown size={13} className={isDark ? "text-zinc-600" : "text-slate-400"} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className={`px-4 pb-4 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
