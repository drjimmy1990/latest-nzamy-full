// ─── Lawyer Documents — Taxonomy Constants ───────────────────────────────────
// Extracted from page.tsx (PR-7 decomposition S78)

import {
  BookOpen, ChatCircleText, Seal, Stamp, FileMagnifyingGlass,
} from "@phosphor-icons/react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type DocType      = "pdf" | "docx" | "image" | "other";
export type DocCategory  = "appeals" | "briefs" | "contracts" | "evidence" | "judgments" | "correspondence" | "templates";
export type LegalBranch  = "commercial" | "labor" | "civil" | "admin" | "family" | "real_estate" | "criminal";
export type Party        = "plaintiff" | "defendant" | "neutral";
export type TemplateCategory = "contract" | "memo" | "study" | "consultation" | "complaint" | "power";

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface Doc {
  id: string;
  name: string;
  type: DocType;
  category: DocCategory;
  subtype?: string;
  branch?: LegalBranch;
  party?: Party;
  size: string;
  date: string;
  caseId?: string;
  caseTitle?: string;
  tags?: string[];
  archived?: boolean;
}

export interface Template {
  id: string;
  title: string;
  desc: string;
  category: TemplateCategory;
  fields: number;
  pages: string;
  uses: number;
  isAi: boolean;
  isPremium: boolean;
  branch?: LegalBranch;
}

// ─── 3-Level Appeals Taxonomy ─────────────────────────────────────────────────
export const APPEAL_TYPES = [
  { key: "appeal",          label: "استئناف",           emoji: "" },
  { key: "cassation",       label: "نقض / تمييز",       emoji: "" },
  { key: "reconsideration", label: "التماس إعادة نظر",  emoji: "" },
  { key: "admin_appeal",    label: "طعن إداري",          emoji: "" },
  { key: "execution",       label: "تنفيذ / إشكال",     emoji: "" },
];

export const APPEAL_BRANCHES: Record<string, { key: string; label: string; emoji: string }[]> = {
  appeal: [
    { key: "civil",       label: "مدني",           emoji: "" },
    { key: "criminal",    label: "جنائي",          emoji: "" },
    { key: "family",      label: "أحوال شخصية",   emoji: "" },
    { key: "labor",       label: "عمالي",          emoji: "" },
    { key: "commercial",  label: "تجاري",          emoji: "" },
    { key: "real_estate", label: "عقاري",          emoji: "" },
  ],
  cassation: [
    { key: "civil",      label: "مدني",    emoji: "" },
    { key: "criminal",   label: "جنائي",   emoji: "" },
    { key: "commercial", label: "تجاري",   emoji: "" },
    { key: "admin",      label: "إداري",   emoji: "" },
  ],
  reconsideration: [{ key: "any", label: "جميع الأنواع", emoji: "" }],
  admin_appeal: [
    { key: "admin", label: "محكمة إدارية", emoji: "" },
    { key: "labor", label: "عمالي",        emoji: "" },
  ],
  execution: [
    { key: "civil",      label: "تنفيذ مدني",   emoji: "" },
    { key: "criminal",   label: "تنفيذ جنائي",  emoji: "" },
    { key: "commercial", label: "تنفيذ تجاري",  emoji: "" },
  ],
};

export const APPEAL_SPECIALTIES: Record<string, { key: string; label: string }[]> = {
  criminal:    [{ key:"drugs",label:"مخدرات"},{key:"financial",label:"جرائم مالية"},{key:"forgery",label:"تزوير"},{key:"violence",label:"جرائم عنف"},{key:"cyber",label:"جرائم معلوماتية"}],
  family:      [{ key:"custody",label:"حضانة"},{key:"alimony",label:"نفقة"},{key:"divorce",label:"طلاق وخلع"},{key:"estate",label:"ميراث"},{key:"paternity",label:"نسب"}],
  civil:       [{ key:"contracts",label:"خلافات عقود"},{key:"torts",label:"تعويض ضرر"},{key:"property",label:"ملكية عقارية"}],
  commercial:  [{ key:"companies",label:"نزاعات شركات"},{key:"contracts",label:"عقود تجارية"},{key:"bankruptcy",label:"إفلاس"}],
  labor:       [{ key:"termination",label:"فصل تعسفي"},{key:"wages",label:"أجور ومستحقات"},{key:"injury",label:"إصابة عمل"}],
  real_estate: [{ key:"title",label:"صكوك ملكية"},{key:"rental",label:"إيجارات"},{key:"borders",label:"حدود وتخطيط"}],
  admin:       [{ key:"employment",label:"عمالة حكومية"},{key:"licenses",label:"تراخيص"},{key:"penalties",label:"قرارات تأديبية"}],
  any:         [{ key:"any_sub",label:"جميع التخصصات"}],
};

// ─── Cascading Sub-types ──────────────────────────────────────────────────────
export const CATEGORY_SUBTYPES: Record<string, { key: string; label: string }[]> = {
  briefs:         [{key:"memo_opening",label:"مذكرة افتتاحية"},{key:"memo_reply",label:"مذكرة رد على الخصم"},{key:"memo_appeal",label:"مذكرة طعن / استئناف"},{key:"memo_cassation",label:"مذكرة نقض / تمييز"},{key:"memo_exec",label:"طلب تنفيذ حكم"},{key:"memo_urgent",label:"طلب مستعجل"},{key:"memo_evidence",label:"مذكرة أدلة / خبرة"},{key:"memo_amicus",label:"مذكرة ملاحظات"}],
  contracts:      [{key:"ctr_employment",label:"عقد عمل"},{key:"ctr_rental",label:"عقد إيجار"},{key:"ctr_service",label:"عقد خدمات"},{key:"ctr_trade",label:"عقد تجاري / بيع"},{key:"ctr_partner",label:"عقد شراكة"},{key:"ctr_nda",label:"اتفاقية سرية NDA"},{key:"ctr_agency",label:"عقد وكالة قانونية"},{key:"ctr_finance",label:"عقد مالي / قرض"}],
  evidence:       [{key:"ev_document",label:"سند / وثيقة رسمية"},{key:"ev_photo",label:"صور / لقطات"},{key:"ev_testimony",label:"شهادة شاهد"},{key:"ev_expert",label:"تقرير خبير"},{key:"ev_bank",label:"كشف حساب بنكي"},{key:"ev_title",label:"صك ملكية"}],
  judgments:      [{key:"jdg_first",label:"حكم ابتدائي"},{key:"jdg_appeal",label:"حكم استئناف"},{key:"jdg_cassation",label:"حكم نقض / تمييز"},{key:"jdg_admin",label:"حكم إداري"},{key:"jdg_exec",label:"أمر تنفيذي"}],
  correspondence: [{key:"cor_court",label:"مراسلة محكمة"},{key:"cor_client",label:"مراسلة موكل"},{key:"cor_gov",label:"مراسلة حكومية / وزارة"},{key:"cor_opponent",label:"مراسلة خصم / محامي خصم"},{key:"cor_notary",label:"وثيقة كتابة عدل"}],
  templates:      [{key:"tmpl_memo",label:"نموذج مذكرة"},{key:"tmpl_contract",label:"نموذج عقد"},{key:"tmpl_complaint",label:"نموذج شكوى"},{key:"tmpl_power",label:"نموذج وكالة"},{key:"tmpl_study",label:"نموذج دراسة قانونية"}],
};

export const LEGAL_BRANCHES: { key: LegalBranch; label: string }[] = [
  { key: "commercial",  label: "تجاري" },
  { key: "labor",       label: "عمالي" },
  { key: "civil",       label: "مدني" },
  { key: "admin",       label: "إداري" },
  { key: "family",      label: "أحوال شخصية" },
  { key: "real_estate", label: "عقاري" },
  { key: "criminal",    label: "جنائي" },
];

export const PARTY_CONFIG: { key: Party; label: string; color: string }[] = [
  { key: "plaintiff", label: "المدعي / الطاعن",              color: "text-royal" },
  { key: "defendant", label: "المدعى عليه / المطعون ضده",    color: "text-orange-500" },
  { key: "neutral",   label: "وثيقة محايدة",                  color: "text-slate-400" },
];

export const DOC_CATS = [
  { key: "all",            label: "الكل",       emoji: "" },
  { key: "appeals",        label: "طعون",        emoji: "", isSpecial: true },
  { key: "briefs",         label: "المذكرات",    emoji: "" },
  { key: "contracts",      label: "العقود",      emoji: "" },
  { key: "evidence",       label: "الأدلة",      emoji: "" },
  { key: "judgments",      label: "الأحكام",     emoji: "" },
  { key: "correspondence", label: "المراسلات",   emoji: "" },
];

export const TMPL_CAT_CONFIG: Record<TemplateCategory, { label: string; color: string; bg: string; icon: any; emoji: string }> = {
  contract:     { label: "عقد",     color: "text-indigo-500", bg: "bg-indigo-500/10", icon: Seal,               emoji: "" },
  memo:         { label: "مذكرة",   color: "text-royal",      bg: "bg-royal/10",      icon: null,               emoji: "" }, // FileText passed from page to avoid circular
  study:        { label: "دراسة",   color: "text-teal-500",   bg: "bg-teal-500/10",   icon: BookOpen,           emoji: "" },
  consultation: { label: "استشارة", color: "text-emerald-500",bg: "bg-emerald-500/10",icon: ChatCircleText,     emoji: "" },
  complaint:    { label: "شكوى",    color: "text-orange-500", bg: "bg-orange-500/10", icon: FileMagnifyingGlass,emoji: "" },
  power:        { label: "وكالة",   color: "text-amber-500",  bg: "bg-amber-500/10",  icon: Stamp,              emoji: "" },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
export const MOCK_DOCS: Doc[] = [
  { id:"d1", name:"لائحة اعتراضية",          type:"pdf",   category:"briefs",        subtype:"memo_appeal",   branch:"commercial",  party:"defendant",  size:"٢.٤ MB",  date:"١٥ أبريل ٢٠٢٤",   caseId:"1", caseTitle:"نزاع تجاري — الأفق",   tags:["مذكرة","استئناف"] },
  { id:"d2", name:"عقد الخدمات القانونية",   type:"docx",  category:"contracts",     subtype:"ctr_service",   branch:"civil",       party:"neutral",    size:"٦٤٨ KB",  date:"١٠ أبريل ٢٠٢٤",   tags:["عقد","موكل"] },
  { id:"d3", name:"صك ملكية العقار ٢١٣",     type:"image", category:"evidence",      subtype:"ev_title",      branch:"real_estate", party:"plaintiff",  size:"١.٨ MB",  date:"٨ أبريل ٢٠٢٤",    caseId:"4", caseTitle:"استئناف العقار ٢١٣", tags:["دليل"] },
  { id:"d4", name:"حكم ابتدائي — السبيعي",  type:"pdf",   category:"judgments",     subtype:"jdg_first",     branch:"admin",       party:"neutral",    size:"٩٢٠ KB",  date:"١ أبريل ٢٠٢٤",    caseId:"6", caseTitle:"مطالبة إدارية",     tags:["حكم"] },
  { id:"d5", name:"مراسلة المحكمة العمالية", type:"docx",  category:"correspondence",subtype:"cor_court",     branch:"labor",       party:"neutral",    size:"٢١٠ KB",  date:"٢٩ مارس ٢٠٢٤",    caseId:"3", caseTitle:"قضية عمالية ٤٥٦٧", tags:["مراسلة"] },
  { id:"d6", name:"مذكرة ردّ الخصم",          type:"pdf",   category:"briefs",        subtype:"memo_reply",    branch:"real_estate", party:"plaintiff",  size:"١.١ MB",  date:"٢٥ مارس ٢٠٢٤",    caseId:"4", caseTitle:"استئناف العقار ٢١٣", tags:["مذكرة","رد"] },
  { id:"d7", name:"مذكرة طعن بالنقض",         type:"pdf",   category:"briefs",        subtype:"memo_cassation",branch:"commercial",  party:"plaintiff",  size:"٣.٢ MB",  date:"٢٠ مارس ٢٠٢٤",    caseId:"1", caseTitle:"نزاع تجاري — الأفق",   tags:["طعن","نقض"] },
  { id:"d8", name:"عقد شراكة تضامنية",         type:"docx",  category:"contracts",     subtype:"ctr_partner",   branch:"commercial",  party:"neutral",    size:"٩٠٠ KB",  date:"١٥ مارس ٢٠٢٤",    tags:["عقد","شراكة"] },
];

export const TEMPLATES: Template[] = [
  { id:"t1", title:"عقد أتعاب محاماة",          desc:"عقد شامل لاتفاقية الأتعاب والخدمات القانونية بين المحامي والموكل",                            category:"contract",     branch:"civil",       fields:12, pages:"٢–٣ صفحات", uses:847,  isAi:true,  isPremium:false },
  { id:"t2", title:"مذكرة افتتاحية — تجاري",    desc:"مذكرة المدعي في منازعات العقود التجارية وفك الشراكات",                                        category:"memo",         branch:"commercial",  fields:8,  pages:"٤–٧ صفحات", uses:612,  isAi:true,  isPremium:false },
  { id:"t3", title:"مذكرة عمالية — فصل تعسفي",  desc:"لائحة دعوى العامل ضد صاحب العمل في حالات الفصل غير المشروع",                                  category:"memo",         branch:"labor",       fields:10, pages:"٣–٥ صفحات", uses:523,  isAi:true,  isPremium:false },
  { id:"t4", title:"دراسة قانونية — عقد إيجار",  desc:"تحليل قانوني معمّق لإشكاليات عقود الإيجار السكنية والتجارية",                                  category:"study",        branch:"real_estate", fields:6,  pages:"٥–٨ صفحات", uses:214,  isAi:true,  isPremium:true  },
  { id:"t5", title:"استشارة قانونية — عقد عمل",  desc:"رأي قانوني موجز حول بنود عقود العمل المقدمة من الشركات",                                       category:"consultation", branch:"labor",       fields:5,  pages:"١–٢ صفحة",  uses:389,  isAi:true,  isPremium:false },
  { id:"t6", title:"وكالة شاملة قضائية",          desc:"صيغة وكالة رسمية تخول المحامي تمثيل الموكل أمام جميع الجهات القضائية والحكومية",               category:"power",        branch:"civil",       fields:7,  pages:"١ صفحة",    uses:1203, isAi:false, isPremium:false },
  { id:"t7", title:"شكوى إدارية — وزارة الموارد", desc:"تقديم شكوى رسمية إلى وزارة الموارد البشرية في منازعات العمل والأجور والإجازات",                category:"complaint",    branch:"labor",       fields:9,  pages:"٢ صفحة",    uses:298,  isAi:true,  isPremium:false },
  { id:"t8", title:"عقد شراكة تضامنية",           desc:"صيغة متوافقة مع نظام الشركات ٢٠٢٢ لتأسيس شراكة بين شخصين أو أكثر",                            category:"contract",     branch:"commercial",  fields:15, pages:"٤–٦ صفحات", uses:176,  isAi:true,  isPremium:true  },
];
