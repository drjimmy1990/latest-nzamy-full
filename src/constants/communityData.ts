import {
  BookOpen, Briefcase, Scales, House, Warning, Users,
} from "@phosphor-icons/react";

// ─── Types ──────────────────────────────────────────────────────────────────
export type CommunityTab = "public" | "lawyers";
export type Category = "all" | "labor" | "commercial" | "civil" | "criminal" | "family" | "real-estate";
export type SortMode = "hot" | "new" | "top";

export interface Question {
  id: number;
  tab: CommunityTab;
  category: Category;
  title: string;
  body?: string;
  asker: string;
  askerType: "guest" | "user" | "lawyer";
  askerRating?: number;
  answers: Answer[];
  views: number;
  votes: number;
  isAnswered: boolean;
  ago: string;
  tags: string[];
}

export interface Answer {
  id: number;
  author: string;
  authorType: "lawyer" | "user";
  authorRating: number;    // ★ عدد التقييمات الإيجابية
  authorYears?: number;    // سنوات الخبرة
  content: string;
  votes: number;
  isAccepted: boolean;
  ago: string;
}

// ─── Categories ─────────────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: "all"         as Category, label: "الكل",             icon: BookOpen,  count: 1284 },
  { id: "labor"       as Category, label: "عمالي",            icon: Briefcase, count: 412  },
  { id: "commercial"  as Category, label: "تجاري",            icon: Scales,    count: 331  },
  { id: "civil"       as Category, label: "مدني",             icon: House,     count: 287  },
  { id: "criminal"    as Category, label: "جنائي",            icon: Warning,   count: 124  },
  { id: "family"      as Category, label: "أحوال شخصية",     icon: Users,     count: 89   },
  { id: "real-estate" as Category, label: "عقاري",            icon: House,     count: 41   },
];

// ─── Mock Questions ──────────────────────────────────────────────────────────
export const ALL_QUESTIONS: Question[] = [
  // ── Public Questions (tab: "public") ──────────────────────────────────────
  {
    id: 1, tab: "public", category: "labor",
    title: "هل يحق لصاحب العمل خصم من الراتب بسبب التأخر عن الدوام؟",
    asker: "زائر-3471", askerType: "guest",
    views: 312, votes: 24, isAnswered: true, ago: "منذ ٣ ساعات",
    tags: ["عقود عمل", "خصم راتب"],
    answers: [
      {
        id: 1, author: "أ. أحمد الغامدي", authorType: "lawyer",
        authorRating: 127, authorYears: 11,
        content: "نعم، يحق لصاحب العمل الخصم وفق المادة ٨٢ من نظام العمل، بشرط أن لا يتجاوز الخصم ربع الراتب الشهري، وأن يُنبَّه العامل مسبقاً.",
        votes: 38, isAccepted: true, ago: "منذ ٢ ساعتين",
      },
      {
        id: 2, author: "أ. سارة العتيبي", authorType: "lawyer",
        authorRating: 89, authorYears: 7,
        content: "تأكد من النظر في عقد العمل وإذا كان الخصم مذكوراً صراحةً. في غياب ذلك، يُستلزم إنذار رسمي أولاً.",
        votes: 21, isAccepted: false, ago: "منذ ٢.٥ ساعة",
      },
      {
        id: 3, author: "خالد س.", authorType: "user",
        authorRating: 3,
        content: "مررت بنفس الموقف وكلمت المحكمة العمالية ووقفوا معي.",
        votes: 5, isAccepted: false, ago: "منذ ساعة",
      },
    ],
  },
  {
    id: 2, tab: "public", category: "commercial",
    title: "شريكي رفض توزيع الأرباح رغم أن الشركة حققت مكاسب — ماذا أفعل؟",
    asker: "أ. فهد المطيري", askerType: "user",
    views: 198, votes: 17, isAnswered: false, ago: "منذ ٥ ساعات",
    tags: ["شركات", "توزيع أرباح"],
    answers: [
      {
        id: 4, author: "أ. خالد المطيري", authorType: "lawyer",
        authorRating: 74, authorYears: 9,
        content: "بناءً على نظام الشركات السعودي، يحق لك المطالبة بحصتك من الأرباح أمام المحكمة التجارية. يُنصح بمراسلة الشريك رسمياً أولاً وتوثيق الرفض.",
        votes: 14, isAccepted: false, ago: "منذ ٤ ساعات",
      },
    ],
  },
  {
    id: 3, tab: "public", category: "labor",
    title: "تم فصلي تعسفياً بعد 6 سنوات — ما التعويض المستحق لي؟",
    asker: "مستخدم مجهول", askerType: "user",
    views: 521, votes: 38, isAnswered: true, ago: "منذ يوم",
    tags: ["فصل تعسفي", "تعويض"],
    answers: [
      {
        id: 5, author: "أ. أحمد الغامدي", authorType: "lawyer",
        authorRating: 127, authorYears: 11,
        content: "في حالة الفصل التعسفي يُستحق: مكافأة نهاية الخدمة + تعويض الإشعار (شهر/سنة خدمة لمن لم يُشعَر) + تعويض الفصل التعسفي (شهرين/سنة خبرة كحد أقصى). مع 6 سنوات، التعويض يمكن أن يكون بين 9 و18 شهراً.",
        votes: 52, isAccepted: true, ago: "منذ ٢٢ ساعة",
      },
    ],
  },
  {
    id: 4, tab: "public", category: "family",
    title: "ما إجراءات التقدم بطلب حضانة الأطفال في المحكمة؟",
    asker: "مستخدمة مجهولة", askerType: "user",
    views: 234, votes: 19, isAnswered: true, ago: "منذ ٤ أيام",
    tags: ["أحوال شخصية", "حضانة"],
    answers: [
      {
        id: 6, author: "أ. سارة العتيبي", authorType: "lawyer",
        authorRating: 89, authorYears: 7,
        content: "تقدم بطلب حضانة عبر بوابة ناجز، تختار محكمة الأحوال الشخصية بمنطقتك. احرص على توثيق الوضع المادي والسكني وأي وثائق تثبت مصلحة الأطفال.",
        votes: 29, isAccepted: true, ago: "منذ ٣ أيام",
      },
    ],
  },

  // ── Lawyers-only Questions (tab: "lawyers") ───────────────────────────────
  {
    id: 10, tab: "lawyers", category: "civil",
    title: "هل ينقطع التقادم بمجرد إيداع صحيفة الدعوى أم بتبليغها للمدعى عليه؟",
    asker: "أ. فهد العتيبي", askerType: "lawyer", askerRating: 57,
    views: 84, votes: 12, isAnswered: true, ago: "منذ ٦ ساعات",
    tags: ["تقادم", "إجراءات مدنية"],
    answers: [
      {
        id: 11, author: "أ. خالد المطيري", authorType: "lawyer",
        authorRating: 74, authorYears: 9,
        content: "وفق المادة ٧٤ من نظام المرافعات، الانقطاع يحدث بمجرد إيداع صحيفة الدعوى، لكن يزول أثره إذا انقضت الدعوى أو سقطت لأي سبب قانوني.",
        votes: 18, isAccepted: true, ago: "منذ ٥ ساعات",
      },
    ],
  },
  {
    id: 11, tab: "lawyers", category: "commercial",
    title: "تجربتكم في إثبات الوكالة الضمنية أمام المحكمة التجارية؟",
    asker: "أ. سارة القحطاني", askerType: "lawyer", askerRating: 31,
    views: 67, votes: 9, isAnswered: false, ago: "منذ ١٢ ساعة",
    tags: ["وكالة", "إثبات", "تجاري"],
    answers: [
      {
        id: 12, author: "أ. أحمد الغامدي", authorType: "lawyer",
        authorRating: 127, authorYears: 11,
        content: "اعتمدت في قضية مماثلة على: المراسلات الرسمية، حضور التفاوضات، وأي مستند يُثبت العلم والموافقة الضمنية. المحكمة التجارية تقبل القرائن في هذا الشأن.",
        votes: 11, isAccepted: false, ago: "منذ ١٠ ساعات",
      },
    ],
  },
];

// ─── Sort answers: lawyers first (by rating), then users ────────────────────
export function sortAnswers(answers: Answer[]): Answer[] {
  const lawyers = answers
    .filter(a => a.authorType === "lawyer")
    .sort((a, b) => b.authorRating - a.authorRating);
  const users = answers
    .filter(a => a.authorType === "user")
    .sort((a, b) => b.votes - a.votes);
  return [...lawyers, ...users];
}

// ─── Top Contributors ────────────────────────────────────────────────────────
export const TOP_CONTRIBUTORS = [
  { name: "أ. أحمد الغامدي",  rating: 127, specialty: "عمالي",  answers: 127 },
  { name: "أ. سارة العتيبي",  rating: 89,  specialty: "مدني",   answers: 89  },
  { name: "أ. خالد المطيري",  rating: 74,  specialty: "تجاري",  answers: 74  },
];
