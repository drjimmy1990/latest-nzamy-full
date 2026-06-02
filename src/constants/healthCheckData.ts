import React from "react";
import {
  FileText, Scales, Buildings, ShieldCheck, Lock,
  TrendUp, FilePdf, FileDoc, UsersThree, Funnel, Money,
  ChartBar, Handshake, CheckCircle
} from "@phosphor-icons/react";

// ── Types ─────────────────────────────────────────────────────────────
export type FileItem = { id: string; name: string; size: string; type: string; status: "uploading" | "classifying" | "done" | "error" };
export type Category = "contracts" | "labor" | "licenses" | "finance" | "government" | "ip" | "employees" | "unclassified";
export type Severity = "critical" | "warning" | "ok";
export type Finding = { id: string; title: string; severity: Severity; category: Category; detail: string; action: string };
export type WizardStep = "upload" | "classifying" | "results" | "dashboard";

// ── Mock data ─────────────────────────────────────────────────────────
export const MOCK_FILES: FileItem[] = [
  { id: "f1", name: "عقد_توريد_شركة_الأفق.pdf", size: "2.4 MB", type: "pdf", status: "done" },
  { id: "f2", name: "عقد_خدمات_نظافة.pdf", size: "1.1 MB", type: "pdf", status: "done" },
  { id: "f3", name: "سجل_تجاري_2024.pdf", size: "890 KB", type: "pdf", status: "done" },
  { id: "f4", name: "رخصة_بلدية.pdf", size: "650 KB", type: "pdf", status: "done" },
  { id: "f5", name: "عقد_عمل_أحمد_سالم.pdf", size: "420 KB", type: "pdf", status: "done" },
  { id: "f6", name: "إقرار_زكاة_2024.pdf", size: "1.8 MB", type: "pdf", status: "done" },
  { id: "f7", name: "عقد_إيجار_مستودع.pdf", size: "3.2 MB", type: "pdf", status: "done" },
  { id: "f8", name: "شهادة_تأمين_طبي.pdf", size: "540 KB", type: "pdf", status: "done" },
  { id: "f9", name: "عقد_شراكة_المنشاوي.docx", size: "1.5 MB", type: "docx", status: "done" },
  { id: "f10", name: "خطاب_وزارة_التجارة.pdf", size: "320 KB", type: "pdf", status: "done" },
  { id: "f11", name: "رخصة_دفاع_مدني.pdf", size: "480 KB", type: "pdf", status: "done" },
  { id: "f12", name: "ميزانية_2024.xlsx", size: "2.1 MB", type: "xlsx", status: "done" },
];

export const CATEGORY_CONFIG: Record<Category, { label: string; icon: any; color: string; count: number }> = {
  contracts:    { label: "عقود تجارية",     icon: FileText,    color: "text-blue-500",    count: 4 },
  labor:        { label: "عقود عمالية",     icon: Scales,      color: "text-orange-500",  count: 1 },
  licenses:     { label: "تراخيص ورخص",    icon: ShieldCheck,  color: "text-emerald-500", count: 3 },
  finance:      { label: "مستندات مالية",   icon: TrendUp,     color: "text-purple-500",  count: 2 },
  government:   { label: "مستندات حكومية", icon: Buildings,    color: "text-cyan-500",    count: 1 },
  ip:           { label: "ملكية فكرية",    icon: Lock,        color: "text-pink-500",    count: 0 },
  employees:    { label: "شؤون الموظفين",  icon: UsersThree,  color: "text-amber-500",   count: 1 },
  unclassified: { label: "غير مُصنّف",     icon: Funnel,      color: "text-zinc-400",    count: 0 },
};

export const MOCK_FINDINGS: Finding[] = [
  { id: "r1", title: "عقد إيجار مستودع الدمام — منتهي منذ ٤٥ يوم", severity: "critical", category: "contracts", detail: "العقد انتهى بتاريخ ٢٠٢٦/٠٣/٠١ ولم يُجدد. يوجد شرط تجديد تلقائي لكنه يتطلب إخطار كتابي.", action: "تجديد فوري أو إخلاء" },
  { id: "r2", title: "رخصة الدفاع المدني تنتهي خلال ٢٨ يوم", severity: "critical", category: "licenses", detail: "الرخصة ستنتهي في ٢٠٢٦/٠٥/١٥ — غرامة عدم التجديد تصل إلى ١٠٠,٠٠٠ ريال.", action: "التجديد قبل ١٥ مايو" },
  { id: "r3", title: "عقد شراكة المنشاوي — بند عدم منافسة واسع (٥ سنوات)", severity: "critical", category: "contracts", detail: "مدة عدم المنافسة ٥ سنوات تُعد مبالغاً فيها قانونياً وقد لا تُنفّذ قضائياً.", action: "إعادة التفاوض" },
  { id: "r4", title: "عقد توريد الأفق — لا يحتوي بند تحكيم", severity: "critical", category: "contracts", detail: "غياب بند التحكيم يعني أن أي نزاع سيذهب للمحكمة مباشرة — أبطأ وأكثر تكلفة.", action: "إضافة ملحق تحكيم" },
  { id: "r5", title: "علامة تجارية غير مسجّلة", severity: "critical", category: "ip", detail: "لم نجد شهادة تسجيل علامة تجارية. إذا كان لديك علامة تجارية فيجب تسجيلها فوراً.", action: "تسجيل العلامة لدى SAIP" },
  { id: "r6", title: "إقرار الزكاة لعام ٢٠٢٥ لم يُقدَّم", severity: "warning", category: "finance", detail: "آخر إقرار مُقدّم كان لعام ٢٠٢٤. يجب تقديم إقرار ٢٠٢٥ قبل الموعد النهائي.", action: "تقديم الإقرار" },
  { id: "r7", title: "رخصة بلدية تنتهي خلال ٤٥ يوم", severity: "warning", category: "licenses", detail: "الرخصة البلدية تنتهي في ٢٠٢٦/٠٦/٠١. يُنصح بالتجديد مبكراً لتفادي التأخير.", action: "التجديد المبكر" },
  { id: "r8", title: "موظف واحد غير مُسجّل في التأمينات", severity: "warning", category: "employees", detail: "من أصل ١٥ موظفاً — موظف واحد لم يُسجّل في التأمينات الاجتماعية بعد.", action: "تسجيل الموظف فوراً" },
  { id: "r9", title: "٣ عقود تنتهي خلال ٩٠ يوم", severity: "warning", category: "contracts", detail: "عقد توريد + خدمات نظافة + صيانة أنظمة — كلها تحتاج متابعة للتجديد.", action: "إعداد خطة تجديد" },
  { id: "r10", title: "شهادة التأمين الطبي سارية حتى ٢٠٢٧", severity: "ok", category: "employees", detail: "التأمين الطبي ساري المفعول لجميع الموظفين.", action: "لا يلزم إجراء" },
  { id: "r11", title: "السجل التجاري ساري حتى ٢٠٢٧/٠٣", severity: "ok", category: "licenses", detail: "السجل التجاري ساري ومُحدث.", action: "لا يلزم إجراء" },
  { id: "r12", title: "عقود العمل مكتملة ومطابقة لنظام العمل", severity: "ok", category: "labor", detail: "جميع عقود الموظفين متوافقة مع نظام العمل السعودي.", action: "لا يلزم إجراء" },
];

export const SCORE_BARS = [
  { label: "العقود", pct: 68, color: "bg-amber-500", detail: "٣ عقود منتهية/قريبة — ٢ عقود فيها بنود خطرة" },
  { label: "التراخيص", pct: 62, color: "bg-amber-500", detail: "رخصة منتهية + ٢ قريبة الانتهاء" },
  { label: "الامتثال المالي", pct: 78, color: "bg-blue-500", detail: "إقرار ٢٠٢٥ مطلوب" },
  { label: "الموظفين والعمالة", pct: 93, color: "bg-emerald-500", detail: "١٤/١٥ مُسجّل في التأمينات" },
  { label: "الملكية الفكرية", pct: 35, color: "bg-red-500", detail: "علامة تجارية غير مسجّلة" },
];

export const PREDICTIVE_INSIGHTS = [
  { risk: "نزاع عمالي محتمل", prob: 78, reason: "موظف غير مُسجّل في التأمينات + فترة تجربة منتهية بدون تثبيت", impact: "غرامة حتى ١٠٠,٠٠٠ ﷼ + تعويض الموظف", action: "تسجيل الموظف فوراً + اتخاذ قرار التثبيت", icon: Scales, color: "border-red-500/20 bg-red-500/5" },
  { risk: "مطالبة مالية من المورّد", prob: 65, reason: "عقد توريد الأفق بدون بند تحكيم + فاتورة متأخرة ١٢٠ يوم", impact: "دعوى قضائية + تكاليف ترافع ٢٥,٠٠٠ — ٥٠,٠٠٠ ﷼", action: "تسوية الفاتورة + إضافة ملحق تحكيم للعقد", icon: Money, color: "border-amber-500/20 bg-amber-500/5" },
  { risk: "غرامة عدم تجديد رخصة", prob: 92, reason: "رخصة دفاع مدني تنتهي خلال ٢٨ يوم + رخصة بلدية خلال ٤٥ يوم", impact: "غرامة تصل إلى ١٠٠,٠٠٠ ﷼ + إغلاق مؤقت", action: "تقديم طلب تجديد فوري عبر بلدي + ١١٣", icon: Buildings, color: "border-red-500/20 bg-red-500/5" },
  { risk: "خلاف شراكة", prob: 45, reason: "بند عدم المنافسة في عقد الشراكة واسع جداً (٥ سنوات) — قد لا يُنفَّذ قضائياً", impact: "بطلان البند + ضعف الحماية القانونية", action: "إعادة التفاوض على مدة ٢ سنة — معيار السوق", icon: Handshake, color: "border-amber-500/20 bg-amber-500/5" },
  { risk: "مخالفة الزكاة والضريبة", prob: 88, reason: "إقرار ٢٠٢٥ لم يُقدّم — الموعد النهائي يقترب", impact: "غرامة تأخير ٥-٢٥٪ من المبلغ المستحق + إيقاف خدمات", action: "تقديم الإقرار عبر منصة ZATCA", icon: ChartBar, color: "border-red-500/20 bg-red-500/5" },
];
