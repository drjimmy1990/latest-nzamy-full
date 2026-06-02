import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldWarning, CheckCircle, Warning, SealCheck, 
  ArrowsInLineHorizontal, CaretDown, ThumbsUp 
} from "@phosphor-icons/react";

interface StepRAnalysisProps {
  isDark: boolean;
}

type ClauseCategory = "favorable" | "moderate" | "negotiable" | "dangerous" | "critical";

interface ContractClause {
  id: number;
  article: string;
  title: string;
  text: string;
  category: ClauseCategory;
  analysis: string;
  scenario?: string;
  benefit?: string;
  suggestionA?: string;
  suggestionB?: string;
}

// ─── Mock Clauses based on the User's Risk Levels ─────────────────────────────
const contractClauses: ContractClause[] = [
  {
    id: 1,
    article: "م.٤",
    title: "الشروط الجزائية والتفسيخ",
    text: "يحق للطرف الأول إنهاء العقد ومصادرة الدفعة المقدمة دون إنذار أو اللجوء للقضاء بمجرد التأخير ليوم واحد...",
    category: "critical",
    analysis: "هذا البند يمنح الطرف الآخر سلطة مطلقة تؤدي لخسائر فادحة بمجرد أي تأخير بسيط، وتتنافى مع مبدأ حسن النية في التعامل التجاري.",
    scenario: "إذا تأخرت يوماً واحداً لأسباب خارجة عن إرادتك، سيتم إلغاء العقد ومصادرة مبالغك دون فرصة للتدارك.",
    suggestionA: "يجب إزالة حق الإلغاء الفوري واشتراط توجيه إنذار كتابي بمهلة لا تقل عن 15 يوماً للتدارك قبل اتخاذ أي إجراء.",
    suggestionB: "تطبيق غرامة تأخير معقولة بحد أقصى 10% بدلاً من الفسخ والمصادرة الفورية العسفية."
  },
  {
    id: 2,
    article: "م.١٠",
    title: "حصرية توريد المواد",
    text: "يُمنع الطرف الثاني من استيراد أي مواد مشابهة من موردين آخرين طوال فترة سريان العقد...",
    category: "dangerous",
    analysis: "الاحتكار الكامل سيحد من قدرتك على تنويع الموردين وقد يؤدي لتوقف عملياتك في حال عجز الطرف الأول عن التوريد.",
    scenario: "إذا انقطع التوريد من الطرف الأول، ستتوقف أعمالك ولن تتمكن من اللجوء لمورد بديل بسبب شرط الحصرية.",
    suggestionA: "تقييد الحصرية لتكون متعلقة بمشروع محدد فقط، وليس بكل أعمالك.",
    suggestionB: "إلغاء الحصرية أو إضافة استثناء يسمح لك بالشراء من آخرين إذا عجز الطرف الأول، أو زاد الأسعار."
  },
  {
    id: 3,
    article: "م.٧",
    title: "الاختصاص القضائي",
    text: "تخضع النزاعات للاختصاص الإقليمي لمحاكم مدينة أبها...",
    category: "negotiable",
    analysis: "مقر شركتك الرئيسي في الرياض، بينما يفرض العقد الترافع في أبها، مما يزيد عبء التقاضي في حال نشوب نزاع.",
    suggestionA: "تغيير الاختصاص ليكون المركز السعودي للتحكيم التجاري، لتسريع تسوية النزاعات وفي بيئة محايدة.",
    suggestionB: "تعديل الاختصاص ليكون متبادلاً (محاكم مقر المدعى عليه)، لتحقيق العدالة وتقليل تكلفة رفع الدعاوى التحوطية."
  },
  {
    id: 4,
    article: "م.٢",
    title: "آلية الدفعات",
    text: "تتم الدفعات خلال ٦٠ يوماً من استلام الفاتورة النهائية بعد الموافقة عليها...",
    category: "moderate",
    analysis: "فترة سداد متأخرة نوعاً ما (60 يوماً)، لكنها مقبولة بالمعايير التجارية الحالية للشركات الكبرى.",
    suggestionA: "تقليل المدة إلى 30 يوماً متوافقة مع التدفق النقدي لديك لتفادي الاعتماد على تمويل إضافي."
  },
  {
    id: 5,
    article: "م.١٢",
    title: "حماية الملكية الفكرية",
    text: "تظل كافة حقوق الملكية الفكرية للبرمجيات ملكاً حصرياً للطرف الثاني دون أي قيد.",
    category: "favorable",
    analysis: "بند ممتاز يحفظ كل حقوق الابتكار والملكية لك، ويمنع الطرف الأول من التصرف بها أو نسبتها إليه.",
    benefit: "تأمين كامل لجهودك ومصالحك المستقبلية، وهو أفضل حماية قانونية ممكنة لك."
  }
];

// ─── Styles matching Showcase ────────────────────────────────────────────────
const categoryStyle: Record<ClauseCategory, {
  pill: string; activeBg: string; borderDark: string; borderLight: string;
  cardLight: string; cardDark: string; quoteBar: string; icon: React.ReactNode; label: string;
}> = {
  favorable: {
    pill: "bg-emerald-500/90 text-white", activeBg: "bg-emerald-600",
    borderDark: "dark:border-emerald-700/40", borderLight: "border-emerald-200", 
    cardDark: "dark:bg-emerald-950/50", cardLight: "bg-emerald-50/80", quoteBar: "border-emerald-400",
    icon: <SealCheck size={12} weight="fill" />, label: "لصالحك"
  },
  moderate: {
    pill: "bg-zinc-500/80 text-white", activeBg: "bg-zinc-600",
    borderDark: "dark:border-zinc-600/40", borderLight: "border-zinc-200",
    cardDark: "dark:bg-zinc-800/50", cardLight: "bg-zinc-50/80", quoteBar: "border-zinc-400",
    icon: <ArrowsInLineHorizontal size={12} weight="fill" />, label: "معتدلة"
  },
  negotiable: {
    pill: "bg-amber-500/90 text-white", activeBg: "bg-amber-600",
    borderDark: "dark:border-amber-700/50", borderLight: "border-amber-200",
    cardDark: "dark:bg-amber-950/50", cardLight: "bg-amber-50/70", quoteBar: "border-amber-400",
    icon: <Warning size={12} weight="fill" />, label: "تفاوضية"
  },
  dangerous: {
    pill: "bg-orange-500/90 text-white", activeBg: "bg-orange-600",
    borderDark: "dark:border-orange-700/50", borderLight: "border-orange-200",
    cardDark: "dark:bg-orange-950/50", cardLight: "bg-orange-50/70", quoteBar: "border-orange-400",
    icon: <ShieldWarning size={12} weight="fill" />, label: "خطر"
  },
  critical: {
    pill: "bg-red-600 text-white", activeBg: "bg-red-700",
    borderDark: "dark:border-red-700/50", borderLight: "border-red-200",
    cardDark: "dark:bg-red-950/50", cardLight: "bg-red-50/70", quoteBar: "border-red-500",
    icon: <ShieldWarning size={12} weight="fill" />, label: "خطرة جداً"
  }
};

export function StepRAnalysis({ isDark }: StepRAnalysisProps) {
  const [selected, setSelected] = useState<ContractClause | null>(null);
  const [amendTab, setAmendTab] = useState<"a" | "b">("a");
  const [filterTab, setFilterTab] = useState<"all" | ClauseCategory>("all");

  const cardContainer = isDark ? "bg-zinc-900 border-white/[0.07] border rounded-2xl" : "bg-white border-zinc-200 border rounded-2xl";

  const displayed = filterTab === "all" ? contractClauses : contractClauses.filter(c => c.category === filterTab);

  // Tabs
  const tabs = [
    { val: "all" as const, label: "الكل", count: contractClauses.length },
    { val: "critical" as const, label: categoryStyle.critical.label, count: contractClauses.filter(c => c.category === "critical").length },
    { val: "dangerous" as const, label: categoryStyle.dangerous.label, count: contractClauses.filter(c => c.category === "dangerous").length },
    { val: "negotiable" as const, label: categoryStyle.negotiable.label, count: contractClauses.filter(c => c.category === "negotiable").length },
    { val: "moderate" as const, label: categoryStyle.moderate.label, count: contractClauses.filter(c => c.category === "moderate").length },
    { val: "favorable" as const, label: categoryStyle.favorable.label, count: contractClauses.filter(c => c.category === "favorable").length },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Overview Block */}
      <div className={`${cardContainer} p-5 text-center shadow-sm relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-tr from-red-500/5 via-transparent to-emerald-500/5 opacity-50" />
        <h3 className={`text-[16px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تحليل المخاطر العميق (Workflow AI)</h3>
        <p className={`text-[13px] mb-4 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>قم بالضغط على البنود أدناه للوصول للتعديلات المحترفة المقترحة.</p>

        <div className="flex gap-1 h-3 rounded-full overflow-hidden w-[90%] mx-auto shadow-inner">
          <div className="bg-red-600 w-[10%]" title="خطرة جداً" />
          <div className="bg-orange-500 w-[15%]" title="خطر" />
          <div className="bg-amber-500 w-[15%]" title="تفاوضية" />
          <div className="bg-zinc-400 dark:bg-zinc-600 w-[20%]" title="معتدلة" />
          <div className="bg-emerald-500 w-[40%]" title="لصالحك" />
        </div>
      </div>

      <div className={cardContainer}>
        {/* Filter Tabs */}
        <div className={`flex flex-wrap gap-1 border-b px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-900/50 rounded-t-2xl" : "border-slate-200 bg-slate-50 rounded-t-2xl"}`}>
          {tabs.map(({ val, label, count }) => {
            const active = filterTab === val;
            const s = val !== "all" ? categoryStyle[val as ClauseCategory] : null;
            return (
              <button
                key={val}
                onClick={() => setFilterTab(val)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                  active
                    ? s ? `${s.activeBg} text-white` : "bg-zinc-800 dark:bg-white text-white dark:text-zinc-900"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-white/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Clause List */}
        <div className="divide-y relative max-h-[500px] overflow-y-auto w-full dark:divide-white/[0.05] divide-zinc-100">
          <AnimatePresence>
            {displayed.map((clause, idx) => {
              const isOpen = selected?.id === clause.id;
              const s = categoryStyle[clause.category];

              return (
                <motion.div key={clause.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}>
                  <button
                    onClick={() => { setSelected(isOpen ? null : clause); setAmendTab("a"); }}
                    className={`w-full text-start px-4 py-3.5 transition-colors duration-150 ${
                      isOpen
                        ? isDark ? "bg-white/[0.03]" : "bg-zinc-50/80"
                        : "hover:bg-zinc-50 dark:hover:bg-white/[0.025]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.pill}`}>
                            {s.icon} {s.label}
                          </span>
                        </div>
                        <p className={`text-[13px] font-semibold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{clause.title}</p>
                        <p className={`text-xs leading-relaxed line-clamp-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{clause.text}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{clause.article}</span>
                        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <CaretDown size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                        </motion.span>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className={`px-4 pb-4 pt-1 space-y-4 ${isDark ? "bg-zinc-950/40" : "bg-slate-50/50"}`}>
                          <blockquote className={`border-s-2 ps-3 text-xs leading-relaxed italic ${s.quoteBar} ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                            {clause.text}
                          </blockquote>

                          <div>
                            <p className={`text-[10px] font-bold uppercase mb-1.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>التحليل</p>
                            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{clause.analysis}</p>
                          </div>

                          {clause.benefit && (
                            <div className="flex items-start gap-2">
                              <ThumbsUp size={13} weight="fill" className="mt-0.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                              <p className={`text-[12px] font-medium leading-relaxed text-emerald-700 dark:text-emerald-300`}>{clause.benefit}</p>
                            </div>
                          )}

                          {clause.scenario && (
                            <div className={`rounded-xl border px-3 py-2.5 ${isDark ? "border-orange-900/50 bg-orange-950/40" : "border-orange-200 bg-orange-50"}`}>
                              <p className={`text-[10px] font-bold uppercase mb-1 ${isDark ? "text-orange-400" : "text-orange-600"}`}>السيناريو السلبي المحتمل</p>
                              <p className={`text-[12px] leading-relaxed ${isDark ? "text-orange-200" : "text-orange-700"}`}>{clause.scenario}</p>
                            </div>
                          )}

                          {(clause.suggestionA || clause.suggestionB) && (
                            <div>
                              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>الدفاع والتعديلات (Workflow)</p>
                              <div className={`flex mb-0 border rounded-xl overflow-hidden text-[11px] font-bold ${isDark ? "border-white/[0.08]" : "border-zinc-200"}`}>
                                {[
                                  { t: "a" as const, l: "تعديل دفاعي قوي" },
                                  { t: "b" as const, l: "تعديل تفاوضي متوازن" }
                                ].filter(opt => opt.t === "a" ? !!clause.suggestionA : !!clause.suggestionB) // Add filter to only render available buttons if missing
                                .map(({ t, l }) => (
                                  <button key={t} onClick={(e) => { e.stopPropagation(); setAmendTab(t); }}
                                    className={`flex-1 py-2 px-3 transition-colors text-center ${
                                      amendTab === t
                                        ? t === "a"
                                          ? isDark ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-600 text-white"
                                          : isDark ? "bg-[#0B3D2E]/60 text-[#C8A762]" : "bg-[#0B3D2E] text-[#C8A762]"
                                        : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                                    }`}>
                                    {l}
                                  </button>
                                ))}
                              </div>
                              <div className={`rounded-b-xl border border-t-0 px-3.5 py-3 text-[12px] leading-relaxed ${
                                isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200" : "border-zinc-200 bg-white text-zinc-700"
                              }`}>
                                {amendTab === "a" ? clause.suggestionA : clause.suggestionB}
                              </div>
                              
                              {/* Workflow Actions */}
                              <div className="flex items-center justify-end gap-2 mt-3 p-1">
                                <button className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors border ${isDark ? "bg-zinc-800 border-white/10 text-zinc-300 hover:text-white" : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900"}`}>
                                  تعديل مخصص (يدوي)
                                </button>
                                <button className="px-4 py-2 rounded-lg text-xs font-bold bg-[#0B3D2E] text-white shadow-sm hover:bg-[#155e41] transition-colors">
                                  اعتماد هذا التعديل 
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
