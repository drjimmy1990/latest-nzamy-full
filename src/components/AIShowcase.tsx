"use client";

import { motion } from "framer-motion";
import { memo } from "react";
import { 
  Brain, 
  Sparkle, 
  ArrowLeft,
  ArrowRight,
  FileText,
  MagnifyingGlass,
  ShieldCheck,
  Books,
  PenNib,
  Scales,
  TextAlignLeft,
  WarningCircle
} from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import Link from "next/link";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

const AiFeatureCard = memo(function AiFeatureCard({
  icon: Icon,
  title,
  desc,
  delay,
  isDark
}: {
  icon: PhosphorIcon;
  title: string;
  desc: string;
  delay: number;
  isDark: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay }}
      whileHover={{ y: -4 }}
      className={`group flex flex-col gap-3 rounded-2xl border p-5 transition-all hover:shadow-lg ${
        isDark 
          ? "border-white/10 bg-white/5 hover:bg-white/10" 
          : "border-slate-200/50 bg-white hover:border-gold/30"
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold-dark transition-transform group-hover:scale-110`}>
        <Icon size={20} weight="duotone" />
      </div>
      <div>
        <h4 className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-ink"}`}>{title}</h4>
        <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-gray-400" : "text-ink-muted"}`}>{desc}</p>
      </div>
    </motion.div>
  );
});

export default function AIShowcase() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";

  const aiFeatures = [
    { 
      icon: FileText, 
      title: isAr ? "صياغة العقود بذكاء" : "Smart Contract Drafting",
      desc: isAr ? "توليد عقود قانونية مخصصة ومحمية من الثغرات في ثوانٍ." : "Generate custom, watertight legal contracts in seconds."
    },
    { 
      icon: MagnifyingGlass, 
      title: isAr ? "فحص العقود ونقاط الضعف" : "Contract Review & Flaws",
      desc: isAr ? "تحليل فوري للمخاطر وتحديد البنود التعسفية." : "Instant risk analysis and identification of unfair clauses."
    },
    { 
      icon: ShieldCheck, 
      title: isAr ? "محاكاة دفاع الخصم" : "Opponent Defense Simulation",
      desc: isAr ? "توقع دفوع الخصم المحتملة وكيفية الرد عليها مسبقاً." : "Anticipate potential counter-arguments and how to reply."
    },
    { 
      icon: Books, 
      title: isAr ? "استخراج السوابق القضائية" : "Extract Precedents",
      desc: isAr ? "بحث فائق السرعة في مئات الآلاف من الأحكام المشابهة." : "Ultra-fast search across hundreds of thousands of rulings."
    },
    { 
      icon: PenNib, 
      title: isAr ? "صياغة اللوائح الاعتراضية" : "Draft Objection Memos",
      desc: isAr ? "كتابة مذكرات الاستئناف بناءً على أخطاء الحكم الابتدائي." : "Write appeal memos based on primary ruling errors."
    },
    { 
      icon: Scales, 
      title: isAr ? "البحث الذكي في الأنظمة" : "Smart Law Search",
      desc: isAr ? "إجابات موثقة بنصوص المواد ولائحتها التنفيذية." : "Answers backed by specific legal articles and regulations."
    },
    { 
      icon: TextAlignLeft, 
      title: isAr ? "تلخيص الأحكام الطويلة" : "Summarize Long Rulings",
      desc: isAr ? "تحويل صكوك الأحكام المُطولة إلى ملخص تنفيذي." : "Convert lengthy court documents into executive summaries."
    },
    { 
      icon: WarningCircle, 
      title: isAr ? "كشف الثغرات الإجرائية" : "Detect Procedural Flaws",
      desc: isAr ? "مراجعة إجراءات التقاضي وتحديد بطلانها المحتمل." : "Review litigation procedures and detect potential invalidity."
    }
  ];

  return (
    <section id="ai-features" className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-surface via-royal/[0.02] to-surface dark:from-dark-bg dark:via-dark-card/30 dark:to-dark-bg" />

      <div className="relative mx-auto max-w-[1400px] px-4">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-center">
          
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: isAr ? 30 : -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
            className="lg:w-1/3"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-1.5">
              <Sparkle size={14} weight="fill" className="text-gold" />
              <span className="text-xs font-bold text-gold-dark">{isAr ? "نظامي AI MAX" : "Nezamy AI MAX"}</span>
            </div>

            <h2 className={`font-brand text-3xl font-extrabold tracking-tight md:text-5xl leading-tight ${isDark ? "text-white" : "text-royal"}`}>
              {isAr ? "ذكاء اصطناعي يفهم القانون السعودي" : "AI That Understands Saudi Law"}
            </h2>

            <p className={`mt-6 text-base leading-relaxed ${isDark ? "text-gray-400" : "text-ink-muted"}`}>
              {isAr 
                ? "ليس مجرد دردشة عامة — ذراعك الأيمن المدرب حصرياً على الأنظمة السعودية، واللوائح التنفيذية، والسوابق القضائية. ينجز ساعات من العمل في ثوانٍ بدقة متناهية." 
                : "Not just general chat — your right arm exclusively trained on Saudi laws, regulations, and precedents. Does hours of work in seconds with extreme precision."}
            </p>

            <Link href="/ai" className="mt-8 inline-block">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center justify-center gap-3 rounded-2xl bg-royal px-8 py-4 text-sm font-bold text-white shadow-lg shadow-royal/30 transition-all hover:bg-royal-light"
              >
                <Brain size={20} weight="fill" className="text-gold" />
                {isAr ? "جرّب قدرات AI الآن" : "Try AI Capabilities Now"}
                {isAr ? <ArrowLeft size={16} weight="bold" className="transition-transform group-hover:-translate-x-1" /> : <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-1" />}
              </motion.div>
            </Link>
          </motion.div>

          {/* Right Grid (Bento) */}
          <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {aiFeatures.map((feature, idx) => (
              <AiFeatureCard
                key={idx}
                icon={feature.icon}
                title={feature.title}
                desc={feature.desc}
                delay={idx * 0.05}
                isDark={isDark}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
