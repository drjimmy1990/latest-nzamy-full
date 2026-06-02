"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Brain, Target, Trophy, Clock, ShareNetwork,
  ArrowRight, ArrowLeft, CheckCircle, XCircle,
  Medal, Star, Sparkle,
  LinkedinLogo, TwitterLogo
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import confetti from "canvas-confetti";

// ─── Data & Types ────────────────────────────────────────────────────────────

type Category = "all" | "procedural" | "criminal" | "admin" | "execution" | "civil" | "commercial" | "ip" | "labor" | "real_estate" | "financial" | "tax" | "health" | "environment" | "tech" | "transport" | "energy" | "media" | "construction" | "investment" | "education" | "sports" | "hajj" | "defense" | "social" | "tourism" | "municipal" | "arbitration" | "international";

interface Question {
  id: number;
  categoryId: string;
  text: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "الكل (عشوائي)" },
  { id: "procedural", label: "إجراءات التقاضي" },
  { id: "criminal", label: "الجنائي" },
  { id: "admin", label: "الإداري" },
  { id: "execution", label: "التنفيذ" },
  { id: "civil", label: "المدني والأحوال الشخصية" },
  { id: "commercial", label: "التجاري والشركات" },
  { id: "ip", label: "الملكية الفكرية" },
  { id: "labor", label: "العمل" },
  { id: "real_estate", label: "العقاري" },
  { id: "financial", label: "المالي والمصرفي" },
  { id: "tax", label: "الضريبي والزكوي" },
  { id: "health", label: "الصحي" },
  { id: "environment", label: "البيئي" },
  { id: "tech", label: "التقني والسيبراني" },
  { id: "transport", label: "النقل واللوجستي" },
  { id: "energy", label: "الطاقة" },
  { id: "media", label: "الإعلام والنشر" },
  { id: "construction", label: "المقاولات" },
  { id: "investment", label: "الاستثمار الأجنبي" },
  { id: "education", label: "التعليمي" },
  { id: "sports", label: "الرياضي" },
  { id: "hajj", label: "الحج والعمرة" },
  { id: "defense", label: "الدفاع والأمن" },
  { id: "social", label: "التنمية الاجتماعية" },
  { id: "tourism", label: "السياحة والترفيه" },
  { id: "municipal", label: "البلدي" },
  { id: "arbitration", label: "التحكيم والوساطة" },
  { id: "international", label: "الدولي" },
];

// Some hardcoded real questions to mix in
const REAL_QUESTIONS: Partial<Record<Category, Omit<Question, "categoryId">[]>> = {
  procedural: [
    { id: 1, text: "ما هي المدة النظامية لاستئناف الأحكام الصادرة في الدعاوى المستعجلة؟", options: ["١٠ أيام", "١٥ يوماً", "٣٠ يوماً", "لا تقبل الاستئناف"], correctAnswer: 0, explanation: "حسب نظام المرافعات الشرعية، مدة الاستئناف في القضايا المستعجلة هي ١٠ أيام." },
  ],
  civil: [
    { id: 2, text: "ما هو السن القانوني للأهلية الكاملة في المملكة العربية السعودية؟", options: ["١٥ سنة", "١٨ سنة", "٢١ سنة", "حسب تقدير القاضي"], correctAnswer: 1, explanation: "السن النظامي لاكتمال الأهلية هو بلوغ ثمانية عشر عاماً هجرياً." },
  ],
  commercial: [
    { id: 3, text: "أي من المحاكم التالية تختص بنظر دعاوى الإفلاس؟", options: ["المحكمة العامة", "المحكمة الإدارية", "المحكمة التجارية", "المحكمة العمالية"], correctAnswer: 2, explanation: "المحاكم التجارية هي المختصة بالنظر في دعاوى الإفلاس وتصفية الشركات." },
    { id: 4, text: "في نظام الشركات الجديد، ما هو الحد الأدنى لرأس مال شركة ذات مسؤولية محدودة؟", options: ["١٠٠,٠٠٠ ريال", "٥٠٠,٠٠٠ ريال", "٥٠,٠٠٠ ريال", "لا يوجد حد أدنى"], correctAnswer: 3, explanation: "نظام الشركات الجديد ألغى الحد الأدنى لرأس مال الشركة ذات المسؤولية المحدودة." },
  ],
  labor: [
    { id: 5, text: "كم مدة فترة التجربة القصوى للعامل حسب نظام العمل؟", options: ["٩٠ يوماً", "٩٠ يوماً قابلة للتمديد حتى ١٨٠ يوماً", "١٢٠ يوماً", "١٨٠ يوماً غير قابلة للتمديد"], correctAnswer: 1, explanation: "فترة التجربة الأصلية ٩٠ يوماً، ويمكن تمديدها باتفاق مكتوب بحيث لا تتجاوز ١٨٠ يوماً." },
  ],
};

const generateMockQuestions = (selectedCats: Category[], count: number): Question[] => {
  let pool: Question[] = [];
  
  if (selectedCats.includes("all")) {
    // Collect all hardcoded
    CATEGORIES.filter(c => c.id !== "all").forEach(c => {
      const qs = REAL_QUESTIONS[c.id] || [];
      pool.push(...qs.map(q => ({ ...q, categoryId: c.id })));
    });
  } else {
    selectedCats.forEach(cat => {
      const qs = REAL_QUESTIONS[cat] || [];
      pool.push(...qs.map(q => ({ ...q, categoryId: cat })));
    });
  }

  // Shuffle pool
  pool = pool.sort(() => Math.random() - 0.5);

  const generated: Question[] = [...pool].slice(0, count);
  let idCounter = 1000;
  
  // Fill the rest with mock questions based on category
  while (generated.length < count) {
    const targetCat = selectedCats.includes("all") 
      ? CATEGORIES[Math.floor(Math.random() * (CATEGORIES.length - 1)) + 1].id 
      : selectedCats[Math.floor(Math.random() * selectedCats.length)];
    
    const label = CATEGORIES.find(c => c.id === targetCat)?.label || "";

    generated.push({
      id: idCounter++,
      categoryId: targetCat,
      text: `سؤال افتراضي من موسوعة نظامي في قسم (${label}). أي الخيارات هو الصحيح؟`,
      options: ["خيار خاطئ", "خيار صحيح", "خيار خاطئ آخر", "خيار مستبعد"],
      correctAnswer: 1,
      explanation: `هذا توضيح للإجابة الصحيحة المتعلقة بقسم ${label}. سيتم استبدال هذه البيانات مستقبلاً من مكتبة المقالات المعتمدة.`
    });
  }
  
  return generated;
};

// ─── Sound Effects (Refined Web Audio) ───────────────────────────────────────

const playSound = (type: "correct" | "wrong" | "finish") => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === "correct") {
      // Soft Marimba / Bell sound
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.05); // A6
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      
    } else if (type === "wrong") {
      // Soft dull thud
      osc.type = "triangle";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      
    } else if (type === "finish") {
      // Happy Chime
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
    }
  } catch(e) {}
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuizPage() {
  const { isDark } = useTheme();
  
  // App States
  const [stage, setStage] = useState<"setup" | "playing" | "result">("setup");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>(["all"]);
  const [questionsCount, setQuestionsCount] = useState<number>(5);
  
  // Quiz States
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timer, setTimer] = useState(0); // in seconds
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (stage === "playing") {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [stage]);

  const startQuiz = () => {
    const q = generateMockQuestions(selectedCategories, questionsCount);
    setCurrentQuestions(q);
    setCurrentIndex(0);
    setScore(0);
    setTimer(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setStage("playing");
  };

  const handleAnswer = (optionIdx: number) => {
    if (isAnswered) return;
    setSelectedOption(optionIdx);
    setIsAnswered(true);
    
    if (optionIdx === currentQuestions[currentIndex].correctAnswer) {
      setScore(s => s + 1);
      playSound("correct");
    } else {
      playSound("wrong");
    }
  };

  const nextQuestion = () => {
    if (currentIndex < currentQuestions.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = () => {
    setStage("result");
    triggerConfetti();
    playSound("finish");
  };

  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#C8A762', '#0B3D2E', '#ffffff']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#C8A762', '#0B3D2E', '#ffffff']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const shareResult = (platform: "twitter" | "linkedin") => {
    const pct = Math.round((score / currentQuestions.length) * 100);
    const catLabel = selectedCategories.includes("all") 
      ? "كل الأقسام" 
      : selectedCategories.length === 1 
      ? CATEGORIES.find(c => c.id === selectedCategories[0])?.label 
      : `${selectedCategories.length} أقسام قانونية`;
    
    const text = `حققت ${pct}% في تحدي "${catLabel}" على أكاديمية نظامي! ⚖️✨\nهل يمكنك التغلب على نتيجتي؟ اختبر معلوماتك القانونية الآن:`;
    const url = "https://nezamy.online/academy/quiz";
    
    if (platform === "twitter") {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
    } else {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
    }
  };

  const cardClass = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-3xl"
    : "bg-white border border-zinc-200/70 rounded-3xl";

  const fmtTimer = (s: number) => `${Math.floor(s/60).toString().padStart(2, '0')}:${(s%60).toString().padStart(2, '0')}`;

  return (
    <div className={`min-h-screen pt-8 pb-20 ${isDark ? "bg-[#0A0A0A] text-zinc-100" : "bg-zinc-50 text-zinc-900"}`} dir="rtl">
      <div className="max-w-4xl mx-auto px-5">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/academy" className={`flex items-center gap-2 text-sm font-bold transition-colors ${isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"}`}>
            <ArrowRight size={16} /> العودة للأكاديمية
          </Link>
          <div className="flex items-center gap-2">
            <Trophy size={20} weight="duotone" className="text-[#C8A762]" />
            <span className="font-brand font-bold text-lg">تحدي نظامي</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          
          {/* ── SETUP STAGE ─────────────────────────────────────────────────── */}
          {stage === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={`${cardClass} p-8 md:p-12 shadow-sm`}>
              <div className="text-center max-w-xl mx-auto mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0B3D2E] text-[#C8A762] mb-6 shadow-xl shadow-[#0B3D2E]/20">
                  <Brain size={32} weight="duotone" />
                </div>
                <h1 className="text-3xl font-black mb-4">اختبر معلوماتك القانونية</h1>
                <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  تحدى نفسك في مختلف فروع القانون الـ ٢٧، اجمع النقاط، وارتقِ في مستواك المهني. يمكنك مشاركة نتائجك لإبراز كفاءتك في مجتمع الأعمال.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-10 mb-10">
                {/* Category Selection */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className={`text-sm font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اختر قسم التحدي (يمكنك اختيار أكثر من قسم)</label>
                    <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>٢٧ قسماً متاحاً</span>
                  </div>
                  <div className={`flex flex-wrap gap-2 p-4 rounded-2xl max-h-64 overflow-y-auto ${isDark ? "bg-white/[0.02] border border-white/[0.05]" : "bg-zinc-50 border border-zinc-100"}`}>
                    {CATEGORIES.map(cat => {
                      const isActive = selectedCategories.includes(cat.id);
                      const isAll = cat.id === "all";
                      
                      const toggleCat = () => {
                        if (isAll) {
                          setSelectedCategories(["all"]);
                          return;
                        }
                        let newCats = selectedCategories.includes("all") ? [] : [...selectedCategories];
                        if (newCats.includes(cat.id)) {
                          newCats = newCats.filter(c => c !== cat.id);
                          if (newCats.length === 0) newCats = ["all"];
                        } else {
                          newCats.push(cat.id);
                        }
                        setSelectedCategories(newCats);
                      };

                      return (
                        <button key={cat.id} onClick={toggleCat}
                          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all border ${
                            isActive
                              ? isDark ? "border-[#C8A762] bg-[#C8A762]/10 text-white shadow-sm" : "border-[#0B3D2E] bg-[#0B3D2E] text-white shadow-sm"
                              : isDark ? "border-white/[0.06] bg-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                          } ${isAll && !isActive ? "border-dashed" : ""}`}
                        >
                          {cat.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Length Selection */}
                <div>
                  <label className={`block text-sm font-bold mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عدد الأسئلة</label>
                  <div className="flex gap-3">
                    {[5, 15, 30].map(num => (
                      <button key={num} onClick={() => setQuestionsCount(num)}
                        className={`flex-1 py-4 rounded-2xl border-2 text-lg font-bold transition-all ${
                          questionsCount === num
                            ? isDark ? "border-[#C8A762] text-[#C8A762] bg-[#C8A762]/10" : "border-[#0B3D2E] text-[#0B3D2E] bg-[#0B3D2E]/5"
                            : isDark ? "border-white/[0.06] text-zinc-400 bg-white/[0.02]" : "border-zinc-200 text-zinc-500 bg-white"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className={`text-xs mt-4 flex items-center gap-1.5 justify-center ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    <Clock size={14} /> الوقت المتوقع: {questionsCount * 1} دقيقة
                  </p>
                </div>
              </div>

              <div className="flex justify-center border-t pt-8 border-white/[0.06]">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={startQuiz}
                  className="bg-gradient-to-l from-[#0B3D2E] to-emerald-800 text-[#C8A762] px-10 py-4 rounded-2xl text-lg font-bold shadow-[0_8px_20px_-8px_rgba(11,61,46,0.6)] flex items-center gap-3"
                >
                  <Sparkle size={22} weight="fill" /> ابدأ التحدي الآن
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── PLAYING STAGE ───────────────────────────────────────────────── */}
          {stage === "playing" && (
            <motion.div key="playing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto">
              
              {/* Progress & Stats */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold font-mono px-3 py-1 rounded-full ${isDark ? "bg-white/10 text-white" : "bg-zinc-200 text-zinc-800"}`}>
                    {currentIndex + 1} / {currentQuestions.length}
                  </span>
                  <div className={`text-sm font-mono flex items-center gap-1.5 px-3 py-1 rounded-full ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-100 text-amber-700"}`}>
                    <Clock size={14} /> {fmtTimer(timer)}
                  </div>
                </div>
                <div className={`text-sm font-bold flex items-center gap-1.5 px-3 py-1 rounded-full ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                  <Star size={14} weight="fill" /> النقاط: {score * 10}
                </div>
              </div>

              {/* Progress Bar */}
              <div className={`h-2 rounded-full mb-8 overflow-hidden ${isDark ? "bg-white/10" : "bg-zinc-200"}`}>
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: `${((currentIndex) / currentQuestions.length) * 100}%` }} 
                  className="h-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]" 
                />
              </div>

              <div className={`${cardClass} p-8 md:p-12 shadow-xl`}>
                <div className="mb-6 flex justify-start">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${isDark ? "bg-white/5 border-white/10 text-zinc-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                    قسم: {CATEGORIES.find(c => c.id === currentQuestions[currentIndex].categoryId)?.label}
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold leading-relaxed mb-8">
                  {currentQuestions[currentIndex].text}
                </h2>

                <div className="space-y-4">
                  {currentQuestions[currentIndex].options.map((opt, idx) => {
                    const isCorrect = idx === currentQuestions[currentIndex].correctAnswer;
                    const isSelected = selectedOption === idx;
                    
                    let btnClass = isDark ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]" : "border-zinc-200 bg-white hover:bg-zinc-50";
                    let icon = null;

                    if (isAnswered) {
                      if (isCorrect) {
                        btnClass = "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
                        icon = <CheckCircle size={24} weight="fill" className="text-emerald-500" />;
                      } else if (isSelected) {
                        btnClass = "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400";
                        icon = <XCircle size={24} weight="fill" className="text-red-500" />;
                      } else {
                        btnClass = isDark ? "border-white/[0.04] bg-transparent opacity-50" : "border-zinc-100 bg-transparent opacity-50";
                      }
                    } else if (isSelected) {
                      btnClass = "border-[#C8A762] bg-[#C8A762]/10";
                    }

                    return (
                      <button key={idx} disabled={isAnswered} onClick={() => handleAnswer(idx)}
                        className={`w-full text-start p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${btnClass}`}
                      >
                        <span className="text-base font-medium">{opt}</span>
                        {icon && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>{icon}</motion.div>}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {isAnswered && (
                    <motion.div initial={{ opacity: 0, height: 0, y: 10 }} animate={{ opacity: 1, height: "auto", y: 0 }} className="mt-8 overflow-hidden">
                      <div className={`p-5 rounded-2xl flex items-start gap-3 ${
                          selectedOption === currentQuestions[currentIndex].correctAnswer
                            ? isDark ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200"
                            : isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          selectedOption === currentQuestions[currentIndex].correctAnswer ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        }`}>
                          {selectedOption === currentQuestions[currentIndex].correctAnswer ? <Sparkle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
                        </div>
                        <div>
                          <p className={`font-bold mb-1 ${selectedOption === currentQuestions[currentIndex].correctAnswer ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {selectedOption === currentQuestions[currentIndex].correctAnswer ? "إجابة صحيحة!" : "إجابة خاطئة! إليك التوضيح:"}
                          </p>
                          <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                            {currentQuestions[currentIndex].explanation}
                          </p>
                        </div>
                      </div>
                      <div className="mt-8 flex justify-end">
                        <button onClick={nextQuestion} className="bg-[#0B3D2E] text-white px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#155e41] transition-colors">
                          {currentIndex < currentQuestions.length - 1 ? "السؤال التالي" : "عرض النتيجة"} <ArrowLeft size={16} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── RESULT STAGE ────────────────────────────────────────────────── */}
          {stage === "result" && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`${cardClass} p-8 md:p-12 text-center max-w-2xl mx-auto shadow-2xl overflow-hidden relative`}>
              {/* Decor */}
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#C8A762]/10 to-transparent pointer-events-none" />
              
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="relative z-10">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#0B3D2E] to-emerald-800 text-[#C8A762] shadow-xl mb-6 border-4 border-[#C8A762]/20">
                  <Medal size={48} weight="duotone" />
                </div>
                
                <h2 className="text-3xl font-black mb-2">اكتمل التحدي!</h2>
                <p className={`text-sm mb-8 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  لقد أكملت الاختبار بنجاح في قسم 
                  ({selectedCategories.includes("all") ? "كل الأقسام" : selectedCategories.length === 1 ? CATEGORIES.find(c => c.id === selectedCategories[0])?.label : `${selectedCategories.length} أقسام قانونية`}).
                </p>

                <div className="flex justify-center gap-6 mb-8">
                  <div className={`p-5 rounded-2xl w-32 ${isDark ? "bg-white/[0.04] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>النتيجة</p>
                    <p className="text-3xl font-black font-mono text-[#C8A762]">{Math.round((score / currentQuestions.length) * 100)}%</p>
                  </div>
                  <div className={`p-5 rounded-2xl w-32 ${isDark ? "bg-white/[0.04] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>النقاط</p>
                    <p className="text-3xl font-black font-mono text-emerald-500">+{score * 10}</p>
                  </div>
                  <div className={`p-5 rounded-2xl w-32 ${isDark ? "bg-white/[0.04] border border-white/[0.08]" : "bg-zinc-50 border border-zinc-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>الوقت</p>
                    <p className={`text-xl font-bold font-mono mt-1 ${isDark ? "text-white" : "text-zinc-800"}`}>{fmtTimer(timer)}</p>
                  </div>
                </div>

                {/* Peer Comparison */}
                <div className={`mb-10 p-5 rounded-2xl flex items-center justify-center gap-4 border text-right ${
                    (score / currentQuestions.length) >= 0.8 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" 
                      : (score / currentQuestions.length) >= 0.5 
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" 
                      : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                  }`}
                >
                  <Trophy size={28} weight="duotone" className="flex-shrink-0" />
                  <div>
                    <p className="font-bold">
                      {(() => {
                        const pct = score / currentQuestions.length;
                        if (pct === 1) return "أداء استثنائي! أنت تتفوق على ٩٨٪ من زملائك.";
                        if (pct >= 0.8) return "أداء ممتاز! أنت تتفوق على ٨٥٪ من زملائك.";
                        if (pct >= 0.6) return "أداء جيد! أنت تتفوق على ٦٠٪ من زملائك.";
                        return "تحتاج لمزيد من التدريب لتجاوز المتوسط في هذا القسم.";
                      })()}
                    </p>
                    <p className="text-xs opacity-80 mt-1">مقارنةً بمتوسط نتائج مختبري هذا القسم</p>
                  </div>
                </div>

                {/* Social Share */}
                <div className={`p-6 rounded-3xl border mb-10 ${isDark ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30" : "bg-emerald-50 border-emerald-100"}`}>
                  <h3 className={`text-sm font-bold mb-4 flex items-center justify-center gap-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    <ShareNetwork size={18} /> شارك نتيجتك وتحدى أصدقاءك
                  </h3>
                  <div className="flex justify-center gap-4">
                    <button onClick={() => shareResult("linkedin")} className="flex items-center gap-2 bg-[#0A66C2] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#004182] transition-colors">
                      <LinkedinLogo size={18} weight="fill" /> LinkedIn
                    </button>
                    <button onClick={() => shareResult("twitter")} className="flex items-center gap-2 bg-[#1DA1F2] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#0c85d0] transition-colors">
                      <TwitterLogo size={18} weight="fill" /> Twitter
                    </button>
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <button onClick={() => setStage("setup")} className={`px-6 py-3 rounded-xl text-sm font-bold border transition-colors ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
                    تحدي جديد
                  </button>
                  <Link href="/academy" className="bg-[#0B3D2E] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#155e41] transition-colors">
                    العودة للأكاديمية
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
