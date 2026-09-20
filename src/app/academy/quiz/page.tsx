"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Brain, Trophy, Clock, ShareNetwork,
  ArrowRight, ArrowLeft, CheckCircle, XCircle,
  Medal, Star, Sparkle, Scales, MagnifyingGlass,
  TreeStructure, HourglassHigh, Compass, Check,
  WarningCircle, ArrowCounterClockwise,
  Gavel, Fire, Eye, BookOpen, Funnel, ListChecks,
  Stack, ShieldCheck, GameController, Crown, Users,
  Lightning, TrendUp, ArrowsIn, ArrowsOut, Lightbulb,
  FileText, Stamp, LinkedinLogo, TwitterLogo, Copy,
  Infinity as InfinityIcon
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import confetti from "canvas-confetti";
import { ACADEMY_CATEGORIES } from "@/data/academy/categories";
import { ACADEMY_QUESTIONS } from "@/data/academy/questions";
import { AcademyCategoryId, DifficultyLevel } from "@/types/academy";

// ─── Types & Modes ───────────────────────────────────────────────────────────

export type QuestionStyle = "all" | "mcq" | "redlining" | "scenario" | "timeline" | "jurisdiction";
export type GameMode = "standard" | "survival" | "endless";

const QUESTION_STYLES = [
  { id: "all", label: "🌟 مزيج شامل (All Styles)", desc: "تجربة متكاملة تجمع كافة الأساليب", icon: Stack },
  { id: "mcq", label: "⚡ اختيار من متعدد", desc: "أسئلة معرفية مستخرجة من مواد الأنظمة", icon: Brain },
  { id: "redlining", label: "🔍 صائد الثغرات العقودية", desc: "اكتشاف الشروط الباطلة في العقود", icon: MagnifyingGlass },
  { id: "scenario", label: "🌳 محاكاة القضايا", desc: "اتخاذ قرارات تكتيكية في نزاع متسلسل", icon: TreeStructure },
  { id: "timeline", label: "⏳ الترتيب الزمني للإجراءات", desc: "ضبط المواعيد وتسلسل الخطوات", icon: HourglassHigh },
  { id: "jurisdiction", label: "⚖️ بوصلة الاختصاص القضائي", desc: "تكييف النزاع وتحديد المحكمة المختصة", icon: Compass },
] as const;

// ─── Initial Leaderboard Data ────────────────────────────────────────────────

interface LeaderboardUser {
  rank: number;
  name: string;
  title: string;
  points: number;
  accuracy: number;
  streak: number;
  badge: string;
  category: string;
  isCurrentUser?: boolean;
}

const INITIAL_LEADERBOARD: LeaderboardUser[] = [
  { rank: 1, name: "المستشار / عبد العزيز السبيعي", title: "محامٍ ومحكم معتمد", points: 4850, accuracy: 96, streak: 28, badge: "فارس المرافعات 👑", category: "القسم الإجرائي والتجاري" },
  { rank: 2, name: "أ. سارة الرويلي", title: "مستشارة حوكمة وشركات", points: 4320, accuracy: 94, streak: 22, badge: "صائدة الثغرات 🔍", category: "القسم التجاري والشركات" },
  { rank: 3, name: "د. خالد المهيدب", title: "أكاديمي وباحث في الأنظمة", points: 3980, accuracy: 91, streak: 19, badge: "خبير الإثبات ⚖️", category: "قسم المعاملات المدنية" },
  { rank: 4, name: "المحامي / تركي القحطاني", title: "أخصائي منازعات عمالية", points: 3450, accuracy: 89, streak: 15, badge: "مستشار العمل 🛡️", category: "القسم العمالي" },
  { rank: 5, name: "أ. نورة الغامدي", title: "محامية متدربة", points: 3100, accuracy: 88, streak: 14, badge: "درع الأنظمة ⚡", category: "الملكية الفكرية" },
  { rank: 6, name: "المحامي / فهد الدوسري", title: "محامٍ ممارس", points: 2890, accuracy: 85, streak: 12, badge: "حارس الإجراءات ⏳", category: "القسم الجنائي" },
  { rank: 7, name: "أ. مشعل الحربي", title: "مستشار عقود عقارية", points: 2640, accuracy: 83, streak: 10, badge: "خبير العقار 🏢", category: "القسم العقاري" },
];

// ─── Unified Question Item Type ──────────────────────────────────────────────

export type UnifiedQuizItem =
  | {
      type: "mcq";
      id: string;
      categoryNumber: string;
      categoryName: string;
      lawName: string;
      articleNumber: string;
      question: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
      statutoryCitation: { instrument: string; article: string; textSnippet: string };
      trapInsight?: string;
      practicalTip?: string;
    }
  | {
      type: "redlining";
      id: string;
      categoryNumber: string;
      categoryName: string;
      lawName: string;
      articleNumber: string;
      question: string;
      clauseSegments: { id?: number; text: string; isBug: boolean; reason?: string }[];
      requiredFlawIds: number[];
      explanation: string;
      statutoryCitation: { instrument: string; article: string; textSnippet: string };
      trapInsight?: string;
      practicalTip?: string;
    }
  | {
      type: "scenario";
      id: string;
      categoryNumber: string;
      categoryName: string;
      lawName: string;
      articleNumber: string;
      title: string;
      desc: string;
      choices: { id: number; text: string; isCorrect: boolean; feedback: string }[];
      statutoryCitation: { instrument: string; article: string; textSnippet: string };
      trapInsight?: string;
      practicalTip?: string;
    }
  | {
      type: "timeline";
      id: string;
      categoryNumber: string;
      categoryName: string;
      lawName: string;
      articleNumber: string;
      question: string;
      initialOrder: string[];
      correctOrder: string[];
      explanation: string;
      statutoryCitation: { instrument: string; article: string; textSnippet: string };
      trapInsight?: string;
      practicalTip?: string;
    }
  | {
      type: "jurisdiction";
      id: string;
      categoryNumber: string;
      categoryName: string;
      lawName: string;
      articleNumber: string;
      question: string;
      courts: { id: string; label: string }[];
      disputes: { id: string; text: string; correctCourt: string }[];
      explanation: string;
      statutoryCitation: { instrument: string; article: string; textSnippet: string };
      trapInsight?: string;
      practicalTip?: string;
    };

// ─── Interactive Curated Pool ────────────────────────────────────────────────

const CURATED_INTERACTIVE_ITEMS: UnifiedQuizItem[] = [
  {
    type: "redlining",
    id: "q_red_1",
    categoryNumber: "06",
    categoryName: "القسم العمالي",
    lawName: "نظام العمل السعودي",
    articleNumber: "المادة 83",
    question: "انقر على العبارات أو الشروط الباطلة نظاماً في بند عدم المنافسة التالي:",
    clauseSegments: [
      { text: "يتعهد الطرف الثاني (العامل) في حال انتهاء العقد لأي سبب، بألا يمارس أي عمل منافس للطرف الأول في ", isBug: false },
      { id: 1, text: "«كافة مناطق الشرق الأوسط والخليج العربي»", isBug: true, reason: "بطلان إطلاق النطاق الجغرافي دون تحديد مقيد" },
      { text: "، على أن يستمر هذا الالتزام لمدة ", isBug: false },
      { id: 2, text: "«خمس سنوات ميلادية كاملة»", isBug: true, reason: "الحد الأقصى لشرط عدم المنافسة هو سنتان فقط" },
      { text: " تبدأ فور انقضاء العلاقة التعاقدية بين الطرفين.", isBug: false }
    ],
    requiredFlawIds: [1, 2],
    explanation: "يشترط نظام العمل في المادة (83) ألا تزيد مدة شرط عدم المنافسة على سنتين، وأن يكون النطاق المكاني مقيداً بالقدر الضروري لحماية صاحب العمل.",
    statutoryCitation: {
      instrument: "نظام العمل الصادر بالمرسوم الملكي (م/51)",
      article: "المادة الثالثة والثمانون",
      textSnippet: "يجب ألا تزيد مدته على سنتين، وأن يكون مقيداً من حيث المكان ونوع العمل..."
    },
    trapInsight: "يخطئ الكثير من أصحاب العمل بصياغة شروط مانعة مطلقة جغرافياً أو زمنياً، مما يجعل الشرط باطلاً بطلاناً مطلقاً أمام المحكمة العمالية.",
    practicalTip: "عند صياغة العقد، احرص على حصر النطاق في (المدينة أو المنطقة الإدارية التي يعمل بها الموظف فعلياً) ولمدة لا تتجاوز 24 شهراً."
  },
  {
    type: "scenario",
    id: "q_scen_1",
    categoryNumber: "00",
    categoryName: "القسم الإجرائي والعمالي",
    lawName: "نظام المرافعات ونظام العمل",
    articleNumber: "قواعد التسوية الودية والمادة 77",
    title: "محاكاة نزاع عمالي — المحطة الإجرائية الأولى",
    desc: "جاءك موظف سعودي براتب 20,000 ريال، تم فصله فصلاً تعسفياً من شركة كبرى. ما هي خطوتك الإجرائية الأولى كمحامٍ؟",
    choices: [
      { id: 1, text: "رفع دعوى مباشرة أمام المحكمة العمالية عبر بوابة ناجز", isCorrect: false, feedback: "❌ خطأ إجرائي: المحكمة سترد الدعوى لعدم استيفاء قيد التسوية الودية الوجوبي." },
      { id: 2, text: "تقديم طلب تسوية ودية عبر منصة 'ودي' بوزارة الموارد البشرية", isCorrect: true, feedback: "✅ إجراء سليم 100%! يشترط النظام سلوك مسار التسوية الودية أولاً لمدة 21 يوماً." }
    ],
    statutoryCitation: {
      instrument: "اللائحة التنفيذية لنظام العمل وقواعد التسوية الودية",
      article: "المادة الرابعة والأربعون بعد المائتين",
      textSnippet: "ترفع الدعاوى العمالية إلى مكتب العمل المختص لإجراء التسوية الودية قبل إحالتها للمحكمة..."
    },
    trapInsight: "رفع الدعوى أمام المحكمة العمالية قبل محضر تعذر التسوية الودية هو سبب وجوبي لعدم قبول الدعوى شكلاً.",
    practicalTip: "سجّل تاريخ تقديم طلب التسوية؛ فإن انقضت (21 يوماً) عمل دون صلح، يحال الملف إلكترونياً للمحكمة العمالية فوراً."
  },
  {
    type: "timeline",
    id: "q_time_1",
    categoryNumber: "00",
    categoryName: "القسم الإجرائي والتنفيذي",
    lawName: "نظام التنفيذ 1433هـ",
    articleNumber: "المادتان 34 و 46",
    question: "رتّب الإجراءات التنفيذية من تقديم السند حتى التنفيذ الجبري على المدين المماطل:",
    initialOrder: [
      "الحجز التنفيذي على الأموال المنقولة والعقارات وتسييلها بالمزاد",
      "تقديم طلب التنفيذ الإلكتروني مستنداً لسند تنفيذي صحيح",
      "صدور قرارات المادة 46 (الإفصاح عن الأصول، المنع من السفر، تجميد الحسابات)",
      "إبلاغ المنفذ ضده بأمر التنفيذ ومنحه مهلة (5 أيام) للسداد وفق المادة 34"
    ],
    correctOrder: [
      "تقديم طلب التنفيذ الإلكتروني مستنداً لسند تنفيذي صحيح",
      "إبلاغ المنفذ ضده بأمر التنفيذ ومنحه مهلة (5 أيام) للسداد وفق المادة 34",
      "صدور قرارات المادة 46 (الإفصاح عن الأصول، المنع من السفر، تجميد الحسابات)",
      "الحجز التنفيذي على الأموال المنقولة والعقارات وتسييلها بالمزاد"
    ],
    explanation: "التسلسل الإلزامي في نظام التنفيذ: تقديم السند ⬅️ إشعار م/34 بمهلة 5 أيام ⬅️ قرارات م/46 الجبرية ⬅️ الحجز والبيع.",
    statutoryCitation: {
      instrument: "نظام التنفيذ ولائحته التنفيذية",
      article: "المادتان (34) و (46)",
      textSnippet: "يبلغ قاضي التنفيذ المدين بأمر التنفيذ، فإذا لم يسدد خلال خمسة أيام جاز تطبيق إجراءات المادة 46..."
    },
    trapInsight: "لا يجوز طلب أو إيقاع إجراءات المادة 46 قبل استنفاد مهلة الأيام الخمسة من تاريخ إبلاغ أمر التنفيذ (المادة 34).",
    practicalTip: "تأكد من قيد عنوان المنفذ ضده في العنوان الوطني المعتمد لضمان صحة التبليغ الإلكتروني قانوناً."
  },
  {
    type: "jurisdiction",
    id: "q_jur_1",
    categoryNumber: "00",
    categoryName: "القسم الإجرائي والقضائي",
    lawName: "نظام القضاء ونظام المحاكم التجارية",
    articleNumber: "قواعد الاختصاص النوعي والولائي",
    question: "حدد المحكمة أو اللجنة شبه القضائية المختصة بنظر كل نزاع من النزاعات التالية:",
    courts: [
      { id: "admin", label: "🏛️ المحكمة الإدارية (ديوان المظالم)" },
      { id: "commercial", label: "🏢 المحكمة التجارية" },
      { id: "banking", label: "🏦 لجنة المنازعات المصرفية" },
      { id: "general", label: "⚖️ المحكمة العامة" }
    ],
    disputes: [
      { id: "d1", text: "طعن موظف حكومي في قرار ترقية صادر بحقه", correctCourt: "admin" },
      { id: "d2", text: "نزاع بين شريكين في شركة ذات مسؤولية محدودة على توزيع الأرباح", correctCourt: "commercial" },
      { id: "d3", text: "مطالبة عميل بإلغاء فوائد تمويل عقاري مرابحة فرضها البنك دون سند", correctCourt: "banking" },
      { id: "d4", text: "مطالبة مقاول مواطناً بمبلغ 70 ألف ريال متبقية من بناء فيلا سكنية خاصة", correctCourt: "general" }
    ],
    explanation: "لكل جهة قضائية اختصاص نوعي ولائي محدد بموجب الأنظمة؛ الطعن في القرارات الإدارية للمحكمة الإدارية، ونزاعات الشركات للمحكمة التجارية، والنزاع البنكي للجنة المصرفية، والمقاولات السكنية للمحكمة العامة.",
    statutoryCitation: {
      instrument: "نظام المرافعات الشرعية ونظام ديوان المظالم",
      article: "المادة الحادية والثلاثون",
      textSnippet: "تختص المحاكم بنظر الدعاوى وفق قواعد الاختصاص النوعي والولائي المحددة في النظام..."
    },
    trapInsight: "عقود مقاولات المباني السكنية للأفراد تخرج من اختصاص المحكمة التجارية وتدخل في اختصاص المحكمة العامة.",
    practicalTip: "الدفع بعدم الاختصاص النوعي أو الولائي من النظام العام، يجوز إبداؤه في أي مرحلة تكون عليها الدعوى."
  }
];

// ─── Sound Effects ────────────────────────────────────────────────────────────

const playSound = (type: "correct" | "wrong" | "finish" | "gameover") => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === "correct") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === "wrong") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === "finish") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3);
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.45);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.2);
    } else if (type === "gameover") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.6);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch {}
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function QuizPage() {
  const { isDark } = useTheme();

  // Master Active Tab (Challenges vs. Leaderboard vs. Vault Explorer)
  const [activeTab, setActiveTab] = useState<"quiz" | "leaderboard" | "vault_explorer">("quiz");

  // Zen Courtroom Focus Mode
  const [isZenMode, setIsZenMode] = useState(false);

  // Setup Screen State
  const [stage, setStage] = useState<"setup" | "playing" | "result">("setup");
  const [gameMode, setGameMode] = useState<GameMode>("survival"); // Default to True Survival!
  const [selectedCategories, setSelectedCategories] = useState<AcademyCategoryId[]>(["all"]);
  const [selectedStyle, setSelectedStyle] = useState<QuestionStyle>("all");
  const [questionsCount, setQuestionsCount] = useState<number>(15);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | "all">("all");

  // Legal-Themed Gamification State (مطارق الحصانة القضائية ⚖️🔨)
  const [gavels, setGavels] = useState(5);
  const [maxGavels] = useState(5);
  const [streak, setStreak] = useState(0);
  const [highestStreak, setHighestStreak] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>(INITIAL_LEADERBOARD);
  const [leaderboardTimeframe, setLeaderboardTimeframe] = useState<"weekly" | "monthly" | "allTime">("weekly");

  // Play State
  const [quizQuestions, setQuizQuestions] = useState<UnifiedQuizItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isQuestionAnswered, setIsQuestionAnswered] = useState(false);
  const [isQuestionCorrect, setIsQuestionCorrect] = useState(false);

  // Interaction State
  const [mcqChoice, setMcqChoice] = useState<number | null>(null);
  const [redliningSelected, setRedliningSelected] = useState<number[]>([]);
  const [scenarioChoice, setScenarioChoice] = useState<number | null>(null);
  const [timelineItems, setTimelineItems] = useState<string[]>([]);
  const [jurisdictionMap, setJurisdictionMap] = useState<Record<string, string>>({});

  // Vault Explorer State
  const [vaultTree, setVaultTree] = useState<any[]>([]);
  const [selectedVaultSection, setSelectedVaultSection] = useState<string>("00");
  const [sectionLaws, setSectionLaws] = useState<any[]>([]);
  const [selectedLaw, setSelectedLaw] = useState<string>("");
  const [lawQuestions, setLawQuestions] = useState<any[]>([]);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (stage === "playing" && !isGameOver) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [stage, isGameOver]);

  // Load Vault Explorer Tree
  useEffect(() => {
    if (activeTab === "vault_explorer" && vaultTree.length === 0) {
      fetch("/api/v1/academy/vault-explorer")
        .then(res => res.json())
        .then(data => {
          if (data.sections) {
            setVaultTree(data.sections);
            loadVaultSection("00");
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const loadVaultSection = async (secId: string) => {
    setSelectedVaultSection(secId);
    setSelectedLaw("");
    setLawQuestions([]);
    setIsLoadingVault(true);
    try {
      const res = await fetch(`/api/v1/academy/vault-explorer?section=${secId}`);
      const data = await res.json();
      setSectionLaws(data.lawsSummary || []);
      if (data.sampleQuestions) {
        setLawQuestions(data.sampleQuestions);
      }
    } catch {}
    setIsLoadingVault(false);
  };

  const loadSpecificLaw = async (secId: string, lawSlug: string) => {
    setSelectedLaw(lawSlug);
    setIsLoadingVault(true);
    try {
      const res = await fetch(`/api/v1/academy/vault-explorer?section=${secId}&law=${encodeURIComponent(lawSlug)}`);
      const data = await res.json();
      setLawQuestions(data.questions || []);
    } catch {}
    setIsLoadingVault(false);
  };

  // Start Quiz (True Survival with NO question ceiling)
  const startQuiz = async () => {
    setIsGameOver(false);
    setGavels(5);
    setStreak(0);
    setHighestStreak(0);

    const isAll = selectedCategories.includes("all");
    let fetchedFromVault: UnifiedQuizItem[] = [];

    if (!isAll && selectedCategories.length === 1) {
      const targetCatId = selectedCategories[0];
      const catMeta = ACADEMY_CATEGORIES.find(c => c.id === targetCatId);
      if (catMeta && catMeta.categoryNumber !== "ALL") {
        try {
          const res = await fetch(`/api/v1/academy/vault-explorer?section=${catMeta.categoryNumber}`);
          const data = await res.json();
          if (data.sampleQuestions && Array.isArray(data.sampleQuestions)) {
            fetchedFromVault = data.sampleQuestions.map((q: any) => ({
              type: "mcq" as const,
              id: q.id,
              categoryNumber: q.categoryNumber || catMeta.categoryNumber,
              categoryName: q.categoryName || catMeta.label,
              lawName: q.lawName || "نظام معتمد",
              articleNumber: q.articleNumber || "المادة النظامية",
              question: q.question,
              options: q.options || ["صحيح", "خطأ"],
              correctAnswer: q.correctAnswer ?? 0,
              explanation: q.explanation || "",
              statutoryCitation: q.statutoryCitation || { instrument: q.lawName, article: q.articleNumber, textSnippet: "" },
              trapInsight: "عدم التمييز بين القواعد الآمرة والقواعد المكملة يوقع المتدرب في التكييف غير السليم.",
              practicalTip: "استحضر دائماً نطاق سريان النظام وتاريخ نفاذ لائحته التنفيذية لتجنب الدفع بالبطلان."
            }));
          }
        } catch {}
      }
    }

    let mcqPool: UnifiedQuizItem[] = [
      ...fetchedFromVault,
      ...ACADEMY_QUESTIONS.map(q => ({
        type: "mcq" as const,
        id: q.id,
        categoryNumber: q.categoryNumber,
        categoryName: q.categoryName,
        lawName: q.lawName,
        articleNumber: q.articleNumber || "المادة النظامية",
        question: q.question,
        options: q.options || ["صحيح", "خطأ"],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        statutoryCitation: q.statutoryCitation
          ? {
              instrument: q.statutoryCitation.instrument,
              article: q.statutoryCitation.article,
              textSnippet: q.statutoryCitation.textSnippet || ""
            }
          : {
              instrument: q.lawName,
              article: q.articleNumber || "",
              textSnippet: ""
            },
        trapInsight: "الخلط بين المواعيد الإجرائية العادية والمستعجلة هو السبب الأكبر لسقوط حق الاعتراض.",
        practicalTip: "دوّن تاريخ تسلّم صك الحكم فوراً لحساب ميعاد الاستئناف بالتقويم الهجري/الميلادي المعتمد في المحكمة."
      }))
    ];

    let interactivePool = CURATED_INTERACTIVE_ITEMS.filter(q => {
      if (selectedStyle !== "all" && q.type !== selectedStyle) return false;
      return true;
    });

    let combinedPool: UnifiedQuizItem[] = [];
    if (selectedStyle === "mcq") {
      combinedPool = mcqPool;
    } else if (selectedStyle === "all") {
      combinedPool = [...interactivePool, ...mcqPool];
    } else {
      combinedPool = interactivePool.length > 0 ? interactivePool : mcqPool;
    }

    if (combinedPool.length === 0) {
      combinedPool = mcqPool;
    }

    const shuffled = combinedPool.sort(() => 0.5 - Math.random());

    // In True Survival or Endless: NO ceiling! Use full pool.
    // In Standard: Slice to selected count.
    let selected: UnifiedQuizItem[] = [];
    if (gameMode === "standard") {
      selected = shuffled.slice(0, Math.min(questionsCount, shuffled.length));
    } else {
      selected = shuffled; // Unlimited until 5 gavels lost!
    }

    setQuizQuestions(selected);
    setCurrentIndex(0);
    setScore(0);
    setTimer(0);
    setupQuestionInteractions(selected[0]);
    setStage("playing");
  };

  const setupQuestionInteractions = (q: UnifiedQuizItem) => {
    setIsQuestionAnswered(false);
    setIsQuestionCorrect(false);
    setMcqChoice(null);
    setRedliningSelected([]);
    setScenarioChoice(null);
    setJurisdictionMap({});

    if (q.type === "timeline") {
      setTimelineItems([...q.initialOrder]);
    }
  };

  // Legal-Themed Gavels & Streak Management
  const processAnswerResult = (correct: boolean) => {
    setIsQuestionAnswered(true);
    setIsQuestionCorrect(correct);

    if (correct) {
      setScore(s => s + 1);
      setStreak(prev => {
        const next = prev + 1;
        if (next > highestStreak) setHighestStreak(next);
        return next;
      });
      playSound("correct");
    } else {
      setStreak(0);
      playSound("wrong");

      if (gameMode === "survival") {
        setGavels(prev => {
          const rem = prev - 1;
          if (rem <= 0) {
            setIsGameOver(true);
            playSound("gameover");
          }
          return Math.max(0, rem);
        });
      }
    }
  };

  const handleMcqAnswer = (optIdx: number) => {
    if (isQuestionAnswered || quizQuestions[currentIndex].type !== "mcq") return;
    const q = quizQuestions[currentIndex] as Extract<UnifiedQuizItem, { type: "mcq" }>;
    setMcqChoice(optIdx);
    processAnswerResult(optIdx === q.correctAnswer);
  };

  const handleRedliningToggle = (id?: number) => {
    if (!id || isQuestionAnswered) return;
    setRedliningSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleRedliningVerify = () => {
    const q = quizQuestions[currentIndex] as Extract<UnifiedQuizItem, { type: "redlining" }>;
    const correct = q.requiredFlawIds.every(id => redliningSelected.includes(id));
    processAnswerResult(correct);
  };

  const handleScenarioChoice = (idx: number) => {
    if (isQuestionAnswered) return;
    const q = quizQuestions[currentIndex] as Extract<UnifiedQuizItem, { type: "scenario" }>;
    setScenarioChoice(idx);
    processAnswerResult(q.choices[idx].isCorrect);
  };

  const moveTimeline = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= timelineItems.length || isQuestionAnswered) return;
    const copy = [...timelineItems];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    setTimelineItems(copy);
  };

  const handleTimelineVerify = () => {
    const q = quizQuestions[currentIndex] as Extract<UnifiedQuizItem, { type: "timeline" }>;
    const correct = timelineItems.every((val, idx) => val === q.correctOrder[idx]);
    processAnswerResult(correct);
  };

  const handleJurisdictionAssign = (disputeId: string, courtId: string) => {
    if (isQuestionAnswered) return;
    setJurisdictionMap(prev => ({ ...prev, [disputeId]: courtId }));
  };

  const handleJurisdictionVerify = () => {
    const q = quizQuestions[currentIndex] as Extract<UnifiedQuizItem, { type: "jurisdiction" }>;
    const correct = q.disputes.every(d => jurisdictionMap[d.id] === d.correctCourt);
    processAnswerResult(correct);
  };

  const nextQuestion = useCallback(() => {
    if (isGameOver) {
      finishQuiz();
      return;
    }

    if (currentIndex < quizQuestions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setupQuestionInteractions(quizQuestions[nextIdx]);
    } else {
      finishQuiz();
    }
  }, [currentIndex, isGameOver, quizQuestions]);

  const finishQuiz = () => {
    setStage("result");
    playSound("finish");
    confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });

    const earnedPoints = score * 10;
    if (earnedPoints > 0) {
      const newEntry: LeaderboardUser = {
        rank: 0,
        name: "أنت (المستخدم الحالي)",
        title: "متحدي نظامي النشط",
        points: earnedPoints,
        accuracy: Math.round((score / Math.max(1, currentIndex + 1)) * 100),
        streak: highestStreak,
        badge: highestStreak >= 5 ? "فارس المرافعات 👑" : "مستشار متقدم ⚖️",
        category: selectedCategories.includes("all") ? "شامل" : "القسم المحدد",
        isCurrentUser: true
      };

      const updated = [...leaderboard, newEntry]
        .sort((a, b) => b.points - a.points)
        .map((u, i) => ({ ...u, rank: i + 1 }));

      setLeaderboard(updated);
    }
  };

  // Keyboard Shortcuts (1, 2, 3, 4, Enter, Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (stage !== "playing" || !quizQuestions[currentIndex]) return;

      const current = quizQuestions[currentIndex];

      if (current.type === "mcq" && !isQuestionAnswered) {
        if (["1", "2", "3", "4"].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < current.options.length) {
            handleMcqAnswer(idx);
          }
        }
      }

      if (isQuestionAnswered && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        nextQuestion();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stage, isQuestionAnswered, currentIndex, quizQuestions, nextQuestion]);

  const cardClass = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-3xl"
    : "bg-white border border-zinc-200/70 rounded-3xl";

  const fmtTimer = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const currentQ = quizQuestions[currentIndex];

  const filteredLawQuestions = lawQuestions.filter(q => {
    if (!vaultSearchQuery) return true;
    const term = vaultSearchQuery.toLowerCase();
    return (
      (q.question && q.question.toLowerCase().includes(term)) ||
      (q.articleNumber && q.articleNumber.toLowerCase().includes(term)) ||
      (q.lawName && q.lawName.toLowerCase().includes(term)) ||
      (q.explanation && q.explanation.toLowerCase().includes(term))
    );
  });

  const accuracyScore = Math.round((score / Math.max(1, currentIndex + 1)) * 100);
  const speedScore = Math.min(100, Math.max(40, Math.round(100 - (timer / Math.max(1, currentIndex + 1)) * 3)));
  const streakScore = Math.min(100, highestStreak * 20);
  const precisionScore = Math.round((accuracyScore * 0.7) + (streakScore * 0.3));

  return (
    <div className={`min-h-screen pt-6 pb-20 ${isDark ? "bg-[#070908] text-zinc-100" : "bg-[#F7F9F8] text-zinc-900"}`} dir="rtl">
      <div className={`mx-auto px-5 transition-all duration-300 ${isZenMode ? "max-w-4xl" : "max-w-5xl"}`}>

        {/* Top Header & Navigation Tabs */}
        {!isZenMode && (
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <Link href="/academy" className={`flex items-center gap-2 text-sm font-bold transition-colors ${isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"}`}>
              <ArrowRight size={16} /> العودة للأكاديمية
            </Link>

            {/* Master Tabs */}
            <div className={`p-1.5 rounded-2xl flex items-center gap-1 border flex-wrap ${isDark ? "bg-white/[0.03] border-white/10" : "bg-slate-100 border-slate-200"}`}>
              <button
                onClick={() => { setActiveTab("quiz"); setStage("setup"); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "quiz"
                    ? "bg-[#0B3D2E] text-white shadow-md"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <GameController size={16} weight="duotone" /> محراب المرافعات والتحديات
              </button>
              <button
                onClick={() => setActiveTab("leaderboard")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "leaderboard"
                    ? "bg-[#C8A762] text-zinc-950 font-black shadow-md"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Crown size={16} weight="fill" className="text-amber-700" /> لوحة المتصدرين
              </button>
              <button
                onClick={() => setActiveTab("vault_explorer")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "vault_explorer"
                    ? "bg-emerald-800 text-white font-black shadow-md"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Eye size={16} weight="bold" /> مستعرض بنك الأسئلة (16k)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Trophy size={20} weight="duotone" className="text-[#C8A762]" />
              <span className="font-brand font-bold text-lg">أكاديمية نظامي</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: LEGAL LEADERBOARD
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "leaderboard" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Leaderboard Banner */}
            <div className={`${cardClass} p-8 border-r-4 border-r-[#C8A762] relative overflow-hidden`}>
              <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C8A762]/10 text-[#C8A762] text-xs font-bold mb-2">
                    <Trophy size={14} weight="fill" /> لوحة الشرف الأكاديمية
                  </div>
                  <h2 className="text-2xl font-black mb-1 flex items-center gap-2">
                    لوحة متصدري وفرسان المعرفة القانونية
                  </h2>
                  <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    يتنافس نخبة المحامين والباحثين في قياس سرعة ودقة استحضار النصوص النظامية والقرارات التكتيكية.
                  </p>
                </div>

                {/* Timeframe Filter */}
                <div className={`p-1 rounded-xl flex items-center gap-1 border ${isDark ? "bg-black/40 border-white/10" : "bg-slate-100 border-slate-200"}`}>
                  {[
                    { key: "weekly", label: "هذا الأسبوع" },
                    { key: "monthly", label: "هذا الشهر" },
                    { key: "allTime", label: "التصنيف العام" },
                  ].map(tf => (
                    <button
                      key={tf.key}
                      onClick={() => setLeaderboardTimeframe(tf.key as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        leaderboardTimeframe === tf.key
                          ? "bg-[#0B3D2E] text-white"
                          : isDark ? "text-zinc-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Top 3 Podium Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              {leaderboard.slice(0, 3).map((user, idx) => {
                const isFirst = idx === 0;
                const isSecond = idx === 1;
                return (
                  <div
                    key={idx}
                    className={`${cardClass} p-6 text-center relative ${
                      isFirst
                        ? "border-[#C8A762] bg-gradient-to-b from-[#C8A762]/10 to-transparent shadow-xl md:-translate-y-2"
                        : "border-white/5"
                    }`}
                  >
                    <div className="relative inline-block mb-3">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold font-mono mx-auto ${
                        isFirst
                          ? "bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 shadow-lg shadow-amber-500/20"
                          : isSecond
                          ? "bg-gradient-to-br from-slate-300 to-slate-500 text-zinc-950"
                          : "bg-gradient-to-br from-amber-700 to-amber-900 text-white"
                      }`}>
                        {user.rank}
                      </div>
                      {isFirst && (
                        <Crown size={22} weight="fill" className="absolute -top-3 left-1/2 -translate-x-1/2 text-[#C8A762]" />
                      )}
                    </div>

                    <h3 className="font-bold text-sm mb-1">{user.name}</h3>
                    <p className="text-[11px] text-zinc-400 mb-3">{user.title}</p>

                    <div className="inline-block px-3 py-1 rounded-full bg-[#0B3D2E]/20 text-[#C8A762] text-xs font-black mb-4">
                      {user.badge}
                    </div>

                    <div className="flex justify-center gap-3 text-xs pt-3 border-t border-white/5">
                      <div>
                        <span className="block text-[10px] opacity-60">النقاط</span>
                        <span className="font-mono font-bold text-[#C8A762]">{user.points}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] opacity-60">الدقة</span>
                        <span className="font-mono font-bold text-emerald-400">{user.accuracy}%</span>
                      </div>
                      <div>
                        <span className="block text-[10px] opacity-60">السلسلة</span>
                        <span className="font-mono font-bold text-amber-400">🔥 {user.streak}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Complete Ranking Table */}
            <div className={`${cardClass} p-6`}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Users size={18} className="text-[#C8A762]" /> تصنيف بقية الفرسان
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className={`border-b ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                      <th className="pb-3 pr-2">المركز</th>
                      <th className="pb-3">المتسابق</th>
                      <th className="pb-3">الشارة المعرفية</th>
                      <th className="pb-3">التخصص الأبرز</th>
                      <th className="pb-3 text-center">أطول مرافعة 🔥</th>
                      <th className="pb-3 text-center">الدقة</th>
                      <th className="pb-3 pl-2 text-left">مجموع النقاط</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {leaderboard.map(user => (
                      <tr
                        key={user.rank}
                        className={`transition-colors ${
                          user.isCurrentUser
                            ? "bg-[#C8A762]/10 font-bold"
                            : isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-3.5 pr-2 font-mono font-bold text-[#C8A762]">
                          #{user.rank}
                        </td>
                        <td className="py-3.5">
                          <p className="font-bold">{user.name}</p>
                          <p className="text-[10px] opacity-60">{user.title}</p>
                        </td>
                        <td className="py-3.5">
                          <span className="px-2.5 py-0.5 rounded-md bg-[#0B3D2E]/20 text-[#C8A762] text-[11px] font-bold">
                            {user.badge}
                          </span>
                        </td>
                        <td className="py-3.5 opacity-80">{user.category}</td>
                        <td className="py-3.5 text-center font-mono font-bold text-amber-400">
                          {user.streak} متتالية
                        </td>
                        <td className="py-3.5 text-center font-mono font-bold text-emerald-400">
                          {user.accuracy}%
                        </td>
                        <td className="py-3.5 pl-2 text-left font-mono font-black text-sm text-[#C8A762]">
                          {user.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: RAW SCRIPT VAULT EXPLORER
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "vault_explorer" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            <div className={`${cardClass} p-6 border-r-4 border-r-[#C8A762]`}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-black mb-1 flex items-center gap-2">
                    <BookOpen size={24} className="text-[#C8A762]" /> مستعرض وفاحص مخرجات السكربت للمكتبة القانونية
                  </h2>
                  <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    تصفح وفحص كافة الأسئلة المستخرجة (16,585 سؤالاً) نظاماً بنظام ومادة بمادة والتأكد من السند النظامي.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0B3D2E]/20 text-[#C8A762] border border-[#C8A762]/30">
                    ٣٠ قسماً نظامياً مفروزاً
                  </span>
                </div>
              </div>
            </div>

            {/* Step 1: Pick Section */}
            <div className={`${cardClass} p-6`}>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                1. اختر القسم النظامي لفحص أنظمته:
              </label>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                {ACADEMY_CATEGORIES.filter(c => c.categoryNumber !== "ALL").map(cat => {
                  const isSelected = selectedVaultSection === cat.categoryNumber;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => loadVaultSection(cat.categoryNumber)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                          : isDark ? "bg-white/[0.03] border-white/5 text-zinc-400 hover:text-white" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="opacity-60 text-[10px] font-mono ml-1">[{cat.categoryNumber}]</span>
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Pick Specific Law */}
            {sectionLaws.length > 0 && (
              <div className={`${cardClass} p-6`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    2. اختر النظام/اللائحة المراد فحص أسئلته ({sectionLaws.length} وثيقة متوفرة):
                  </label>
                  <button
                    onClick={() => { setSelectedLaw(""); loadVaultSection(selectedVaultSection); }}
                    className={`text-xs font-bold ${!selectedLaw ? "text-[#C8A762]" : "text-zinc-400 hover:underline"}`}
                  >
                    عرض عينة من كافة أنظمة القسم
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {sectionLaws.map((law, idx) => {
                    const isSelected = selectedLaw === law.lawSlug;
                    return (
                      <button
                        key={idx}
                        onClick={() => loadSpecificLaw(selectedVaultSection, law.lawSlug)}
                        className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-[#C8A762]/10 border-[#C8A762] text-[#C8A762]"
                            : isDark ? "bg-white/[0.02] border-white/5 text-zinc-300 hover:bg-white/5" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xs font-bold truncate max-w-[200px]" title={law.lawSlug}>
                          {law.lawSlug.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/20 shrink-0">
                          {law.count} سؤال
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Questions Viewer */}
            <div className={`${cardClass} p-6`}>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <ListChecks size={22} className="text-[#C8A762]" />
                  <h3 className="font-bold text-base">
                    الأسئلة المستخرجة على الشاشة ({filteredLawQuestions.length} سؤال)
                  </h3>
                </div>

                <div className="relative w-full sm:w-72">
                  <MagnifyingGlass size={16} className="absolute right-3 top-3 text-zinc-400" />
                  <input
                    type="text"
                    value={vaultSearchQuery}
                    onChange={e => setVaultSearchQuery(e.target.value)}
                    placeholder="ابحث في نص المادة أو السؤال..."
                    className={`w-full pr-9 pl-4 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark ? "bg-white/[0.04] border-white/10 text-white focus:border-[#C8A762]" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-[#0B3D2E]"
                    }`}
                  />
                </div>
              </div>

              {isLoadingVault ? (
                <div className="py-16 text-center text-zinc-400">
                  <div className="w-8 h-8 border-2 border-[#C8A762] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs">جاري سحب وفهرسة الأسئلة من بنك الأكاديمية...</p>
                </div>
              ) : filteredLawQuestions.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-xs">
                  لا توجد أسئلة تطابق معايير البحث الحالية.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredLawQuestions.map((q, idx) => (
                    <div key={idx} className={`p-5 rounded-2xl border ${isDark ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50/70 border-slate-200"}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#0B3D2E] text-white">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-[#C8A762]">
                            {q.lawName || q.statutoryCitation?.instrument}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-emerald-500 font-bold">
                          {q.articleNumber || q.statutoryCitation?.article}
                        </span>
                      </div>

                      <p className="font-bold text-sm leading-relaxed mb-4">{q.question}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                        {q.options?.map((opt: string, optIdx: number) => {
                          const isCorrect = optIdx === q.correctAnswer;
                          return (
                            <div
                              key={optIdx}
                              className={`p-3 rounded-xl text-xs flex items-start justify-between gap-2 border ${
                                isCorrect
                                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold"
                                  : isDark ? "bg-white/[0.02] border-white/5 text-zinc-400" : "bg-white border-slate-200 text-slate-600"
                              }`}
                            >
                              <span>{opt}</span>
                              {isCorrect && <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />}
                            </div>
                          );
                        })}
                      </div>

                      {q.statutoryCitation && (
                        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${isDark ? "bg-black/30 border-white/5 text-zinc-300" : "bg-white border-slate-200 text-slate-700"}`}>
                          <Scales size={18} className="text-[#C8A762] shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-[#C8A762] block mb-0.5">
                              السند من المادة: {q.statutoryCitation.article}
                            </span>
                            <p className="italic text-[11px] opacity-80 leading-relaxed">
                              &ldquo;{q.statutoryCitation.textSnippet}&rdquo;
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: COURTROOM ARENA & CHALLENGE LAB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "quiz" && (
          <AnimatePresence mode="wait">

            {/* STAGE 1: SETUP SCREEN */}
            {stage === "setup" && (
              <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={`${cardClass} p-8 md:p-12 shadow-sm relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-72 h-72 bg-[#C8A762]/5 rounded-full blur-3xl pointer-events-none" />

                <div className="text-center max-w-xl mx-auto mb-10 relative z-10">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0B3D2E] text-[#C8A762] mb-5 shadow-xl shadow-[#0B3D2E]/20 border border-[#C8A762]/30">
                    <Gavel size={32} weight="duotone" />
                  </div>
                  <h1 className="text-3xl font-black mb-3">محراب المرافعات والتحديات الذكية</h1>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                    اختر نمط المرافعة والقسم النظامي وانغمس في تجربة قضائية حية تحاكي الميدان.
                  </p>
                </div>

                <div className="space-y-8 mb-10 relative z-10">

                  {/* 1. Legal-Themed Game Mode Selection */}
                  <div>
                    <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      1. نظام التحدي والمرافعة:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: "survival", label: "⚖️ وضع الحصانة (سيرفايفل)", desc: "٥ مطارق دون سقف للأسئلة حتى تسقط الحصانة", icon: Gavel },
                        { id: "endless", label: "♾️ ماراثون مفتوح", desc: "تحدي لا نهائي مستمر حتى تقرر التوقف", icon: Fire },
                        { id: "standard", label: "🎯 مرافعة بعدد محدد", desc: "اختبار بعدد أسئلة محدد (5، 15، 30...)", icon: TargetIcon },
                      ].map(gm => {
                        const isSelected = gameMode === gm.id;
                        const Icon = gm.icon;
                        return (
                          <button
                            key={gm.id}
                            onClick={() => setGameMode(gm.id as GameMode)}
                            className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between ${
                              isSelected
                                ? isDark ? "border-[#C8A762] bg-[#C8A762]/10 text-white shadow-sm" : "border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E] shadow-sm"
                                : isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <Icon size={22} weight={isSelected ? "fill" : "regular"} className={isSelected ? "text-[#C8A762]" : "text-zinc-400"} />
                              {isSelected && <CheckCircle size={18} weight="fill" className="text-emerald-500" />}
                            </div>
                            <div>
                              <p className="font-bold text-sm mb-1">{gm.label}</p>
                              <p className="text-[11px] opacity-75 leading-tight">{gm.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Select Question Style */}
                  <div>
                    <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      2. أسلوب الأسئلة والمحاكاة:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {QUESTION_STYLES.map(st => {
                        const isSelected = selectedStyle === st.id;
                        const Icon = st.icon;
                        return (
                          <button
                            key={st.id}
                            onClick={() => setSelectedStyle(st.id as QuestionStyle)}
                            className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between ${
                              isSelected
                                ? isDark ? "border-[#C8A762] bg-[#C8A762]/10 text-white shadow-sm" : "border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E] shadow-sm"
                                : isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <Icon size={22} weight={isSelected ? "fill" : "regular"} className={isSelected ? "text-[#C8A762]" : "text-zinc-400"} />
                              {isSelected && <CheckCircle size={18} weight="fill" className="text-emerald-500" />}
                            </div>
                            <div>
                              <p className="font-bold text-sm mb-1">{st.label}</p>
                              <p className="text-[11px] opacity-75 leading-tight">{st.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Select Category */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className={`text-sm font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        3. اختر القسم القانوني (٣٠ قسماً متاحاً):
                      </label>
                      <span className="text-xs text-zinc-400">
                        {selectedCategories.includes("all") ? "كافة الأقسام" : `${selectedCategories.length} محدد`}
                      </span>
                    </div>
                    <div className={`flex flex-wrap gap-2 p-4 rounded-2xl max-h-52 overflow-y-auto ${isDark ? "bg-white/[0.02] border border-white/[0.05]" : "bg-slate-50 border border-slate-100"}`}>
                      {ACADEMY_CATEGORIES.map(cat => {
                        const isActive = selectedCategories.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedCategories([cat.id])}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                              isActive
                                ? isDark ? "border-[#C8A762] bg-[#C8A762]/10 text-white" : "border-[#0B3D2E] bg-[#0B3D2E] text-white"
                                : isDark ? "border-white/5 bg-white/[0.03] text-zinc-400 hover:text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {cat.categoryNumber !== "ALL" && <span className="opacity-60 text-[10px] font-mono ml-1">[{cat.categoryNumber}]</span>}
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. Question Count (Hidden in True Survival/Endless) & Difficulty */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        4. نطاق الأسئلة:
                      </label>
                      {gameMode === "survival" ? (
                        <div className={`p-4 rounded-2xl border flex items-center gap-3 ${isDark ? "bg-[#C8A762]/10 border-[#C8A762]/30 text-[#C8A762]" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                          <Gavel size={22} weight="fill" className="shrink-0" />
                          <div>
                            <p className="font-bold text-xs">وضع السيرفايفل (حصانة ٥ مطارق):</p>
                            <p className="text-[11px] opacity-85">مستمر بلا سقف أو حد أقصى حتى استنفاد المطارق الخمسة!</p>
                          </div>
                        </div>
                      ) : gameMode === "endless" ? (
                        <div className={`p-4 rounded-2xl border flex items-center gap-3 ${isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
                          <Fire size={22} weight="fill" className="shrink-0" />
                          <div>
                            <p className="font-bold text-xs">ماراثون مفتوح:</p>
                            <p className="text-[11px] opacity-85">مستمر بدون توقف حتى تضغط إنهاء المرافعة بنفسك.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 flex-wrap">
                          {[5, 15, 30, 50, 100].map(num => (
                            <button
                              key={num}
                              onClick={() => setQuestionsCount(num)}
                              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                questionsCount === num
                                  ? isDark ? "border-[#C8A762] text-[#C8A762] bg-[#C8A762]/10" : "border-[#0B3D2E] text-[#0B3D2E] bg-[#0B3D2E]/5"
                                  : isDark ? "border-white/[0.06] text-zinc-400 bg-white/[0.02]" : "border-zinc-200 text-zinc-500 bg-white"
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        5. مستوى الصعوبة:
                      </label>
                      <div className="flex gap-2">
                        {[
                          { key: "all", label: "شامل" },
                          { key: "beginner", label: "مبتدئ" },
                          { key: "intermediate", label: "متوسط" },
                          { key: "advanced", label: "متقدم" },
                        ].map(d => (
                          <button
                            key={d.key}
                            onClick={() => setDifficulty(d.key as any)}
                            className={`flex-1 py-3 rounded-xl border-2 text-xs font-bold transition-all ${
                              difficulty === d.key
                                ? isDark ? "border-[#C8A762] text-[#C8A762] bg-[#C8A762]/10" : "border-[#0B3D2E] text-[#0B3D2E] bg-[#0B3D2E]/5"
                                : isDark ? "border-white/[0.06] text-zinc-400 bg-white/[0.02]" : "border-zinc-200 text-zinc-500 bg-white"
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Start CTA */}
                <div className="flex justify-center border-t pt-8 border-white/[0.06] relative z-10">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={startQuiz}
                    className="bg-gradient-to-l from-[#0B3D2E] to-emerald-800 text-[#C8A762] px-14 py-4 rounded-2xl text-lg font-black shadow-xl flex items-center gap-3 border border-[#C8A762]/30"
                  >
                    <Gavel size={24} weight="fill" /> دخول قاعة المرافعة
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* STAGE 2: PLAYING SCREEN */}
            {stage === "playing" && currentQ && (
              <motion.div key="playing" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto">

                {/* Top Controls */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsZenMode(!isZenMode)}
                      title={isZenMode ? "الخروج من وضع التركيز" : "تفعيل وضع التركيز القضائي"}
                      className={`p-2 rounded-xl border transition-all text-xs flex items-center gap-1.5 font-bold ${
                        isZenMode
                          ? "bg-[#C8A762] text-zinc-950 border-[#C8A762]"
                          : isDark ? "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10" : "bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isZenMode ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
                      <span>{isZenMode ? "إنهاء التركيز" : "وضع التركيز القضائي"}</span>
                    </button>

                    <span className={`text-sm font-bold font-mono px-3.5 py-1.5 rounded-full ${isDark ? "bg-white/10 text-white" : "bg-zinc-200 text-zinc-800"}`}>
                      مرافعة #{currentIndex + 1}
                      {gameMode === "standard" && ` من ${quizQuestions.length}`}
                    </span>
                    <div className={`text-sm font-mono flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>
                      <Clock size={14} /> {fmtTimer(timer)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Legal Immunity / Gavels */}
                    {gameMode === "survival" && (
                      <div className="flex items-center gap-1.5 bg-[#C8A762]/10 px-3.5 py-1.5 rounded-full border border-[#C8A762]/30">
                        <span className="text-[11px] font-bold text-[#C8A762] ml-1">الحصانة:</span>
                        {Array.from({ length: maxGavels }).map((_, i) => (
                          <Gavel
                            key={i}
                            size={16}
                            weight={i < gavels ? "fill" : "regular"}
                            className={i < gavels ? "text-[#C8A762]" : "text-zinc-600 opacity-30"}
                          />
                        ))}
                      </div>
                    )}

                    {/* Streak Indicator */}
                    {streak > 1 && (
                      <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-3.5 py-1.5 rounded-full text-xs font-black border border-amber-500/30 animate-pulse">
                        <Fire size={15} weight="fill" className="text-amber-500" /> {streak} مرافعة متتالية!
                      </div>
                    )}

                    {/* Score Counter */}
                    <div className={`text-sm font-bold flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                      <Star size={14} weight="fill" /> {score * 10} نقطة
                    </div>
                  </div>
                </div>

                {/* Progress Bar (Dynamic) */}
                <div className={`h-2 rounded-full mb-8 overflow-hidden ${isDark ? "bg-white/10" : "bg-zinc-200"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((currentIndex + 1) / Math.max(quizQuestions.length, 1)) * 100)}%` }}
                    className="h-full bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-emerald-600"
                  />
                </div>

                {/* Case Dossier Card */}
                <div className={`${cardClass} p-8 md:p-12 shadow-2xl relative overflow-hidden transition-all duration-500 ${
                  streak >= 3 ? "shadow-[0_0_40px_rgba(200,167,98,0.25)] border-[#C8A762]/60 ring-1 ring-[#C8A762]/40" : ""
                }`}>

                  {/* Header */}
                  <div className="mb-8 flex items-center justify-between flex-wrap gap-3 pb-6 border-b border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0B3D2E] text-[#C8A762] flex items-center justify-center shadow-md">
                        <FileText size={22} weight="duotone" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase text-[#C8A762] tracking-wider">
                            ملف دعوى واستشارة نظامية
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                            قيد رقم #{currentIndex + 101}
                          </span>
                        </div>
                        <p className={`text-xs font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                          {currentQ.lawName} — {currentQ.categoryName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-black/40 text-amber-400 border border-white/5">
                        {currentQ.articleNumber}
                      </span>
                    </div>
                  </div>

                  {/* ── STYLE A: MULTIPLE CHOICE (MCQ) ───────────────────────── */}
                  {currentQ.type === "mcq" && (
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-8 text-right">
                        {currentQ.question}
                      </h2>
                      <div className="space-y-4">
                        {currentQ.options.map((opt, idx) => {
                          const isCorrect = idx === currentQ.correctAnswer;
                          const isSelected = mcqChoice === idx;
                          let btnClass = isDark ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07]" : "border-zinc-200 bg-white hover:bg-zinc-50";

                          if (isQuestionAnswered) {
                            if (isCorrect) btnClass = "border-emerald-500 bg-emerald-500/15 text-emerald-300 shadow-md";
                            else if (isSelected) btnClass = "border-red-500 bg-red-500/15 text-red-300";
                            else btnClass = "opacity-35 border-transparent";
                          }

                          return (
                            <button
                              key={idx}
                              disabled={isQuestionAnswered}
                              onClick={() => handleMcqAnswer(idx)}
                              className={`w-full text-start p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${btnClass}`}
                            >
                              <div className="flex items-center gap-4">
                                <span className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 border ${
                                  isDark ? "bg-black/30 border-white/10 text-zinc-400 group-hover:text-white" : "bg-slate-100 border-slate-300 text-slate-700"
                                }`}>
                                  {idx + 1}
                                </span>
                                <span className="text-base font-medium leading-relaxed">{opt}</span>
                              </div>

                              {isQuestionAnswered && isCorrect && <CheckCircle size={26} weight="fill" className="text-emerald-500 shrink-0 mr-2" />}
                              {isQuestionAnswered && isSelected && !isCorrect && <XCircle size={26} weight="fill" className="text-red-500 shrink-0 mr-2" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── STYLE B: CONTRACT REDLINING ──────────────────────────── */}
                  {currentQ.type === "redlining" && (
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-3">{currentQ.question}</h2>
                      <p className={`text-xs mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                        انقر بالماوس على العبارات أو الشروط الباطلة نظاماً في صلب هذا البند:
                      </p>

                      <div className={`p-6 rounded-2xl border leading-loose text-base mb-6 ${isDark ? "bg-black/40 border-white/10 text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
                        {currentQ.clauseSegments.map((seg, idx) => {
                          if (!seg.isBug) return <span key={idx}>{seg.text}</span>;
                          const isSelected = redliningSelected.includes(seg.id!);
                          return (
                            <button
                              key={idx}
                              disabled={isQuestionAnswered}
                              onClick={() => handleRedliningToggle(seg.id)}
                              className={`mx-1 px-2.5 py-1 rounded-lg border font-bold transition-all ${
                                isSelected
                                  ? "bg-red-500/20 border-red-500 text-red-400 scale-105 shadow-sm"
                                  : isDark
                                  ? "bg-white/5 border-white/10 hover:border-amber-400 text-zinc-300"
                                  : "bg-white border-slate-300 hover:border-amber-500 text-slate-700"
                              }`}
                            >
                              {seg.text}
                            </button>
                          );
                        })}
                      </div>

                      {!isQuestionAnswered && (
                        <div className="flex justify-end">
                          <button
                            onClick={handleRedliningVerify}
                            disabled={redliningSelected.length === 0}
                            className="px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#125340] disabled:opacity-50 flex items-center gap-2"
                          >
                            <Check size={16} /> فحص الثغرات المحددة
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── STYLE C: BRANCHING SCENARIO ──────────────────────────── */}
                  {currentQ.type === "scenario" && (
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-2">{currentQ.title}</h2>
                      <p className={`text-sm leading-relaxed mb-6 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{currentQ.desc}</p>

                      <div className="space-y-3">
                        {currentQ.choices.map((c, idx) => {
                          const isPicked = scenarioChoice === idx;
                          let btnCls = isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50";

                          if (isQuestionAnswered) {
                            if (c.isCorrect) btnCls = "border-emerald-500 bg-emerald-500/15 text-emerald-300 font-bold";
                            else if (isPicked) btnCls = "border-red-500 bg-red-500/15 text-red-300";
                            else btnCls = "opacity-40 border-transparent";
                          }

                          return (
                            <button
                              key={idx}
                              disabled={isQuestionAnswered}
                              onClick={() => handleScenarioChoice(idx)}
                              className={`w-full p-4 rounded-2xl border-2 text-right transition-all flex items-start justify-between ${btnCls}`}
                            >
                              <span className="text-sm font-bold leading-relaxed">{c.text}</span>
                              {isQuestionAnswered && (
                                <span className="mr-2">
                                  {c.isCorrect ? <CheckCircle size={22} weight="fill" className="text-emerald-500" /> : isPicked ? <XCircle size={22} weight="fill" className="text-red-500" /> : null}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── STYLE D: TIMELINE ORDERING ───────────────────────────── */}
                  {currentQ.type === "timeline" && (
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-3">{currentQ.question}</h2>
                      <p className={`text-xs mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                        استخدم أزرار الأسهم (▲ / ▼) لضبط التسلسل الإجرائي الصحيح:
                      </p>

                      <div className="space-y-3 mb-6">
                        {timelineItems.map((item, idx) => (
                          <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between ${isDark ? "bg-black/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                            <div className="flex items-center gap-3">
                              <span className="w-7 h-7 rounded-full bg-[#0B3D2E] text-white flex items-center justify-center text-xs font-bold">
                                {idx + 1}
                              </span>
                              <span className="text-sm font-bold leading-relaxed">{item}</span>
                            </div>
                            {!isQuestionAnswered && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => moveTimeline(idx, idx - 1)} disabled={idx === 0} className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30">
                                  ▲
                                </button>
                                <button onClick={() => moveTimeline(idx, idx + 1)} disabled={idx === timelineItems.length - 1} className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30">
                                  ▼
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {!isQuestionAnswered && (
                        <div className="flex justify-end">
                          <button onClick={handleTimelineVerify} className="px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#125340] flex items-center gap-2">
                            <Check size={16} /> تأكيد التسلسل الإجرائي
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── STYLE E: JURISDICTION SORTING ────────────────────────── */}
                  {currentQ.type === "jurisdiction" && (
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-3">{currentQ.question}</h2>
                      <p className={`text-xs mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                        طابق كل واقعة نزاع بالمحكمة أو اللجنة المختصة:
                      </p>

                      <div className="space-y-4 mb-6">
                        {currentQ.disputes.map((d, idx) => {
                          const chosen = jurisdictionMap[d.id];
                          const isRight = chosen === d.correctCourt;
                          return (
                            <div key={d.id} className={`p-4 rounded-2xl border ${isDark ? "bg-black/40 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                              <p className="text-sm font-bold mb-3 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-[#0B3D2E] text-white flex items-center justify-center text-xs font-mono">{idx + 1}</span>
                                {d.text}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {currentQ.courts.map(c => {
                                  const isSelected = chosen === c.id;
                                  let cls = isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-100";

                                  if (isQuestionAnswered) {
                                    if (c.id === d.correctCourt) cls = "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold";
                                    else if (isSelected && !isRight) cls = "border-red-500 bg-red-500/20 text-red-300";
                                    else cls = "opacity-30 border-transparent";
                                  } else if (isSelected) {
                                    cls = "border-[#C8A762] bg-[#C8A762]/10 text-white font-bold";
                                  }

                                  return (
                                    <button
                                      key={c.id}
                                      disabled={isQuestionAnswered}
                                      onClick={() => handleJurisdictionAssign(d.id, c.id)}
                                      className={`px-3 py-2 rounded-xl border text-xs text-right transition-all ${cls}`}
                                    >
                                      {c.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {!isQuestionAnswered && (
                        <div className="flex justify-end">
                          <button
                            onClick={handleJurisdictionVerify}
                            disabled={Object.keys(jurisdictionMap).length < currentQ.disputes.length}
                            className="px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#125340] disabled:opacity-50 flex items-center gap-2"
                          >
                            <Check size={16} /> تأكيد الاختصاص القضائي
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── 🌟 3-LAYER ANATOMY OF LEGAL FEEDBACK ──────────────────── */}
                  <AnimatePresence>
                    {isQuestionAnswered && (
                      <motion.div initial={{ opacity: 0, height: 0, y: 12 }} animate={{ opacity: 1, height: "auto", y: 0 }} className="mt-8 overflow-hidden space-y-3 pt-6 border-t border-white/[0.08]">

                        {/* Layer 1: Statutory Verdict & Explanation */}
                        <div className={`p-5 rounded-2xl border ${isQuestionCorrect ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
                          <div className="flex items-start gap-3">
                            {isQuestionCorrect ? <CheckCircle size={24} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={24} weight="fill" className="text-red-500 shrink-0 mt-0.5" />}
                            <div>
                              <p className="font-bold mb-1 text-sm">
                                {isQuestionCorrect
                                  ? "دفع إجرائي صحيح ومرافعة متقنة! ⚖️"
                                  : "دفع باطل ومخالف للنص! سقطت إحدى مطارق الحصانة 🔨"}
                              </p>
                              <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                                {currentQ.type === "scenario"
                                  ? (currentQ as any).choices[scenarioChoice ?? 0]?.feedback
                                  : currentQ.explanation}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Layer 2: Statutory Citation Box (المنطوق الصريح) */}
                        {currentQ.statutoryCitation && (
                          <div className={`p-4 rounded-xl border flex items-start gap-3 ${isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50 border-slate-200"}`}>
                            <Scales size={20} className="text-[#C8A762] shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                              <p className="font-bold text-[#C8A762]">
                                السند النظامي الحرفي: {currentQ.statutoryCitation.instrument} — {currentQ.statutoryCitation.article}
                              </p>
                              {currentQ.statutoryCitation.textSnippet && (
                                <p className={`italic leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                                  &ldquo;{currentQ.statutoryCitation.textSnippet}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Layer 3: The Practitioner Trap & Practical Tip */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className={`p-3.5 rounded-xl border text-xs ${isDark ? "bg-amber-500/5 border-amber-500/20 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <WarningCircle size={15} className="text-amber-400" />
                              <span>مصيدة المحامين الشائعة:</span>
                            </div>
                            <p className="text-[11px] opacity-85 leading-relaxed">
                              {currentQ.trapInsight || "عدم مراعاة الفارق بين القواعد الآمرة والقواعد التكميلية يوقع الكثير في التكييف الخاطئ."}
                            </p>
                          </div>

                          <div className={`p-3.5 rounded-xl border text-xs ${isDark ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              <Lightbulb size={15} className="text-emerald-400" />
                              <span>تطبيق عملي من واقع المحاكم:</span>
                            </div>
                            <p className="text-[11px] opacity-85 leading-relaxed">
                              {currentQ.practicalTip || "احرص دائماً على تضمين رقم المادة وتاريخ نشرها في الجريدة الرسمية عند تحرير صحيفة الدعوى."}
                            </p>
                          </div>
                        </div>

                        {/* Next Question CTA */}
                        <div className="mt-8 flex items-center justify-between pt-4">
                          <span className={`text-[11px] font-mono hidden sm:inline-block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                            💡 اضغط <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-bold text-zinc-300 border border-white/10">Enter ↵</kbd> للمتابعة السريعة
                          </span>

                          <button
                            onClick={nextQuestion}
                            className={`px-8 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                              isGameOver
                                ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
                                : "bg-[#0B3D2E] hover:bg-[#155e41] text-[#C8A762] shadow-lg shadow-[#0B3D2E]/20"
                            }`}
                          >
                            {isGameOver
                              ? "سقطت الحصانة القضائية (عرض النتيجة)"
                              : currentIndex < quizQuestions.length - 1
                              ? "المرافعة التالية"
                              : "عرض النتيجة النهائية"}{" "}
                            <ArrowLeft size={16} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              </motion.div>
            )}

            {/* STAGE 3: RESULT SCREEN (SKILL RADAR & CREDENTIAL CARD) */}
            {stage === "result" && (
              <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`${cardClass} p-8 md:p-12 text-center max-w-3xl mx-auto shadow-2xl overflow-hidden relative`}>
                <div className="absolute top-0 left-0 w-full h-36 bg-gradient-to-b from-[#C8A762]/15 to-transparent pointer-events-none" />

                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#0B3D2E] to-emerald-800 text-[#C8A762] shadow-2xl mb-6 border-4 border-[#C8A762]/30">
                    <Medal size={48} weight="duotone" />
                  </div>

                  <h2 className="text-3xl font-black mb-2">
                    {isGameOver ? "انتهت المرافعة! أداء متميز ⚖️" : "اكتملت المرافعة بنجاح! 🎉"}
                  </h2>
                  <p className={`text-xs mb-8 max-w-md mx-auto leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    {isGameOver
                      ? "استنفدت مطارق الحصانة القضائية الخمسة. تم رصد مستواك المعرفي وإدراجه في سجل الأكاديمية."
                      : "تم توثيق إجاباتك ورصد كفاءتك القانونية في استحضار وتكييف النصوص النظامية."}
                  </p>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                    <div className={`p-4 rounded-2xl ${isDark ? "bg-white/[0.03] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                      <p className="text-[10px] font-bold uppercase mb-1 opacity-60">دقة الاستناد</p>
                      <p className="text-2xl font-black font-mono text-[#C8A762]">{accuracyScore}%</p>
                    </div>
                    <div className={`p-4 rounded-2xl ${isDark ? "bg-white/[0.03] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                      <p className="text-[10px] font-bold uppercase mb-1 opacity-60">النقاط المكتسبة</p>
                      <p className="text-2xl font-black font-mono text-emerald-400">+{score * 10}</p>
                    </div>
                    <div className={`p-4 rounded-2xl ${isDark ? "bg-white/[0.03] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                      <p className="text-[10px] font-bold uppercase mb-1 opacity-60">أطول مرافعة</p>
                      <p className="text-2xl font-black font-mono text-amber-400">🔥 {highestStreak}</p>
                    </div>
                    <div className={`p-4 rounded-2xl ${isDark ? "bg-white/[0.03] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                      <p className="text-[10px] font-bold uppercase mb-1 opacity-60">زمن المرافعة</p>
                      <p className="text-xl font-bold font-mono mt-1">{fmtTimer(timer)}</p>
                    </div>
                  </div>

                  {/* 📊 Visual Legal Skill Radar Assessment */}
                  <div className={`p-6 rounded-2xl border mb-8 text-right ${isDark ? "bg-black/30 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C8A762] mb-4 flex items-center gap-2">
                      <TrendUp size={16} /> رادار الكفاءة والمهارات القانونية:
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>دقة الاستناد وتطبيق النص (Precision)</span>
                          <span className="font-mono text-[#C8A762]">{precisionScore}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-[#C8A762]" style={{ width: `${precisionScore}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>سرعة الاستحضار الذهني (Agility)</span>
                          <span className="font-mono text-emerald-400">{speedScore}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${speedScore}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>قوة الملاحظة وصيد الثغرات (Issue Spotting)</span>
                          <span className="font-mono text-blue-400">{accuracyScore}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${accuracyScore}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CTAs */}
                  <div className="flex justify-center gap-3 flex-wrap">
                    <button onClick={() => setStage("setup")} className={`px-6 py-3 rounded-xl text-xs font-bold border transition-colors ${isDark ? "border-white/10 hover:bg-white/5" : "border-zinc-200 hover:bg-zinc-50"}`}>
                      تحدي جديد
                    </button>
                    <button onClick={() => setActiveTab("leaderboard")} className="bg-[#C8A762] text-zinc-950 px-6 py-3 rounded-xl text-xs font-bold hover:bg-[#d8b873] transition-colors flex items-center gap-2">
                      <Crown size={16} weight="fill" /> لوحة المتصدرين
                    </button>
                    <button onClick={() => setActiveTab("vault_explorer")} className="bg-emerald-800 text-white px-6 py-3 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2">
                      <BookOpen size={16} /> فحص بنك المواد (16k)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        )}

      </div>
    </div>
  );
}

function TargetIcon(props: any) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
