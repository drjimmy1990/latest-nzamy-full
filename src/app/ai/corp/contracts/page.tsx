'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
  FileText, Sparkle, Robot, Copy, CheckCircle, Lightning,
  Handshake, Scroll, HouseLine, Briefcase, CaretDown, Warning,
} from '@phosphor-icons/react';
import AiResultActions from '@/components/AiResultActions';
import BetaReviewGate from '@/components/BetaReviewGate';
import { useTheme } from '@/components/ThemeProvider';

// ─── Quick templates ───────────────────────────────────────────────────────────
const QUICK_TYPES = [
  { icon: Handshake, label: 'عقد شراكة تجارية',     desc: 'تأسيس شراكة بين طرفين أو أكثر' },
  { icon: Scroll,    label: 'عقد توريد بضائع',       desc: 'التزامات التسليم والسداد' },
  { icon: HouseLine, label: 'عقد إيجار تجاري',       desc: 'مكتب، مستودع، معرض' },
  { icon: Briefcase, label: 'عقد خدمات استشارية',    desc: 'تحديد نطاق الخدمة والأتعاب' },
];

const EXAMPLE_PROMPTS = [
  'صغ عقد توريد معدات بين شركتين لمدة سنة بقيمة ٥٠٠,٠٠٠ ريال',
  'أحتاج عقد إيجار تجاري لمستودع في الرياض',
  'عقد وكالة تجارية حصرية مع موزع في جدة',
  'اتفاقية سرية معلومات بين شركتنا وشريك استراتيجي',
];

const MOCK_CONTRACT = `**عقد توريد معدات**
بين: شركة الأفق التجارية (المورد) وشركة الريادة للصناعة (المشتري)

---

**المادة الأولى — موضوع العقد**
يلتزم المورد بتوريد المعدات المحددة في الملحق رقم (١) المرفق بهذا العقد، وفق المواصفات الفنية المتفق عليها.

**المادة الثانية — القيمة الإجمالية والسداد**
تبلغ القيمة الإجمالية للتوريد (٥٠٠,٠٠٠) خمسمائة ألف ريال سعودي، تُسدَّد على ثلاثة أقساط:
- ٣٠% عند توقيع العقد
- ٤٠% عند الاستلام الأولي
- ٣٠% بعد اجتياز الفترة التجريبية (٣٠ يوماً)

**المادة الثالثة — التسليم والتركيب**
يتعهد المورد بتسليم المعدات وتركيبها خلال (٤٥) يوم عمل من تاريخ السداد الأول، في المقر المحدد بالملحق رقم (٢).

**المادة الرابعة — الضمان**
تُقدَّم المعدات مع ضمان شامل لمدة (١٢) شهراً تشمل الصيانة وقطع الغيار الأصلية.

**المادة الخامسة — الغرامات التأخيرية**
في حال تأخر التسليم، يُستحق غرام تأخير بواقع (٠.٥%) من قيمة العقد عن كل أسبوع تأخير، بحد أقصى (١٠%) من القيمة الإجمالية.

**المادة السادسة — تسوية النزاعات**
تُحسم النزاعات الناشئة عن هذا العقد وفق أحكام نظام التحكيم السعودي أمام مركز التحكيم التجاري لدول الخليج.

**المادة السابعة — القانون الحاكم**
يخضع هذا العقد لأحكام نظام الشركات ونظام التجارة السارية في المملكة العربية السعودية.

---
> [تحذير] هذا مسودة مبدئية — يُنصح بمراجعة محامٍ قبل التوقيع.`;

function StreamingText({ text }: { text: string }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown(''); let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) { setShown(text.slice(0, i + 5)); i += 5; }
      else { setShown(text); clearInterval(iv); }
    }, 8);
    return () => clearInterval(iv);
  }, [text]);
  return <pre className="whitespace-pre-wrap font-sans text-[13px] leading-[1.9]">{shown}</pre>;
}

export default function CorpContractDrafterPage() {
  const { isDark } = useTheme();
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [copied,   setCopied]   = useState(false);
  const [type,     setType]     = useState('');

  const card = isDark
    ? 'bg-[#161b22] border border-white/[0.07] rounded-2xl'
    : 'bg-white border border-slate-200 rounded-2xl shadow-sm';

  async function draft(prompt?: string) {
    const q = prompt || input;
    if (!q.trim()) return;
    setLoading(true); setResponse(null);
    await new Promise(r => setTimeout(r, 2400));
    setResponse(MOCK_CONTRACT); setLoading(false);
  }

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>صائغ العقود للشركات</h1>
            <span className="rounded-full bg-[#0B3D2E]/20 border border-[#0B3D2E]/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-500">للشركات</span>
          </div>
          <p className={`text-[13px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            صغ عقوداً تجارية احترافية ملزمة — توريد، شراكة، إيجار، خدمات، وكالة
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
          <FileText size={22} weight="duotone" className="text-[#0B3D2E]" />
        </div>
      </div>

      {/* Quick contract types */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_TYPES.map((t, i) => (
          <motion.button key={i} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { setInput(t.label); setType(t.label); }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} p-3.5 text-start hover:border-[#0B3D2E]/30 transition-colors ${type === t.label ? 'border-[#0B3D2E]/40' : ''}`}>
            <t.icon size={18} className="text-[#0B3D2E] mb-2" weight="duotone" />
            <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{t.label}</p>
            <p className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>{t.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* Input */}
      <div className={`${card} p-4`}>
        {/* Contract type selector */}
        <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border ${isDark ? 'border-white/[0.07] bg-white/[0.03]' : 'border-slate-100 bg-slate-50'}`}>
          <CaretDown size={13} className={isDark ? 'text-zinc-500' : 'text-slate-400'} />
          <select value={type} onChange={e => setType(e.target.value)}
            className={`flex-1 bg-transparent text-[12px] outline-none appearance-none ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            <option value="">اختر نوع العقد (اختياري)</option>
            {QUICK_TYPES.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
            <option value="عقد وكالة تجارية">عقد وكالة تجارية</option>
            <option value="اتفاقية سرية معلومات">اتفاقية سرية معلومات (NDA)</option>
            <option value="عقد امتياز تجاري">عقد امتياز تجاري (Franchise)</option>
          </select>
        </div>

        <div className={`flex items-start gap-3 rounded-xl border p-3 mb-3 transition-colors ${isDark ? 'border-white/[0.07] bg-white/[0.03] focus-within:border-[#0B3D2E]/30' : 'border-slate-200 bg-slate-50 focus-within:border-[#0B3D2E]/40'}`}>
          <FileText size={18} className={`flex-shrink-0 mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), draft())}
            placeholder="صف نوع العقد والأطراف والشروط الرئيسية..."
            rows={3}
            className={`flex-1 bg-transparent resize-none text-[13px] outline-none leading-relaxed ${isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-zinc-800 placeholder:text-zinc-400'}`}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.slice(0, 2).map((q, i) => (
              <button key={i} onClick={() => setInput(q)}
                className={`text-[10px] rounded-xl px-2.5 py-1 border transition-colors ${isDark ? 'border-white/[0.07] bg-white/[0.04] text-zinc-500 hover:text-zinc-300' : 'border-slate-200 bg-white text-zinc-400 hover:text-zinc-600'}`}>
                <Lightning size={8} className="inline me-1 text-[#0B3D2E]" />
                {q}
              </button>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            onClick={() => draft()} disabled={!input.trim() || loading}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
            <Sparkle size={14} weight="fill" />
            {loading ? 'جارٍ الصياغة...' : 'صغ العقد'}
          </motion.button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`${card} p-5 flex items-center gap-3`}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Robot size={20} weight="duotone" className="text-[#0B3D2E]" />
          </motion.div>
          <div>
            <p className={`text-[14px] font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              جارٍ صياغة العقد...
            </p>
            <p className={`text-[11px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
              يراجع الأنظمة التجارية السارية في المملكة
            </p>
          </div>
        </motion.div>
      )}

      {/* Response */}
      {response && (
        <BetaReviewGate toolId="corp.contracts" toolName="مسودة العقد للشركات" reviewScope="legal-data">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`${card} overflow-hidden`}>
          <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-slate-100'}`}>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-[#0B3D2E]" />
              <span className={`text-[12px] font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                مسودة العقد
              </span>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(response); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className={`flex items-center gap-1 text-[11px] ${isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
              {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copied ? 'تم النسخ' : 'نسخ'}
            </button>
          </div>
          <AiResultActions
            text={response}
            filename="corp-contract-draft"
            showShare
            className="px-5 pt-4"
          />
          <div className={`p-5 ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50/50'}`}>
            <StreamingText text={response} />
          </div>
          <div className={`px-5 py-3 border-t ${isDark ? 'border-white/[0.04]' : 'border-slate-50'}`}>
            <p className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
              <Warning size={12} weight="fill" className="inline ml-1 text-amber-500" /> هذه مسودة مبدئية — يُنصح بمراجعة محامٍ قانوني متخصص قبل التوقيع النهائي
            </p>
          </div>
        </motion.div>
        </BetaReviewGate>
      )}

    </div>
  );
}
