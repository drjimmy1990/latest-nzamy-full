"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Envelope, CaretLeft, CaretDown, Warning, CheckCircle, ArrowRight,
  ShieldWarning, FilePdf, ChatText, ArrowCircleRight, Scales, Handshake,
  PaperPlaneRight, Copy, Check, Gear, Users, Lock, Buildings,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import AiResultActions from "@/components/AiResultActions";
import UpgradeModal from "@/components/UpgradeModal";


// ─── Data ────────────────────────────────────────────────────────────────────

type ReplyTone = "strict" | "negotiate" | "escalate";

interface MailItem {
  id: string;
  sender: string;
  email: string;
  subject: string;
  date: string;
  isRead: boolean;
  content: string;
  attachment?: string;
  analysis: {
    category: "demand" | "inquiry" | "notice" | "contract";
    riskLevel: "high" | "medium" | "low";
    summary: string;
    keyPoints: string[];
  };
  replies: Record<ReplyTone, string>;
}

const MOCK_MAILS: MailItem[] = [
  {
    id: "m1",
    sender: "شركة النجم للتوريد",
    email: "billing@alnajm.com",
    subject: "عاجل: مطالبة بالدفعة الأخيرة المتأخرة",
    date: "اليوم 10:45 ص",
    isRead: false,
    content: `السلام عليكم ورحمة الله،
نود إشعاركم بأن الدفعة الأخيرة المستحقة لعقد التوريد رقم 1445 والبالغة 185,000 ريال قد تجاوزت فترة السماح المتفق عليها بـ 15 يوماً.
نرجو سرعة التحويل لتجنب فرض غرامات التأخير حسب البند الرابع من العقد، ولعدم تعليق التوريدات القادمة.
مرفق لكم كشف الحساب والفاتورة النهائية.`,
    attachment: "Invoice_Final_185K.pdf",
    analysis: {
      category: "demand",
      riskLevel: "high",
      summary: "مطالبة مالية متأخرة بـ 185 ألف ريال مع تلويح بغرامات تأخير وإيقاف توريد.",
      keyPoints: [
        "تهديد مالي: غرامات تأخير تُفعّل قريباً بناءً على البند 4.",
        "تهديد تشغيلي: تعليق التوريدات القادمة مما قد يوقف أعمالكم.",
        "تم إثبات الدين بإرفاق الفاتورة النهائية."
      ]
    },
    replies: {
      strict: `السادة شركة النجم، إشارة إلى بريدكم، نفيدكم بوجود ملاحظات على التوريدة الأخيرة جاري حصرها بناءً على المادة (6) من العقد، وسيتم صرف المستخلص فور انتهاء الفحص ولن نقبل بأي غرامات غير مبررة قانوناً.`,
      negotiate: `السلام عليكم. نقدّر تواصلكم وحرصكم، نواجه حالياً دورة مستخلصات ممتدة ونقترح جدولة الدفعة على قسطين خلال الأسبوعين القادمين مع التنازل عن غرامة التأخير كبادرة حسن نية بين الطرفين.`,
      escalate: `نلفت انتباهكم أن التلويح بإيقاف التوريد يعد إخلالاً جوهرياً بالعقد، الدفعة قيد المراجعة وإذا تم الإيقاف سنطالب بالتعويض عن تعطل الأعمال ومستعدون للجوء للقضاء التجاري.`
    }
  },
  {
    id: "m2",
    sender: "أحمد الموارد البشرية",
    email: "ahmed.hr@company.com",
    subject: "استفسار بخصوص نموذج إنهاء عقد",
    date: "أمس 02:30 م",
    isRead: true,
    content: "هل يوجد تحديث على نموذج 74 المعتمد لدينا ليتوافق مع تحديثات النظام الجديد للعمل؟ نحتاج استخدامه اليوم لموظف تجاوز فترة التجربة.",
    analysis: {
      category: "inquiry",
      riskLevel: "medium",
      summary: "استفسار داخلي حول استخدام نموذج إنهاء عقد بعد فترة التجربة.",
      keyPoints: ["تحذير: لا يمكن إنهاء الموظف بناء على فترة التجربة إذا تجاوزها. المادة 80 هي المرجع.", "تأكد من توافق النموذج 74 مع تعديلات 2025."]
    },
    replies: {
      strict: "نحذر بشدة. لا يجوز استخدام نموذج فترة التجربة طالما الموظف تخطاها، هذا يعتبر فصلاً تعسفياً ويوجب التعويض. يرجى إيقاف الإجراء فوراً وإحالة ملف الموظف للشؤون القانونية.",
      negotiate: "أهلاً أحمد، تم تحديث النماذج، أرجو استخدام النموذج الخاص بالمادة 80 لتجنب الأخطاء والمطالبات العمالية اللاحقة.",
      escalate: "سيتم رفع شكوى للإدارة لعدم الالتزام بتحديث النماذج القانونية." // Just placeholder
    }
  }
];

// ─── Corporate Gate ───────────────────────────────────────────────────────────
function CorporateGate({ isDark }: { isDark: boolean }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";
  return (
    <div className="max-w-xl mx-auto pt-10 space-y-6" dir="rtl">
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureBlocked="باقة الشركات التجارية" />
      <div className={`${card} p-10 text-center space-y-5`}>
        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
          <Lock size={32} className="text-blue-500" weight="duotone" />
        </div>
        <div>
          <h1 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>
            LegalMail — للشركات التجارية فقط
          </h1>
          <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            هذه الأداة مصممة خصيصاً لفرق العمل في الشركات التجارية — لتحليل مراسلات الموردين والعملاء والدائنين وإعداد ردود قانونية احترافية فورية.
          </p>
        </div>
        <div className={`rounded-xl p-4 border text-right space-y-2 ${isDark ? "border-blue-500/20 bg-blue-900/10" : "border-blue-100 bg-blue-50"}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-blue-400" : "text-blue-600"}`}>ميزات LegalMail للشركات</p>
          {[
            "تحليل فوري لمراسلات الموردين والمطالبات المالية",
            "اقتراح ردود احترافية: حازم / تفاوضي / تصعيدي",
            "كشف المخاطر القانونية in أي بريد وارد",
            "تكامل مع بريد الشركة (Gmail / Outlook) عبر forwarding",
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle size={14} weight="fill" className="text-blue-500 mt-0.5 flex-shrink-0" />
              <p className={`text-xs ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{f}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={() => setUpgradeOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm shadow-md hover:bg-[#0a3328] transition cursor-pointer">
            <Buildings size={16} /> ترقية للباقة التجارية
          </button>
          <Link href="/ai"
            className={`flex items-center gap-2 px-5 py-3 border font-semibold rounded-xl text-sm transition ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            العودة لمركز AI
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MailAdvisorPage() {
  const { isDark } = useTheme();
  const user = useUser();

  // ── All hooks MUST be declared before any conditional returns (Rules of Hooks) ──
  const [configured, setConfigured] = useState(true);
  const [mails, setMails] = useState<MailItem[]>(MOCK_MAILS);
  const [activeMail, setActiveMail] = useState<MailItem | null>(null);
  const [replyTone, setReplyTone] = useState<ReplyTone | null>(null);
  const [copied, setCopied] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  // ── Access Gate — only corporate/firm/lawyer/provider can access LegalMail ──
  const ALLOWED_TYPES = ["corporate", "firm", "lawyer", "provider"];
  if (user.isLoggedIn && !ALLOWED_TYPES.includes(user.userType ?? "")) {
    return <CorporateGate isDark={isDark} />;
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const markAsRead = (id: string) => {
    setMails(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m));
  };

  const openMail = (mail: MailItem) => {
    setActiveMail(mail);
    setReplyTone(null);
    if (!mail.isRead) markAsRead(mail.id);
  };

  // Setup View
  if (!configured) {
    return (
      <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
        <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
          LegalMail — وكيل البريد القانوني
        </h1>
        <div className={`${card} p-8 text-center`}>
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Envelope size={32} className="text-blue-500" weight="duotone" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>قم بتوصيل بريد شركتك</h2>
          <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            قمنا بإنشاء بريد قانوني خاص بشركتك: <strong className="font-mono text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded">corp-123@nzamy.sa</strong><br/><br/>
            للبدء، قم بإعداد "تحويل تلقائي" (Auto-forward) في بريدك (Gmail / Outlook) ليقوم بتحويل رسائل الموردين والعملاء الهامة إلى هذا العنوان، وسنقوم بتحليل مخاطرها لك فوراً.
          </p>
          <button onClick={() => setConfigured(true)} className="px-6 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold">
            تم الإعداد، ابدأ التحليل
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6" dir="rtl">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>LegalMail</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Envelope size={24} weight="duotone" className="text-blue-500" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
                LegalMail
              </h1>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                تحليل قانوني فوري للمراسلات المعقدة
              </p>
            </div>
          </div>
          <button onClick={() => setConfigured(false)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            <Gear size={14} /> الإعدادات
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px]">
        
        {/* Inbox Sidebar */}
        <div className={`lg:col-span-4 ${card} flex flex-col overflow-hidden`}>
          <div className={`p-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <h2 className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>صندوق الوارد المفلتر</h2>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>٢ رسائل تتطلب انتباه قانوني</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {mails.map(m => (
              <button key={m.id} onClick={() => openMail(m)}
                className={`w-full text-right p-3 rounded-xl mb-1 transition-all ${activeMail?.id === m.id ? isDark ? "bg-[#0B3D2E]/20 border border-[#0B3D2E]/30" : "bg-emerald-50 border border-emerald-200" : isDark ? "border border-transparent hover:bg-white/[0.02]" : "border border-transparent hover:bg-slate-50"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-[12px] font-bold truncate ${!m.isRead && (isDark ? "text-white" : "text-black")} ${activeMail?.id === m.id ? "text-[#0B3D2E] dark:text-emerald-400" : isDark ? "text-zinc-300" : "text-slate-700"}`}>
                    {m.sender}
                  </p>
                  <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{m.date.split(" ")[0]}</span>
                </div>
                <p className={`text-[11px] font-bold truncate mb-1 ${!m.isRead ? isDark ? "text-zinc-200" : "text-slate-800" : isDark ? "text-zinc-500" : "text-slate-500"}`}>{m.subject}</p>
                <div className="flex gap-1.5 mt-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${m.analysis.riskLevel === "high" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}>
                    <ShieldWarning size={10} weight="fill" /> {m.analysis.riskLevel === "high" ? "مخاطرة عالية" : "مخاطرة متوسطة"}
                  </span>
                  {m.analysis.category === "demand" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">مطالبة</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Mail Content & Analysis */}
        <div className={`lg:col-span-8 flex flex-col gap-6`}>
          {!activeMail ? (
            <div className={`${card} flex-1 flex flex-col items-center justify-center text-center p-10`}>
              <ChatText size={48} className={`mb-4 ${isDark ? "text-zinc-700" : "text-slate-200"}`} weight="duotone" />
              <p className={`text-[14px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>اختر رسالة من القائمة لعرض التحليل</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={activeMail.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex-1 overflow-y-auto space-y-4 pr-1">
                
                {/* Email Viewer */}
                <div className={`${card} overflow-hidden`}>
                  <div className={`p-4 border-b ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                    <h2 className={`text-[18px] font-bold mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>{activeMail.subject}</h2>
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold ${isDark ? "bg-[#0B3D2E] text-white" : "bg-emerald-100 text-[#0B3D2E]"}`}>{activeMail.sender.charAt(0)}</span>
                        <div>
                          <p className={`font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{activeMail.sender}</p>
                          <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>&lt;{activeMail.email}&gt;</p>
                        </div>
                      </div>
                      <span className={isDark ? "text-zinc-500" : "text-slate-400"}>{activeMail.date}</span>
                    </div>
                  </div>
                  <div className={`p-5 text-[13px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                    {activeMail.content}
                  </div>
                  {activeMail.attachment && (
                    <div className={`p-4 border-t flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-100 bg-slate-50"}`}>
                      <FilePdf size={24} className="text-red-500" weight="duotone" />
                      <span className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{activeMail.attachment}</span>
                    </div>
                  )}
                </div>

                {/* AI Analysis */}
                <div className={`p-5 rounded-2xl border ${isDark ? "border-blue-500/20 bg-blue-900/10" : "border-blue-200 bg-blue-50"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldWarning size={16} className="text-blue-500" weight="fill" />
                    <h3 className="text-[13px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">تحليل المستشار AI</h3>
                  </div>
                  <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{activeMail.analysis.summary}</p>
                  <ul className="space-y-2">
                    {activeMail.analysis.keyPoints.map((pt, i) => (
                      <li key={i} className={`text-[12px] flex items-start gap-2 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                  
                  {activeMail.analysis.category === "demand" && (
                    <div className="mt-4 pt-4 border-t border-blue-500/20 flex items-center justify-between">
                      <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>هل ترغب بتصعيد المطالبة وتوجيه إنذار رسمي؟</p>
                      <Link href="/ai/debt-collection" className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-500 text-white shadow-sm hover:bg-blue-600 transition-colors">
                        إعداد إشعار تحصيل <ArrowCircleRight size={14} weight="fill" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* AI Replies */}
                <div className="space-y-3">
                  <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>كيف تود الرد؟</h3>
                  <div className="flex gap-2">
                    {([
                      { id: "strict", label: "رد حازم / قانوني", icon: Scales, color: "text-red-500" },
                      { id: "negotiate", label: "مفاوضة واحتواء", icon: Handshake, color: "text-emerald-500" },
                      { id: "escalate", label: "تصعيد وإنذار مقبل", icon: Warning, color: "text-amber-500" },
                    ] as const).map(t => {
                      const isActive = replyTone === t.id;
                      const Icon = t.icon;
                      return (
                        <button key={t.id} onClick={() => setReplyTone(t.id)}
                          className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${isActive ? "border-[#0B3D2E] bg-[#0B3D2E]/5" : isDark ? "border-white/[0.06] bg-zinc-900/50 hover:bg-zinc-800" : "border-slate-200 bg-white hover:bg-slate-50 shadow-sm"}`}>
                          <Icon size={18} className={`mb-1 ${isActive ? "text-[#0B3D2E] dark:text-emerald-400" : t.color}`} weight={isActive ? "fill" : "duotone"} />
                          <span className={`text-[11px] font-bold ${isActive ? "text-[#0B3D2E] dark:text-emerald-400" : isDark ? "text-zinc-400" : "text-slate-600"}`}>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  
                  <AnimatePresence>
                    {replyTone && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className={`mt-3 p-4 rounded-xl border ${isDark ? "border-emerald-500/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">المسودة المقترحة:</span>
                            <button onClick={() => handleCopy(activeMail.replies[replyTone!])} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${copied ? "bg-emerald-500 text-white" : "bg-white/50 text-emerald-700 dark:text-emerald-300 hover:bg-white"}`}>
                              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "نُسِخ" : "نسخ للاستخدام"}
                            </button>
                          </div>
                          <textarea 
                            value={activeMail.replies[replyTone]} 
                            onChange={() => {}} // Readonly for demo
                            rows={4}
                            className={`w-full text-[12px] leading-relaxed resize-none bg-transparent outline-none ${isDark ? "text-emerald-100" : "text-emerald-900"}`}
                          />
                        </div>
                        <AiResultActions
                          text={[
                            `الموضوع: ${activeMail.subject}`,
                            `المرسل: ${activeMail.sender}`,
                            `صيغة الرد: ${replyTone === "strict" ? "حازم" : replyTone === "negotiate" ? "تفاوضي" : "تصعيدي"}`,
                            ``,
                            activeMail.replies[replyTone!],
                          ].join("\n")}
                          filename={`mail-reply-${activeMail.id}-${replyTone}`}
                          showVault
                          showHumanReview
                          className="justify-start mt-2"
                        />
                        <div className="flex justify-end mt-2">
                           <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold shadow-md hover:bg-[#0B3D2E]/90 transition-colors">
                            فتح في برنامج البريد (MailTo) <PaperPlaneRight size={14} weight="fill" />
                           </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>

              </motion.div>
            </AnimatePresence>
          )}
        </div>

      </div>
    </div>
  );
}
