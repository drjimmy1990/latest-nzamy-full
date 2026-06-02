"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Envelope, PencilSimple, Sparkle, Copy,
  CheckCircle, CaretDown, WhatsappLogo, ArrowRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";

// ─── Communication types ──────────────────────────────────────────────────────

const COMM_TYPES = [
  { id: "letter", label: "خطاب رسمي",      channel: "بريد/طباعة" },
  { id: "email",  label: "بريد إلكتروني",  channel: "Email" },
  { id: "wa",     label: "رسالة واتساب",   channel: "WhatsApp" },
  { id: "notice", label: "إشعار قانوني",   channel: "رسمي" },
  { id: "reply",  label: "رد على شكوى",    channel: "موجّه" },
];

const TONES = ["رسمي جداً", "رسمي", "دبلوماسي", "حازم", "تسوية ودية"];

// ─── Mock output ──────────────────────────────────────────────────────────────

const MOCK_LETTER = `السيد/ [اسم المستلم] المحترم

تحية طيبة وبعد،

يسعدني التواصل معكم بخصوص [موضوع الرسالة]، وذلك إشارةً إلى [المرجع إن وجد].

نودّ إفادتكم بأن شركتنا _الزهراني للمقاولات_ قد استكملت مراجعة الملف المقدّم من سيادتكم، وخلصت إلى ما يلي:

أولاً: [النقطة الأولى بوضوح وإيجاز]
ثانياً: [النقطة الثانية]
ثالثاً: [النقطة الثالثة إن وجدت]

لذا نرجو التكرم بالردّ خلال مدة أقصاها [المدة] من تاريخ هذا الخطاب.

ولمزيد من التنسيق، يُرجى التواصل على البريد الإلكتروني: legal@zahrani.sa

وتفضّلوا بقبول وافر التحية والتقدير،

[الاسم]
[المسمى الوظيفي]
[الشركة]
[التاريخ]`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AICommunicatePage() {
  const { isDark } = useTheme();
  const [commType, setCommType] = useState("letter");
  const [tone, setTone] = useState("رسمي");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!context.trim()) return;
    setGenerating(true);
    setOutput(null);
    await new Promise(r => setTimeout(r, 2000));
    setOutput(MOCK_LETTER);
    setGenerating(false);
  }

  const selectedType = COMM_TYPES.find(t => t.id === commType)!;
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className={`p-5 md:p-7 max-w-6xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      <div className="mb-5">
        <h1 className={`text-xl font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>المتحدث الذكي</h1>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>صف الموقف — AI يكتب رسالتك بالأسلوب والقناة المناسبة</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Form */}
        <div className="xl:col-span-2 space-y-4">
          {/* Type selector */}
          <div className={`${card} p-4 shadow-sm`}>
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>نوع التواصل</p>
            <div className="space-y-1.5">
              {COMM_TYPES.map(t => (
                <motion.button key={t.id} whileTap={{ scale: 0.98 }}
                  onClick={() => setCommType(t.id)}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-[12px] border transition-colors ${commType === t.id
                    ? isDark ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/50 text-emerald-300" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/30 text-[#0B3D2E]"
                    : isDark ? "border-white/[0.06] hover:bg-zinc-800 text-zinc-400" : "border-zinc-200 hover:bg-zinc-50 text-zinc-600"
                  }`}>
                  <span>{t.label}</span>
                  <span className={`text-[10px] font-mono ${commType === t.id ? "text-[#C8A762]" : isDark ? "text-zinc-700" : "text-zinc-300"}`}>{t.channel}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className={`${card} p-4 shadow-sm space-y-3`}>
            <div>
              <label className={`block text-[11px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>إلى (اختياري)</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder="اسم الجهة / الشخص"
                className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>الموضوع</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="موضوع الرسالة"
                className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>الأسلوب</label>
              <div className="relative">
                <select value={tone} onChange={e => setTone(e.target.value)}
                  className={`w-full appearance-none rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
                  {TONES.map(t => <option key={t}>{t}</option>)}
                </select>
                <CaretDown size={12} className={`absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
              </div>
            </div>
            <div>
              <label className={`block text-[11px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>ما الذي تريد قوله؟</label>
              <textarea value={context} onChange={e => setContext(e.target.value)}
                placeholder="مثال: أريد إرسال إنذار رسمي لعميل متأخر في السداد بمبلغ ٢٢ ألف ريال منذ ٦ أشهر، وطلب السداد خلال أسبوعين وإلا سيتم اللجوء للقضاء..."
                rows={4}
                className={`w-full resize-none rounded-xl border p-3 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`}
              />
            </div>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={generate} disabled={!context.trim() || generating}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
              <Sparkle size={14} weight="fill" className="text-[#C8A762]" />
              {generating ? "جارٍ الكتابة..." : "اكتب الرسالة"}
            </motion.button>
          </div>
        </div>

        {/* Output */}
        <div className="xl:col-span-3">
          <div className={`${card} min-h-[420px] overflow-hidden shadow-sm`}>
            <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <div className="flex items-center gap-2">
                <Envelope size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{selectedType.label}</span>
              </div>
              {output && (
                <div className="flex items-center gap-1.5">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
                    {copied ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    {copied ? "تم" : "نسخ"}
                  </motion.button>
                  {commType === "wa" && (
                    <button className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] bg-[#25D366] text-white font-semibold">
                      <WhatsappLogo size={11} /> أرسل
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="p-5">
              {!output && !generating ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Envelope size={28} className={isDark ? "text-zinc-700 mb-3" : "text-zinc-300 mb-3"} />
                  <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>اختر نوع الرسالة واشرح ما تريد قوله</p>
                </div>
              ) : generating ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="mb-4 h-12 w-12 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center">
                    <PencilSimple size={22} weight="duotone" className="text-[#C8A762]" />
                  </motion.div>
                  <p className={`text-[14px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    AI يكتب {selectedType.label} بأسلوب {tone}...
                  </p>
                </div>
              ) : (
                <>
                  <div className={`rounded-2xl p-5 ${isDark ? "bg-zinc-800/40 border border-white/[0.05]" : "bg-zinc-50 border border-zinc-100"}`}>
                    <pre className={`whitespace-pre-wrap font-sans text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{output}</pre>
                  </div>
                  <AiResultActions
                    text={output ?? ""}
                    filename={`communicate-${commType}`}
                    showVault
                    showHumanReview
                    className="justify-start mt-2"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
