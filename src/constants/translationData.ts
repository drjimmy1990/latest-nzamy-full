import {
  Briefcase,
  Users,
  Scales,
  Gavel,
  Heart,
  Globe,
} from "@phosphor-icons/react";

export type LangCode = "ar" | "en" | "fr";
export type Stage = "input" | "processing" | "result";

export interface GlossaryItem {
  original: string;
  translated: string;
  definition: string;
}

export interface DisputedClause {
  id: number;
  original: string;
  position: number;
  broadInterpretation: string;
  narrowInterpretation: string;
  suggested: string;
  replaced: boolean;
}

export const LANGS: { code: LangCode; label: string; labelEn: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", label: "العربية",    labelEn: "Arabic",  dir: "rtl" },
  { code: "en", label: "الإنجليزية", labelEn: "English", dir: "ltr" },
  { code: "fr", label: "الفرنسية",   labelEn: "French",  dir: "ltr" },
];

export const SPECIALIZATIONS = [
  { id: "commercial", label: "تجاري وشركات",     icon: Briefcase },
  { id: "labor",      label: "عمالي",             icon: Users },
  { id: "civil",      label: "مدني",               icon: Scales },
  { id: "criminal",   label: "جزائي",              icon: Gavel },
  { id: "family",     label: "أحوال شخصية",        icon: Heart },
  { id: "admin",      label: "إداري",               icon: Globe },
];

export const LEVELS = [
  { id: "literal",  label: "حرفي قانوني",  desc: "ترجمة دقيقة تحافظ على كل مصطلح" },
  { id: "adapted",  label: "تصرف قانوني",  desc: "ترجمة سياقية مع مراعاة البيئة القانونية" },
  { id: "simple",   label: "مبسطة",         desc: "ترجمة واضحة للقراء غير المتخصصين" },
];

export const PROCESSING_STEPS = [
  { label: "تحليل المصطلحات القانونية",   duration: 900 },
  { label: "الترجمة الذكية للنص",          duration: 1200 },
  { label: "مراجعة السياق القانوني",       duration: 800 },
  { label: "استخراج المصطلحات الرئيسية",  duration: 600 },
  { label: "التنقيح والإخراج النهائي",     duration: 400 },
];

export const MOCK_TRANSLATED_EN = `EMPLOYMENT CONTRACT

Pursuant to the Labor Law promulgated by Royal Decree No. (M/51) dated 23/08/1426H, this contract is concluded between the following parties:

First Party (Employer): [Company Name], a company registered under Commercial Registration No. [CR Number], represented herein by [Representative Name] in his capacity as [Title].

Second Party (Employee): [Employee Name], holder of National ID/Iqama No. [ID Number], of [Nationality] nationality.

ARTICLE ONE — NATURE OF WORK
The Employer engages the Employee as [Job Title] at its principal place of business located in [City]. The Employee shall perform all duties assigned to him forthwith in accordance with applicable regulations and the Employer's reasonable internal policies.

ARTICLE TWO — CONTRACT DURATION
This contract shall take effect from [Start Date] and shall remain valid for a period of [Duration], subject to renewal by mutual written agreement.

ARTICLE THREE — REMUNERATION
The Employee shall receive a monthly basic salary of [Amount] Saudi Riyals (SAR), in addition to any allowances or bonuses stipulated in the Employer's applicable compensation policy.`;

export const MOCK_DISPUTED: DisputedClause[] = [
  { id: 1, original: "reasonable", broadInterpretation: "معقول (فضفاض)", narrowInterpretation: "ضروري ومبرر", suggested: "محدد ومُعيَّن", replaced: false, position: 0 },
  { id: 2, original: "forthwith",  broadInterpretation: "فوراً",          narrowInterpretation: "خلال مدة معقولة",  suggested: "خلال (٥) أيام عمل", replaced: false, position: 0 },
];

export const MOCK_GLOSSARY_EN: GlossaryItem[] = [
  { original: "عقد العمل",          translated: "Employment Contract",     definition: "A binding agreement between employer and employee governing the terms of the work relationship." },
  { original: "مرسوم ملكي",         translated: "Royal Decree",            definition: "A legislative instrument issued by the King of Saudi Arabia carrying the force of law." },
  { original: "السجل التجاري",       translated: "Commercial Registration", definition: "The official registry number issued by the Ministry of Commerce for business entities." },
  { original: "الممثل النظامي",     translated: "Legal Representative",    definition: "A person authorized to act on behalf of a legal entity in contractual matters." },
  { original: "الأجر الأساسي",      translated: "Basic Salary",            definition: "The fixed monthly remuneration exclusive of allowances and benefits." },
  { original: "مكافأة نهاية الخدمة",translated: "End-of-Service Gratuity", definition: "Statutory compensation payable to an employee upon termination of employment under Saudi Labor Law." },
];

export const MOCK_ORIGINAL = `عقد عمل

بناءً على نظام العمل الصادر بالمرسوم الملكي رقم (م/٥١) بتاريخ ٢٣/٠٨/١٤٢٦هـ، يُبرَم هذا العقد بين الطرفين الآتيين:

الطرف الأول (صاحب العمل): [اسم الشركة]، شركة مسجلة بموجب السجل التجاري رقم [رقم السجل]، يمثلها في هذا العقد [اسم الممثل] بصفته [المسمى الوظيفي].

الطرف الثاني (الموظف/العامل): [اسم الموظف]، حامل الهوية الوطنية/الإقامة رقم [رقم الهوية]، من جنسية [الجنسية].

المادة الأولى — طبيعة العمل
يُوظِّف صاحب العمل العامل بوصفه [المسمى الوظيفي] في مقره الرئيسي الكائن في [المدينة]، ويضطلع العامل بجميع المهام الموكلة إليه وفق الأنظمة المعمول بها وسياسات صاحب العمل الداخلية.

المادة الثانية — مدة العقد
يسري هذا العقد من تاريخ [تاريخ البدء] لمدة [المدة]، وهو قابل للتجديد باتفاق خطي مشترك.

المادة الثالثة — الأجر والمكافآت
يتقاضى العامل أجراً شهرياً أساسياً قدره [المبلغ] ريالاً سعودياً، إضافةً إلى ما تنص عليه سياسة التعويضات المعمول بها لدى صاحب العمل من بدلات ومكافآت.`;
