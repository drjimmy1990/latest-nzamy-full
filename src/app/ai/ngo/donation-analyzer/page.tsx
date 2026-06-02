"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChartBar, Robot, Sparkle, DownloadSimple, Copy, Warning, ArrowLeft, ArrowRight, TrendUp, HandHeart, Buildings, User } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "analyzing" | "result";
type DonationType = "نقدي" | "عيني" | "هبة حكومية" | "وقف";
interface DonationEntry { id: number; donor: string; type: DonationType; amount: string; campaign: string; date: string; }
const SAMPLE: DonationEntry[] = [
  { id: 1, donor: "مؤسسة الأمل", type: "نقدي", amount: "٧٥٬٠٠٠", campaign: "حملة رمضان", date: "٢٠٢٦/٠٤" },
  { id: 2, donor: "مبرة التقنية", type: "عيني", amount: "٣٢٬٠٠٠", campaign: "دعم التعليم", date: "٢٠٢٦/٠٤" },
  { id: 3, donor: "وزارة الموارد", type: "هبة حكومية", amount: "٥٠٬٠٠٠", campaign: "التأهيل المهني", date: "٢٠٢٦/٠٣" },
  { id: 4, donor: "مجهول", type: "نقدي", amount: "١٢٬٥٠٠", campaign: "الكفالة العامة", date: "٢٠٢٦/٠٣" },
];
const TYPE_CONF: Record<DonationType, { icon: React.ElementType; color: string; bg: string }> = {
  "نقدي": { icon: HandHeart, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  "عيني": { icon: Buildings, color: "text-blue-500", bg: "bg-blue-500/10" },
  "هبة حكومية": { icon: Buildings, color: "text-purple-500", bg: "bg-purple-500/10" },
  "وقف": { icon: User, color: "text-amber-500", bg: "bg-amber-500/10" },
};
export default function DonationAnalyzerPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [period, setPeriod] = useState("الربع الأول ٢٠٢٦");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 focus:border-emerald-500" : "bg-white border-gray-200 text-gray-800 focus:border-emerald-500"}`;
  const total = 169500;
  const RESULT = {
    total: "١٦٩٬٥٠٠",
    growth: "+١٢٪",
    topCampaign: "التأهيل المهني",
    topDonor: "وزارة الموارد",
    distribution: [
      { label: "هبات حكومية", pct: 40, color: "bg-purple-500" },
      { label: "تبرعات نقدية", pct: 37, color: "bg-emerald-500" },
      { label: "تبرعات عينية", pct: 23, color: "bg-blue-500" },
    ],
    insights: [
      "التبرعات الحكومية تشكّل ٤٠٪ من الواردات — يُنصح بتنويع مصادر التمويل",
      "حملة التأهيل المهني حققت أعلى عائد — يُوصى بإطلاق نسخة ٢٠٢٦/٢",
      "نسبة النمو ١٢٪ مقارنةً بالفترة السابقة — اتجاه إيجابي",
      "٣ تبرعات مجهولة المصدر — قد تستلزم إجراءات KYC وفق نظام مكافحة الاحتيال",
    ],
  };
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}><ChartBar size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>محلل التبرعات</h1><p className={`text-xs ${muted}`}>يُحلل مصادر التمويل ويستخرج اتجاهات الدعم للجمعية</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>أداة NGO</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الفترة الزمنية للتحليل</label><input value={period} onChange={e => setPeriod(e.target.value)} placeholder="مثال: الربع الأول ٢٠٢٦" className={inp} /></div>
                <div>
                  <p className={`text-xs font-semibold mb-2 ${muted}`}>التبرعات المتاحة ({SAMPLE.length} مدخلات)</p>
                  <div className="space-y-2">
                    {SAMPLE.map((d, i) => {
                      const conf = TYPE_CONF[d.type];
                      const Icon = conf.icon;
                      return (
                        <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${isDark ? "bg-white/2 border border-[#2d3748]" : "bg-gray-50 border border-gray-100"}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${conf.bg}`}><Icon size={14} weight="duotone" className={conf.color} /></div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{d.donor}</p>
                            <p className={`text-[10px] ${muted}`}>{d.campaign} · {d.date}</p>
                          </div>
                          <p className={`text-xs font-black ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{d.amount} ر.س</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <button onClick={() => { setStep("analyzing"); setTimeout(() => setStep("result"), 2000); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 transition">
                <ChartBar size={16} /> تحليل التبرعات <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "analyzing" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><Robot size={36} className={isDark ? "text-emerald-400" : "text-emerald-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يُحلل مصادر التمويل واتجاهاتها...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="ngo.donation-analyzer" toolName="تحليل التبرعات والامتثال" reviewScope="legal-data">
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "إجمالي التبرعات", value: `${RESULT.total} ر.س`, icon: HandHeart, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                  { label: "نمو مقارنة بالفترة السابقة", value: RESULT.growth, icon: TrendUp, color: "text-blue-500", bg: "bg-blue-500/10" },
                  { label: "أنشط حملة", value: RESULT.topCampaign, icon: ChartBar, color: "text-purple-500", bg: "bg-purple-500/10" },
                ].map((k, i) => {
                  const Icon = k.icon;
                  return (
                    <div key={i} className={`${card} p-4 shadow-sm`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${k.bg} mb-2`}><Icon size={15} weight="fill" className={k.color} /></div>
                      <p className={`text-base font-black leading-tight ${isDark ? "text-white" : "text-gray-900"}`}>{k.value}</p>
                      <p className={`text-[10px] mt-0.5 font-semibold ${muted}`}>{k.label}</p>
                    </div>
                  );
                })}
              </div>
              {/* Distribution */}
              <div className={`${card} p-5 shadow-sm`}>
                <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>توزيع مصادر التمويل</h3>
                <div className="space-y-3">
                  {RESULT.distribution.map((d, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={`font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{d.label}</span>
                        <span className={`font-black ${isDark ? "text-gray-300" : "text-gray-600"}`}>{d.pct}٪</span>
                      </div>
                      <div className={`h-2.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${d.pct}%` }} transition={{ delay: i * 0.15, duration: 0.8 }}
                          className={`h-full rounded-full ${d.color}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Insights */}
              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center gap-2 mb-3"><Sparkle size={14} className="text-emerald-500" weight="fill" /><h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>الاستنتاجات والتوصيات</h3></div>
                <ul className="space-y-2">
                  {RESULT.insights.map((ins, i) => (
                    <li key={i} className={`flex items-start gap-2 text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>{i + 1}</span>
                      {ins}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Unified Result Actions */}
              <AiResultActions
                text={RESULT.insights.join("\n") + "\n\n" + RESULT.topCampaign}
                filename="donation-analysis"
                showVault
                showHumanReview
                className="justify-start"
              />
              </BetaReviewGate>
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>تحليل جديد</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"} transition`}><Copy size={14} /> نسخ</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition`}><DownloadSimple size={14} /> تحميل التقرير</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
