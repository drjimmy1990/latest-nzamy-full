import {
  Briefcase, Buildings, Stamp, PencilSimple, Gavel, Globe,
  ChatCircle, FileText, Fire, Clock, CheckCircle,
  Hourglass, XCircle, CheckSquare,
} from "@phosphor-icons/react";
import type { ServiceCategory, ServiceRequest, ProviderOffer } from "./_types";

// ─── Provider Specialties ────────────────────────────────────────────────────────
export const MOCK_PROVIDER_SPECIALTIES: ServiceCategory[] = ["tawtheeq", "taqeeb"];

// ─── Categories ──────────────────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: "all"          as ServiceCategory, label: "كل الخدمات",         icon: Briefcase,    count: 248 },
  { id: "taqeeb"       as ServiceCategory, label: "تعقيب دوائر",        icon: Buildings,    count: 89  },
  { id: "tawtheeq"     as ServiceCategory, label: "توثيق ووكالات",      icon: Stamp,        count: 64  },
  { id: "drafting"     as ServiceCategory, label: "صياغة قانونية",      icon: PencilSimple, count: 47  },
  { id: "arbitration"  as ServiceCategory, label: "تحكيم ووساطة",       icon: Gavel,        count: 19  },
  { id: "translation"  as ServiceCategory, label: "ترجمة قانونية",      icon: Globe,        count: 15  },
  { id: "consultation" as ServiceCategory, label: "استشارة متخصصة",    icon: ChatCircle,   count: 9   },
  { id: "court-rep"    as ServiceCategory, label: "تمثيل قضائي",        icon: FileText,     count: 5   },
];

export const CITIES = ["كل المدن", "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الأحساء", "تبوك", "القصيم"];

// ─── خدمات متاحة للأفراد فقط ─────────────────────────────────────────────
// مبنية على: تحليل المنافسين (بينة · شورى · إياس) + احتياجات الأفراد الفعلية
export const LETTER_TYPES = [
  { id: "consult",     label: "استشارة قانونية متخصصة",  desc: "اسأل محامياً مرخصاً في تخصصك" },
  { id: "warning",     label: "إنذار قانوني رسمي",       desc: "للديون والحقوق والعقود المخلوفة" },
  { id: "tawtheeq",   label: "توثيق ووكالة قانونية",    desc: "توثيق عقد، وكالة، إقرار" },
  { id: "review",     label: "مراجعة عقد وكشف مخاطر",  desc: "قبل التوقيع — حماية حقوقك" },
  { id: "court",      label: "تمثيل قضائي (توكيل)",     desc: "محامٍ يمثلك أمام المحكمة" },
  { id: "translate",  label: "ترجمة قانونية معتمدة",    desc: "ترجمة عقود ووثائق من/إلى العربية" },
  { id: "inheritance",label: "قسمة تركة وميراث",        desc: "تقسيم التركة وحصر الورثة" },
  { id: "enforce",    label: "متابعة تنفيذ حكم قضائي", desc: "تنفيذ الأحكام والقرارات" },
];

// ─── Config ───────────────────────────────────────────────────────────────────────
export const URGENCY = {
  urgent:   { label: "عاجل", color: "text-red-500",    bg: "bg-red-500/10",    icon: Fire },
  normal:   { label: "عادي", color: "text-blue-500",   bg: "bg-blue-500/10",   icon: Clock },
  flexible: { label: "مرن",  color: "text-emerald-500",bg: "bg-emerald-500/10",icon: CheckCircle },
};

export const STATUS_CFG = {
  open:          { label: "مفتوح للعروض", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
  "in-progress": { label: "جارٍ التنفيذ", color: "text-blue-500",    bg: "bg-blue-500/10",    icon: Hourglass },
  completed:     { label: "مكتمل",        color: "text-gray-400",    bg: "bg-gray-400/10",     icon: CheckSquare },
  cancelled:     { label: "ملغي",          color: "text-red-400",     bg: "bg-red-400/10",      icon: XCircle },
};

export const OFFER_STATUS_CFG = {
  pending:     { label: "قيد المراجعة", color: "text-amber-500",   bg: "bg-amber-500/10",   icon: Hourglass },
  accepted:    { label: "مقبول — جارٍ", color: "text-blue-500",    bg: "bg-blue-500/10",    icon: CheckCircle },
  rejected:    { label: "مرفوض",         color: "text-red-400",    bg: "bg-red-400/10",     icon: XCircle },
  "in-progress":{ label: "جارٍ التنفيذ",color: "text-purple-500",  bg: "bg-purple-500/10",  icon: Hourglass },
  completed:   { label: "مكتمل ✓",       color: "text-emerald-500",bg: "bg-emerald-500/10", icon: CheckSquare },
};

export const REQUESTER_TYPE_LABEL = {
  lawyer: "محامي فرد", firm: "مكتب محاماة", corporate: "شركة", micro: "منشأة صغيرة", individual: "عميل فرد",
};

export const STATS_GENERAL = [
  { label: "طلب نشط",     value: "248",   sub: "هذا الأسبوع" },
  { label: "مزود خدمة",   value: "1,240", sub: "موثّق على المنصة" },
  { label: "صفقة مكتملة", value: "4,800", sub: "منذ الإطلاق" },
  { label: "متوسط التقييم",value: "4.8 ★", sub: "لمزودي الخدمة" },
];

// ─── Mock Data ───────────────────────────────────────────────────────────────
export const ALL_REQUESTS: ServiceRequest[] = [
  {
    id: 1, category: "tawtheeq",
    title: "مطلوب مُعقِّب لتوثيق وكالة من سجين في سجن الحائر بالرياض",
    description: "نحتاج توثيق وكالة خاصة لأحد موكلينا المحتجزين في سجن الحائر. المطلوب التنسيق مع إدارة السجن والتوثيق الشرعي ثم إرسال الوكالة المعتمدة.",
    city: "الرياض", urgency: "urgent",
    budgetMin: 300, budgetMax: 600,
    postedBy: "أ. فهد المطيري (محامي متقدم)", postedByType: "lawyer", postedAt: "منذ ساعتين",
    status: "open", offersCount: 3, views: 47, isVerified: true,
    tags: ["وكالة خاصة", "سجن", "توثيق عاجل"],
    requiredSpecialties: ["tawtheeq", "taqeeb"],
  },
  {
    id: 2, category: "taqeeb",
    title: "مطلوب مُعقِّب لمتابعة قضية عمالية في محكمة العمل بجدة — الجلسة الثلاثاء",
    description: "لدينا قضية في محكمة العمل بجدة، الجلسة القادمة الثلاثاء. نحتاج مُعقِّباً لتسليم المذكرة والحضور والإفادة بما جرى.",
    city: "جدة", urgency: "urgent",
    budgetMin: 200, budgetMax: 400,
    postedBy: "مكتب العدل للمحاماة", postedByType: "firm", postedAt: "منذ ٥ ساعات",
    status: "open", offersCount: 7, views: 124, isVerified: true,
    tags: ["محكمة عمل", "تعقيب جلسة", "جدة"],
    requiredSpecialties: ["taqeeb"],
  },
  {
    id: 3, category: "drafting",
    title: "مطلوب مستشار لصياغة مذكرة أسباب استئناف — قضية تجارية",
    description: "لدينا حكم ابتدائي ونحتاج مذكرة أسباب استئناف مدروسة باللغة القانونية الدقيقة أمام محكمة الاستئناف التجارية. المدة المتاحة 10 أيام.",
    city: "الرياض", urgency: "normal",
    budgetMin: 800, budgetMax: 2000,
    postedBy: "أ. سارة القحطاني", postedByType: "lawyer", postedAt: "منذ يوم",
    status: "open", offersCount: 4, views: 98, isVerified: true,
    tags: ["استئناف تجاري", "صياغة مذكرة", "10 أيام"],
    requiredSpecialties: ["drafting", "court-rep"],
  },
  {
    id: 4, category: "taqeeb",
    title: "مراجعة ملف إيقاف خدمات مؤسسة — وزارة الموارد البشرية — الرياض",
    description: "نحتاج مُعقِّباً لمتابعة ملف رفع إيقاف الخدمات عن مؤسستنا من وزارة الموارد البشرية. الملف جاهز والوثائق مكتملة.",
    city: "الرياض", urgency: "urgent",
    budgetMin: 400, budgetMax: 700,
    postedBy: "شركة البناء الحديث", postedByType: "corporate", postedAt: "منذ ٣ أيام",
    status: "in-progress", offersCount: 2, views: 76, isVerified: false,
    tags: ["موارد بشرية", "إيقاف خدمات", "مؤسسة"],
    requiredSpecialties: ["taqeeb"],
  },
  {
    id: 5, category: "translation",
    title: "ترجمة قانونية معتمدة لعقد تجاري (إنجليزي → عربي) — 12 صفحة",
    description: "عقد شراكة تجارية دولية بالإنجليزية، نحتاج ترجمته القانونية المعتمدة للعربية. ١٢ صفحة تقريباً. نفضل مترجماً معتمداً من وزارة العدل.",
    city: "الدمام", urgency: "normal",
    budgetMin: 300, budgetMax: 600,
    postedBy: "أ. خالد المطيري", postedByType: "lawyer", postedAt: "منذ ٤ أيام",
    status: "open", offersCount: 6, views: 89, isVerified: true,
    tags: ["ترجمة معتمدة", "عقد تجاري", "عربي-إنجليزي"],
    requiredSpecialties: ["translation"],
  },
  {
    id: 6, category: "arbitration",
    title: "مطلوب محكّم لنزاع تجاري بين شريكين — قيمة النزاع 850,000 ريال",
    description: "نزاع تجاري بين شريكين حول توزيع الأرباح وحقوق الإدارة. نفضل محكّماً ذو خبرة في قانون الشركات السعودي.",
    city: "جدة", urgency: "flexible",
    budgetMin: 3000, budgetMax: 8000,
    postedBy: "أ. أحمد الغامدي", postedByType: "lawyer", postedAt: "منذ أسبوع",
    status: "open", offersCount: 2, views: 157, isVerified: true,
    tags: ["تحكيم تجاري", "شركات", "850K نزاع"],
    requiredSpecialties: ["arbitration"],
  },
  {
    id: 7, category: "court-rep",
    title: "مطلوب محامي لحضور جلسة طلاق أمام محكمة الأسرة بالرياض — الأحد",
    description: "موكلتي خارج الرياض وتحتاج محامياً يحضر نيابةً عنها جلسة الإثنين في محكمة الأسرة.",
    city: "الرياض", urgency: "urgent",
    budgetMin: 500, budgetMax: 1000,
    postedBy: "أ. هند الشريف", postedByType: "lawyer", postedAt: "منذ ٦ ساعات",
    status: "open", offersCount: 1, views: 45, isVerified: true,
    tags: ["أحوال شخصية", "حضور جلسة", "الأسرة"],
    requiredSpecialties: ["court-rep"],
  },
  {
    id: 8, category: "consultation",
    title: "استشارة في نظام الإفلاس السعودي — حالة إعسار شركة صغيرة",
    description: "شركة ذات مسؤولية محدودة مدينة بمبالغ وتعجز عن السداد. نحتاج استشارة متخصصة في إجراءات الإفلاس.",
    city: "جدة", urgency: "normal",
    budgetMin: 500, budgetMax: 1500,
    postedBy: "محمد الزهراني (مدير)", postedByType: "corporate", postedAt: "منذ يومين",
    status: "open", offersCount: 3, views: 62, isVerified: false,
    tags: ["إفلاس", "إعسار", "ذمم مدينة"],
    requiredSpecialties: ["consultation", "court-rep"],
  },
];

export const MY_OFFERS: ProviderOffer[] = [
  {
    id: 201, requestId: 2,
    requestTitle: "مطلوب مُعقِّب لمتابعة قضية عمالية في محكمة العمل بجدة — الجلسة الثلاثاء",
    requestCategory: "taqeeb",
    requesterName: "مكتب العدل للمحاماة", requesterType: "firm",
    city: "جدة", offerAmount: 350,
    message: "لديّ خبرة ٥ سنوات في محاكم جدة، أتعهد بالحضور والإفادة الكاملة.",
    submittedAt: "منذ ٣ ساعات", status: "pending", requestUrgency: "urgent",
  },
  {
    id: 202, requestId: 1,
    requestTitle: "مطلوب مُعقِّب لتوثيق وكالة من سجين في سجن الحائر بالرياض",
    requestCategory: "tawtheeq",
    requesterName: "أ. فهد المطيري", requesterType: "lawyer",
    city: "الرياض", offerAmount: 450,
    message: "معي تصريح الدخول للمنشآت الإصلاحية وخبرة في التوثيق الطارئ.",
    submittedAt: "منذ يوم", status: "accepted", requestUrgency: "urgent",
  },
  {
    id: 203, requestId: 4,
    requestTitle: "مراجعة ملف إيقاف خدمات مؤسسة — وزارة الموارد البشرية — الرياض",
    requestCategory: "taqeeb",
    requesterName: "شركة البناء الحديث", requesterType: "corporate",
    city: "الرياض", offerAmount: 550,
    message: "لديّ علاقات جيدة مع وزارة الموارد البشرية وخبرة في ملفات الإيقاف.",
    submittedAt: "منذ ٤ أيام", status: "completed", requestUrgency: "urgent",
  },
  {
    id: 204, requestId: 5,
    requestTitle: "ترجمة قانونية معتمدة لعقد تجاري — 12 صفحة",
    requestCategory: "translation",
    requesterName: "أ. خالد المطيري", requesterType: "lawyer",
    city: "الدمام", offerAmount: 400,
    message: "معتمد من وزارة العدل، أنجز في ٣ أيام.",
    submittedAt: "منذ ٥ أيام", status: "rejected", requestUrgency: "normal",
  },
];

export const MY_REQUESTS: ServiceRequest[] = [
  {
    id: 101, category: "tawtheeq",
    title: "مطلوب موثق لعقد بيع عقار في الرياض",
    description: "نحتاج توثيق عقد بيع شقة سكنية.",
    city: "الرياض", urgency: "normal",
    budgetMin: 200, budgetMax: 500,
    postedBy: "أنت", postedByType: "lawyer", postedAt: "منذ ٣ أيام",
    status: "in-progress", offersCount: 4, views: 32, isVerified: true,
    tags: ["توثيق", "عقار"],
    requiredSpecialties: ["tawtheeq"],
  },
  {
    id: 102, category: "taqeeb",
    title: "تعقيب ملف ترخيص لدى وزارة التجارة — الرياض",
    description: "نحتاج متابعة ملف ترخيص شركة.",
    city: "الرياض", urgency: "urgent",
    budgetMin: 300, budgetMax: 500,
    postedBy: "أنت", postedByType: "lawyer", postedAt: "منذ أسبوع",
    status: "completed", offersCount: 3, views: 55, isVerified: true,
    tags: ["تعقيب", "ترخيص"],
    requiredSpecialties: ["taqeeb"],
  },
];
