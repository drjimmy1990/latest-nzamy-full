// ─── Step config ──────────────────────────────────────────────────────────────

export const STEPS = [
  { key: "identify",  label: "التحديد",   num: 1 },
  { key: "case",      label: "القضية",    num: 2 },
  { key: "analysis",  label: "التحليل",   num: 3 },
  { key: "defenses",  label: "الدفوع",    num: 4 },
  { key: "laws",      label: "النصوص",    num: 5 },
  { key: "drafting",  label: "الصياغة",   num: 6 },
  { key: "review",    label: "التنقيح",   num: 7 },
  { key: "approval",  label: "الاعتماد",  num: 8 },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

// ─── Legal branches ────────────────────────────────────────────────────────────

export const LEGAL_BRANCHES_REGULAR = [
  "عمالي", "تجاري", "مدني", "جزائي", "أسرة (أحوال شخصية)", "عقاري",
  "إداري", "تنفيذ", "إفلاس", "مالي / مصرفي", "تأمين",
  "ملكية فكرية", "بيئي", "اتصالات وتقنية",
  "طبي", "بحري", "نقل وطيران", "رياضي",
  "تحكيم", "حقوق إنسان", "أمن سيبراني",
];

export const LEGAL_BRANCHES_COMMITTEES = ["جمركية", "ضريبية", "زكوية"];
export const COMMITTEE_BRANCH_IDS = new Set(LEGAL_BRANCHES_COMMITTEES);

// ─── Memo types (cascading) ────────────────────────────────────────────────────

export const MEMO_MAIN_TYPES = [
  { id: "case",     label: "تحرير دعوى",    desc: "رفع دعوى جديدة أمام المحكمة أو اللجنة القضائية" },
  { id: "reply",    label: "مذكرة رد",      desc: "الرد حرفياً على مذكرة أو لائحة مقدمة من الخصم" },
  { id: "appeal",   label: "طعن",           desc: "استئناف أو نقض أو التماس إعادة النظر" },
];

export const MEMO_SUB_TYPES_REGULAR: Record<string, string[]> = {
  case:     ["حقوقية (مدني/تجاري/عائلي)", "جزائية خاصة (تعويض ضرر)", "إدارية أمام ديوان المظالم"],
  reply:    ["مذكرة رد أساسية", "مذكرة إلحاقية (إضافة أدلة)", "مذكرة ختامية قبل الحكم"],
  appeal:   ["استئناف (درجة ثانية)", "نقض (المحكمة العليا)", "التماس إعادة النظر"],
};

export const MEMO_SUB_TYPES_COMMITTEES: Record<string, string[]> = {
  case:     ["تحرير مطالبة أمام لجنة", "مطالبة أمام ديوان المظالم (ابتدائي)"],
  reply:    ["رد على لائحة الجهة الحكومية"],
  appeal:   ["استئناف القرار أمام اللجنة العليا", "التماس إعادة النظر"],
};

export const REQUIRES_PRIOR_DOCS_TYPES   = new Set(["reply", "appeal"]);
export const REQUIRES_JUDGMENT_HEADER    = new Set(["reply", "appeal"]);

// ─── Pre-Filing Procedural Checklist ──────────────────────────────────────────
// Driven by memoSubType — no LLM needed. Static Saudi procedural requirements.
// Add/update items here as courts issue new procedural circulars.

export interface PreFilingItem {
  id: string;
  text: string;      // السؤال / الاشتراط
  hint?: string;     // ملاحظة توضيحية
  required: boolean; // شرط أساسي أم مستحسن
}

export const PRE_FILING_CHECKLIST: Record<string, PreFilingItem[]> = {
  "إدارية أمام ديوان المظالم": [
    { id: "adm-1", text: "هل سبق لك التظلم الإداري للجهة الإدارية المختصة؟", hint: "شرط أساسي — المادة (12) نظام ديوان المظالم", required: true },
    { id: "adm-2", text: "هل انقضت 60 يوماً على التظلم دون رد، أو جاء الرد رافضاً؟", hint: "مدة انتظار الصمت الإداري", required: true },
    { id: "adm-3", text: "هل الدعوى مرفوعة خلال سنة من تاريخ علمك بالقرار المطعون فيه؟", hint: "مدة التقادم الإداري — المادة (14) نظام ديوان المظالم", required: true },
    { id: "adm-4", text: "هل تم توثيق القرار الإداري المطعون فيه رسمياً؟", required: false },
  ],
  "حقوقية (مدني/تجاري/عائلي)": [
    { id: "civ-1", text: "هل جُرِّبت التسوية الودية أو الوساطة قبل رفع الدعوى؟", hint: "مستحسن — القاضي قد يطلبها", required: false },
    { id: "civ-2", text: "هل الدعوى مرفوعة خلال مدة التقادم (10 سنوات قاعدة عامة)؟", required: true },
    { id: "civ-3", text: "هل حُدِّد محل إقامة أو مقر المدعى عليه لتحديد الاختصاص المكاني؟", required: true },
    { id: "civ-4", text: "هل يوجد شرط تحكيم في العقد قد يُقيّد اختصاص المحكمة؟", hint: "إن وُجد شرط تحكيم، الدعوى قد تُردّ شكلاً", required: true },
  ],
  "جزائية خاصة (تعويض ضرر)": [
    { id: "cri-1", text: "هل سبق رفع بلاغ جنائي أو شكوى جزائية بالواقعة؟", required: false },
    { id: "cri-2", text: "هل الدعوى المدنية التبعية مقدّمة بالتزامن مع الجزائية؟", hint: "يمكن رفعها منضمة أو منفردة بعد صدور الحكم", required: false },
    { id: "cri-3", text: "هل انتهت مدة سقوط الدعوى الجزائية (3 سنوات للجنح)؟", required: true },
  ],
  "تحرير مطالبة أمام لجنة": [
    { id: "com-1", text: "هل تمت التسوية الودية مع الجهة خلال المدة المحددة؟", required: true },
    { id: "com-2", text: "هل قُدِّم التظلم الرسمي للجهة المختصة قبل اللجنة؟", required: true },
    { id: "com-3", text: "هل تم التسجيل في بوابة الجهة الإلكترونية إن وُجدت؟", hint: "مثال: منصة فسح، أبشر أعمال، إلخ", required: false },
  ],
  "مطالبة أمام ديوان المظالم (ابتدائي)": [
    { id: "adm-com-1", text: "هل تظلمت للجهة الإدارية المباشرة أولاً؟", required: true },
    { id: "adm-com-2", text: "هل مرّت المدة النظامية على رد الجهة أو صمتها (60 يوماً)؟", required: true },
    { id: "adm-com-3", text: "هل الدعوى خلال سنة من تاريخ علمك بالقرار؟", required: true },
  ],
};

// Default checklist when memoSubType has no specific mapping
export const PRE_FILING_DEFAULT: PreFilingItem[] = [
  { id: "def-1", text: "هل التزمت بمدة تقادم الدعوى وفق النظام المعمول به؟", required: true },
  { id: "def-2", text: "هل حُدِّد الاختصاص القضائي (نوعي ومكاني) بشكل صحيح؟", required: true },
  { id: "def-3", text: "هل جُمعت المستندات المؤيدة الأساسية قبل الرفع؟", required: false },
];

// ─── Party types ──────────────────────────────────────────────────────────────

export type PartyType = "company" | "individual" | "government";

export type PartyData = {
  type: PartyType;
  companyName: string; commercialReg: string; unifiedNum: string;
  representative: string; representativeRole: string; address: string;
  fullName: string; idNumber: string; nationality: string;
  entityName: string; unifiedNumGov: string; contactPerson: string;
  taxOrCustomsNum: string;
};

export const EMPTY_PARTY: PartyData = {
  type: "individual",
  companyName: "", commercialReg: "", unifiedNum: "",
  representative: "", representativeRole: "", address: "",
  fullName: "", idNumber: "", nationality: "",
  entityName: "", unifiedNumGov: "", contactPerson: "",
  taxOrCustomsNum: "",
};

// ─── Support docs type ────────────────────────────────────────────────────────

export type SupportDoc = { id: number; description: string; file: string | null; isLargeFile?: boolean };

// ─── Mock AI data ─────────────────────────────────────────────────────────────

export const MOCK_ANALYSIS = {
  charges: ["الفصل التعسفي دون إشعار مسبق", "عدم صرف مستحقات نهاية الخدمة"],
  weaknesses: ["غياب شهادة خطية من الشاهد الرئيسي"],
  evidence: ["عقد العمل الموثق", "كشف حساب بنكي يثبت الرواتب", "صورة خطاب الفصل"],
  contradictions: ["المدعى عليه يدّعي الاستقالة الطوعية لكن خطاب الفصل يثبت العكس"],
  threats: [{ threat: "الدفع بقبول الاستقالة ضمنياً", response: "تقديم دليل أن الموكل لم يوقع على استقالة" }],
  strategy: "التركيز على إثبات الفصل التعسفي واستحقاق التعويض وفق المادة ٧٧",
};

export type DefenseStatus = "confirmed" | "rejected" | "pending";

export interface SubDefense {
  id: string;
  title: string;
  legalBase?: string;
  status: DefenseStatus;
  note?: string;
}

export interface MainDefense {
  id: string;
  title: string;
  legalBase?: string;
  isCore: boolean;
  priority: "عالية" | "متوسطة" | "منخفضة";
  status: DefenseStatus;
  summary: string;
  subDefenses: SubDefense[];
  note?: string;
}

export const MOCK_DEFENSES: MainDefense[] = [
  {
    id: "d1",
    title: "بطلان الإنهاء لعدم الإشعار المسبق",
    legalBase: "المادة ٧٧ نظام العمل",
    isCore: true,
    priority: "عالية",
    status: "confirmed",
    summary: "يستوجب النظام إشعار العامل قبل الإنهاء بثلاثين يوماً على الأقل، وإلا اعتُبر الإنهاء باطلاً.",
    subDefenses: [
      { id: "s1-1", title: "عدم وجود خطاب إشعار", legalBase: "م. ٧٧", status: "confirmed" },
      { id: "s1-2", title: "عدم دفع بدل الإشعار بدلاً من المدة", status: "confirmed" },
      { id: "s1-3", title: "خطاب الفصل يثبت الإنهاء المباشر", status: "pending" },
    ],
  },
  {
    id: "d2",
    title: "استحقاق مكافأة نهاية الخدمة كاملة",
    legalBase: "المادتان ٨٤ و ٨٨ نظام العمل",
    isCore: true,
    priority: "عالية",
    status: "confirmed",
    summary: "يستحق الموكل مكافأة كاملة عن سنوات خدمته لا تسقط بالفصل التعسفي.",
    subDefenses: [
      { id: "s2-1", title: "حساب المكافأة وفق آخر أجر", legalBase: "م. ٨٤", status: "confirmed" },
      { id: "s2-2", title: "المطالبة بالفوائد التأخيرية للمستحقات", status: "pending" },
    ],
  },
  {
    id: "d3",
    title: "التعويض عن الضرر المعنوي والمادي",
    legalBase: "المادة ٧٧ نظام العمل",
    isCore: false,
    priority: "متوسطة",
    status: "pending",
    summary: "يحق للموكل وفقاً للمادة ٧٧ المطالبة بتعويض عن الضرر الناتج من الإنهاء غير المشروع.",
    subDefenses: [
      { id: "s3-1", title: "ضرر مادي: فقدان الدخل لمدة البحث عن عمل", status: "pending" },
      { id: "s3-2", title: "ضرر معنوي: الأثر على السمعة المهنية", status: "pending" },
    ],
  },
  {
    id: "d4",
    title: "المطالبة ببدل الإجازات غير المستخدمة",
    legalBase: "المادة ٨٨ نظام العمل",
    isCore: false,
    priority: "متوسطة",
    status: "confirmed",
    summary: "يستحق العامل تحويل الإجازات غير المستخدمة إلى مكافأة عند انتهاء العقد.",
    subDefenses: [
      { id: "s4-1", title: "خصم أيام الإجازة غير المستخدمة من آخر أجر", status: "confirmed" },
    ],
  },
];

export const MOCK_LAWS = [
  { article: "المادة ٧٧", system: "نظام العمل", text: "إذا أُنهي العقد لسبب غير مشروع كان للطرف المتضرر الحق في تعويض..." },
  { article: "المادة ٨٠", system: "نظام العمل", text: "لا يجوز لصاحب العمل فسخ العقد دون مكافأة إلا في حالات محددة..." },
  { article: "المادة ٨٤", system: "نظام العمل", text: "تحتسب مكافأة نهاية الخدمة على أساس آخر أجر..." },
  { article: "المادة ٨٨", system: "نظام العمل", text: "يستحق العامل المكافأة عند انتهاية العلاقة العمالية..." },
];

export const MOCK_DRAFT = `بسم الله الرحمن الرحيم

أصحاب الفضيلة / قضاة الدائرة العمالية                                                                              حفظهم الله

السلام عليكم ورحمة الله وبركاته

**الموضوع: صحيفة دعوى — فصل تعسفي**

**المدعي:** [اسم الموكل]
**المدعى عليه:** [اسم الشركة]
**الممثل النظامي:** أ. محمد العتيبي — ترخيص رقم ١٢٣٤٥

---

**أولاً: الوقائع**
التحق موكلنا بالعمل لدى المدعى عليها بموجب عقد عمل محدد المدة مؤرخ في [التاريخ]، وقد فوجئ بإنهاء خدماته بتاريخ [التاريخ] دون إشعار مسبق ودون مسوّغ نظامي مشروع.

**ثانياً: الأساس النظامي**

**الدفع الأول: بطلان الإنهاء لعدم الإشعار المسبق**
استناداً إلى المادة (٧٧) من نظام العمل الصادر بالمرسوم الملكي رقم (م/٥١)، يلتزم صاحب العمل بإشعار العامل قبل الإنهاء بمدة لا تقل عن ثلاثين يوماً.

**الدفع الثاني: استحقاق مكافأة نهاية الخدمة كاملة**
وفقاً للمادتين (٨٤) و(٨٨) من نظام العمل، يستحق الموكل مكافأة نهاية خدمة كاملة عن سنوات عمله.

**الدفع الثالث: التعويض عن الضرر**
يحق للموكل وفقاً للمادة (٧٧) المطالبة بتعويض عن الضرر الناتج عن الإنهاء غير المشروع.

**ثالثاً: الطلبات**
نلتمس من عدالتكم الحكم بما يلي:
١. إلزام المدعى عليها بأجر المدة المتبقية من العقد
٢. مكافأة نهاية الخدمة كاملة
٣. التعويض عن الفصل التعسفي
٤. بدل الإجازات غير المستخدمة

والله يحفظكم ويرعاكم،`;
