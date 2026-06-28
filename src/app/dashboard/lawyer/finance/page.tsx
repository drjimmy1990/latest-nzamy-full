"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, CheckCircle, Clock, Warning, Plus, MagnifyingGlass,
  ChartLine, Wallet, TrendUp, CurrencyCircleDollar,
  ShoppingCart, ChartBar, Scales, ArrowUpRight, ArrowDownRight,
  Sparkle, Microphone, X, Coins, FileText, CalendarBlank
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import confetti from "canvas-confetti";

import { type FinanceTab, type InvoiceStatus, type FeeType, type Period, type ExpenseCategory, type Invoice, type Expense, STATUS_CFG, EXP_CFG } from "@/constants/lawyerFinanceData";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { AreaBarChart, DonutChart } from "@/components/dashboard/lawyer/FinanceCharts";

export default function FinancePage() {
  const { isDark } = useTheme();
  const payments = usePaymentsStatus();
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [period,    setPeriod]    = useState<Period>("monthly");
  const [filter,    setFilter]    = useState<InvoiceStatus | "all">("all");
  const [search,    setSearch]    = useState("");
  const [expCat,    setExpCat]    = useState<ExpenseCategory | "all">("all");

  // الحالات التفاعلية للبيانات الحية
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseMode) { setLoading(false); return; }
    apiGet('/api/v1/lawyer/finance').then((data: any) => {
      if (data.invoices?.length) setInvoices(data.invoices);
      if (data.walletTransactions?.length) setExpenses(data.walletTransactions);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // حالات النوافذ المنبثقة
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // حالة الإجراء الصوتي السريع
  const [voiceInput, setVoiceInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceParsedMessage, setVoiceParsedMessage] = useState<string | null>(null);

  // نموذج الفاتورة الجديدة
  const [newInvClient, setNewInvClient] = useState("");
  const [newInvDesc, setNewInvDesc] = useState("");
  const [newInvFee, setNewInvFee] = useState("");
  const [newInvType, setNewInvType] = useState<FeeType>("full");
  const [newInvCase, setNewInvCase] = useState("");

  const cardCls = isDark
    ? "rounded-[2rem] border border-white/[0.06] bg-zinc-900/60 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    : "rounded-[2rem] border border-slate-200/50 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]";

  // ── حساب المجاميع الحية ──
  const totalPaid      = useMemo(() => invoices.filter(i => i.status === "paid").reduce((s, b) => s + b.totalFee, 0), [invoices]);
  const totalPending   = useMemo(() => invoices.filter(i => i.status === "pending").reduce((s, b) => s + b.totalFee, 0), [invoices]);
  const totalOverdue   = useMemo(() => invoices.filter(i => i.status === "overdue").reduce((s, b) => s + b.totalFee, 0), [invoices]);
  const totalPartial   = useMemo(() => invoices.filter(i => i.status === "partial").reduce((s, b) => s + (b.totalFee - b.paidAmount), 0), [invoices]);
  const totalAll       = useMemo(() => invoices.reduce((s, b) => s + b.totalFee, 0), [invoices]);
  const totalCollected = useMemo(() => invoices.reduce((s, b) => s + b.paidAmount, 0), [invoices]);

  // ── بيانات الرسم البياني الحية ──
  const monthLabels = ["يناير", "فبراير", "مارس", "أبريل"];
  const monthlyData = useMemo(() => {
    return monthLabels.map((label, idx) => {
      const m = idx + 1;
      const items = invoices.filter(i => i.month === m);
      return { 
        label: label, 
        paid: items.reduce((s, b) => s + b.paidAmount, 0), 
        pending: items.reduce((s, b) => s + (b.totalFee - b.paidAmount), 0) 
      };
    });
  }, [invoices]);

  const quarterlyData = useMemo(() => {
    return [1, 2, 3, 4].map(q => {
      const items = invoices.filter(i => i.quarter === q);
      return { 
        label: `الربع ${q}`, 
        paid: items.reduce((s, b) => s + b.paidAmount, 0), 
        pending: items.reduce((s, b) => s + (b.totalFee - b.paidAmount), 0) 
      };
    });
  }, [invoices]);

  const annualData = useMemo(() => {
    return [{
      label: "عام ٢٠٢٦",
      paid: totalCollected,
      pending: totalAll - totalCollected
    }];
  }, [totalAll, totalCollected]);

  const chartData = period === "quarterly" ? quarterlyData : period === "annual" ? annualData : monthlyData;

  // ── تصفية الفواتير ──
  const filteredInvoices = useMemo(() =>
    invoices.filter(inv => {
      const ms = filter === "all" || inv.status === filter;
      const mq = !search || inv.client.includes(search) || inv.desc.includes(search) || inv.id.includes(search);
      return ms && mq;
    }).sort((a, b) => b.id.localeCompare(a.id)),
  [invoices, filter, search]);

  // ── حساب المصروفات الحية ──
  const totalExpenses   = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const vatableExpenses = useMemo(() => expenses.filter(e => e.vatIncluded).reduce((s, e) => s + e.amount, 0), [expenses]);
  const vatAmount       = Math.round(vatableExpenses * 0.15);
  const netProfit       = totalCollected - totalExpenses;

  const filteredExpenses = useMemo(() =>
    expenses.filter(e => expCat === "all" || e.category === expCat).sort((a, b) => b.id.localeCompare(a.id)),
  [expenses, expCat]);

  const expByCategory = useMemo(() => {
    return (Object.keys(EXP_CFG) as ExpenseCategory[]).map(key => ({
      key, ...EXP_CFG[key], total: expenses.filter(e => e.category === key).reduce((s, e) => s + e.amount, 0),
    })).filter(e => e.total > 0);
  }, [expenses]);

  // ── محاكاة الإملاء الصوتي ──
  const handleVoiceSimulate = () => {
    if (isListening) return;
    setIsListening(true);
    setVoiceParsedMessage(null);
    
    // محاكاة إدخال نص بالصوت خطوة بخطوة
    const sentences = [
      "إضافة مصروف جديد...",
      "إضافة مصروف جديد: شراء رخص برمجية لمكتب المحاماة بقيمة ١٢٠٠ ريال",
      "إضافة مصروف جديد: شراء رخص برمجية لمكتب المحاماة بقيمة ١٢٠٠ ريال شامل الضريبة"
    ];

    let step = 0;
    const interval = setInterval(() => {
      setVoiceInput(sentences[step]);
      step++;
      if (step >= sentences.length) {
        clearInterval(interval);
        setIsListening(false);
        
        // تفكيك النص وتوليد المصروف تلقائياً
        setTimeout(() => {
          const newExp: Expense = {
            id: `EXP-0${expenses.length + 1}`,
            desc: "رخص برمجية للمكتب (تحليل صوتي)",
            amount: 1200,
            category: "tech",
            date: "١ يونيو ٢٠٢٦",
            month: 4,
            vatIncluded: true
          };
          setExpenses(prev => [newExp, ...prev]);
          setVoiceParsedMessage("تم استيعاب الطلب الصوتي: تمت إضافة مصروف 'رخص برمجية' بقيمة ١,٢٠٠ ﷼ وتحديث الميزانية بنجاح!");
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
          // تفريغ النص بعد ٣ ثواني
          setTimeout(() => {
            setVoiceInput("");
            setVoiceParsedMessage(null);
          }, 5000);
        }, 1000);
      }
    }, 1200);
  };

  // ── معالجة إضافة فاتورة جديدة ──
  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvClient || !newInvFee) return;

    setIsSubmitting(true);

    setTimeout(() => {
      const feeNum = parseFloat(newInvFee);
      const newInv: Invoice = {
        id: `INV-0${invoices.length + 1}`,
        client: newInvClient,
        clientType: "company",
        caseTitle: newInvCase || "—",
        desc: newInvDesc || "أتعاب نظامية متفق عليها",
        totalFee: feeNum,
        paidAmount: 0,
        feeType: newInvType,
        status: "pending",
        date: "١ يونيو ٢٠٢٦",
        month: 4,
        quarter: 2
      };

      setInvoices(prev => [newInv, ...prev]);
      setIsSubmitting(false);
      setIsInvoiceModalOpen(false);
      
      // تفريغ الحقول
      setNewInvClient("");
      setNewInvDesc("");
      setNewInvFee("");
      setNewInvCase("");
      
      // إطلاق كرات الاحتفال بالنجاح
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }, 1800);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-10 space-y-8 text-right" dir="rtl">

      {/* ── بانر بوابة الدفع (يظهر فقط عندما لا تكون البوابة مفعّلة فعلياً) ── */}
      {payments.status !== "live" && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              {payments.disabled ? "بوابة الدفع غير مفعّلة حالياً" : "بوابة الدفع قيد التفعيل"}
            </p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>
              {payments.disabled
                ? "البيانات المالية تعرض من قاعدة البيانات — الدفع والسحب غير متاحين حتى تفعيل البوابة"
                : "البيانات المالية تعرض من قاعدة البيانات — بوابة الدفع قيد الإعداد"}
            </p>
          </div>
        </motion.div>
      )}
      
      {/* ── الرأس وتوزيع عناصرها بغير تماثل ── */}
      <motion.div 
        initial={{ opacity: 0, y: -15 }} 
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 18 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-zinc-200/50 dark:border-white/[0.06]"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-[#0B3D2E]/10 dark:bg-[#0B3D2E]/25 text-[#C8A762]">
              <Coins size={22} weight="duotone" />
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-800 dark:text-zinc-100">
              الإدارة المالية الذكية
            </h1>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-zinc-500 leading-relaxed">
            تتبع الفواتير، التدفقات النقدية، المصروفات، والتحليلات الضريبية المتوافقة مع هيئة الزكاة والضريبة والجمارك.
          </p>
        </div>

        <motion.button 
          whileHover={{ scale: 1.03 }} 
          whileTap={{ scale: 0.97 }}
          onClick={() => setIsInvoiceModalOpen(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black bg-[#0B3D2E] text-[#C8A762] hover:bg-[#082d22] shadow-lg shadow-[#0B3D2E]/15 transition-all self-start md:self-auto cursor-pointer"
        >
          <Plus size={14} weight="bold" /> إصدار فاتورة جديدة
        </motion.button>
      </motion.div>

      {/* ── شريط التبويبات الفخم مع الكبسولة المنزلقة ── */}
      <div className={`p-1.5 rounded-3xl flex gap-1 ${isDark ? "bg-zinc-800/50" : "bg-slate-100/80"}`}>
        {([
          { key: "overview"  as FinanceTab, label: "نظرة عامة والتحليل", icon: ChartBar },
          { key: "invoices"  as FinanceTab, label: "إدارة الفواتير",       icon: Receipt },
          { key: "expenses"  as FinanceTab, label: "سجل المصروفات",     icon: ShoppingCart },
          { key: "pl"        as FinanceTab, label: "قائمة الأرباح والخسائر", icon: Scales },
        ] as const).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-black transition-all cursor-pointer overflow-hidden"
              style={{ color: isActive ? (isDark ? "#ffffff" : "#0B3D2E") : (isDark ? "#71717a" : "#64748b") }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  className={`absolute inset-0 z-0 ${isDark ? "bg-zinc-700/60" : "bg-white shadow-sm border border-slate-200/50"}`}
                  transition={{ type: "spring", stiffness: 140, damping: 20 }}
                />
              )}
              <span className="relative z-10">
                <tab.icon size={14} weight={isActive ? "fill" : "regular"} className={isActive ? "text-[#C8A762]" : ""} />
              </span>
              <span className="relative z-10 hidden md:block">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── التفاعل الحركي للتبويبات ── */}
      <AnimatePresence mode="wait">
        
        {/* ── تبويب النظرة العامة (Bento Grid 2.0) ── */}
        {activeTab === "overview" && (
          <motion.div 
            key="overview" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className="space-y-6"
          >
            {/* أزرار اختيار النطاق الزمني */}
            <div className="flex justify-end">
              <div className={`p-1 rounded-2xl flex gap-1 ${isDark ? "bg-zinc-800/80 border border-white/[0.06]" : "bg-slate-100 border border-slate-200"}`}>
                {([
                  { key: "monthly", label: "تقرير شهري" },
                  { key: "quarterly", label: "تقرير ربع سنوي" },
                  { key: "annual", label: "تقرير سنوي" }
                ] as const).map(p => {
                  const isActive = period === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setPeriod(p.key)}
                      className="relative px-4 py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all"
                      style={{ color: isActive ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#52525b" : "#64748b") }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activePeriodPill"
                          className={`absolute inset-0 z-0 ${isDark ? "bg-zinc-700" : "bg-white shadow-sm border border-slate-200"}`}
                          transition={{ type: "spring", stiffness: 150, damping: 20 }}
                        />
                      )}
                      <span className="relative z-10">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* الصف الأول من Bento Grid: الرسوم البيانية (60/40) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* الرسم البياني للأعمدة والتحصيل (3/5) */}
              <div className={`${cardCls} lg:col-span-3 p-6 flex flex-col justify-between`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="space-y-1">
                    <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>توزيع الإيرادات والتحصيل</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مقارنة الفواتير المسددة بالمبالغ المعلقة والجزئية</p>
                  </div>
                  <div className="flex gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0B3D2E]" />مسدّد</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b8974f]" />معلق</span>
                  </div>
                </div>
                <div className="flex-1 flex items-center">
                  <AreaBarChart data={chartData} isDark={isDark} />
                </div>
              </div>

              {/* الرسم الدائري لتوزيع الحالات (2/5) */}
              <div className={`${cardCls} lg:col-span-2 p-6 flex flex-col justify-between`}>
                <div className="space-y-1 mb-6">
                  <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>موقف الفواتير العام</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>النسب المئوية لحالات الفواتير الفردية والشركاء</p>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <DonutChart paid={totalPaid} pending={totalPending} overdue={totalOverdue} partial={totalPartial} />
                </div>
              </div>
            </div>

            {/* الصف الثاني من Bento Grid: كروت المؤشرات المالية (KPI Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "إجمالي الأتعاب المستحقة", value: totalAll, icon: ChartLine, color: "text-emerald-500", bg: "bg-emerald-500/10 dark:bg-emerald-500/25", pulse: false },
                { label: "المبالغ المحصّلة فعلياً", value: totalCollected, icon: TrendUp, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10 dark:bg-[#C8A762]/20", pct: `${Math.round(totalCollected / (totalAll || 1) * 100)}% التحصيل` },
                { label: "إجمالي المصروفات", value: totalExpenses, icon: ShoppingCart, color: "text-red-500", bg: "bg-red-500/10 dark:bg-red-500/20", pulse: false },
                { label: "صافي أرباح المكتب", value: netProfit, icon: Scales, color: netProfit >= 0 ? "text-emerald-400" : "text-red-500", bg: netProfit >= 0 ? "bg-emerald-500/10 dark:bg-emerald-500/25" : "bg-red-500/10 dark:bg-red-500/25", pct: `${Math.round(netProfit / (totalCollected || 1) * 100)}% الهامش`, pulse: netProfit >= 0 },
              ].map((k, i) => {
                const Icon = k.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 100, damping: 18, delay: i * 0.05 }}
                    whileHover={{ y: -4, scale: 1.01 }}
                    className={`${cardCls} p-5 relative overflow-hidden`}
                  >
                    {k.pulse && (
                      <span className="absolute top-4 left-4 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-4 ${k.bg}`}>
                      <Icon size={18} weight="duotone" className={k.color} />
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 mb-1">{k.label}</p>
                    <p className="text-xl font-black font-mono tracking-tight text-slate-800 dark:text-zinc-100">
                      {k.value.toLocaleString()} <span className="text-xs font-normal font-sans">﷼</span>
                    </p>
                    {k.pct && (
                      <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-2 ${k.bg} ${k.color}`}>
                        {k.pct}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* الصف الثالث من Bento Grid: كشوف السداد وصندوق الميكروفون السريع (60/40) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* توزيع السداد ومؤشر النطاق (3/5) */}
              <div className={`${cardCls} lg:col-span-3 p-6 space-y-4`}>
                <div className="space-y-1">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>توزيع الأتعاب حسب طبيعة السداد</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>تتبع التدفقات النقدية ونسب الاستحقاق الفعلية</p>
                </div>
                <div className="space-y-4 pt-2">
                  {[
                    { label: "أتعاب مسدّدة بالكامل", value: totalPaid, color: "bg-emerald-500", rawPct: totalPaid / (totalAll || 1) },
                    { label: "فواتير مسدّدة جزئياً (التحصيل)", value: invoices.filter(i => i.status === "partial").reduce((s, b) => s + b.paidAmount, 0), color: "bg-blue-400", rawPct: invoices.filter(i => i.status === "partial").reduce((s, b) => s + b.paidAmount, 0) / (totalAll || 1) },
                    { label: "أتعاب معلقة ومجدولة", value: totalPending, color: "bg-amber-400", rawPct: totalPending / (totalAll || 1) },
                    { label: "فواتير متأخرة السداد", value: totalOverdue, color: "bg-red-500", rawPct: totalOverdue / (totalAll || 1) },
                  ].map(row => {
                    const pct = Math.round(row.rawPct * 100);
                    return (
                      <div key={row.label} className="space-y-1.5">
                        <div className={`flex items-center justify-between text-[11px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                          <span className="font-bold">{row.label}</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{row.value.toLocaleString()} ﷼ ({pct}%)</span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
                          <motion.div 
                            className={`h-full rounded-full ${row.color}`} 
                            initial={{ width: 0 }} 
                            animate={{ width: `${pct}%` }} 
                            transition={{ duration: 0.8, ease: "easeOut" }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* صندوق الصياغة المالية السريعة بالصوت (2/5) */}
              <div className={`${cardCls} lg:col-span-2 p-6 flex flex-col justify-between border-dashed border-[#C8A762]/30 bg-amber-500/[0.02]`}>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkle size={15} className="text-[#C8A762] animate-pulse" weight="fill" />
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الإجراء المالي الصوتي السريع</p>
                  </div>
                  <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    تحدث بطلاقة لتسجيل مصروفاتك أو فواتيرك فورياً عبر الذكاء الاصطناعي دون تعبئة النماذج الطويلة.
                  </p>
                </div>

                <div className="my-4 space-y-3">
                  <div className="relative">
                    <textarea
                      readOnly
                      value={voiceInput}
                      placeholder="انقر على ميكروفون الإملاء الصوتي للتحدث..."
                      className={`w-full rounded-2xl border p-4 text-[12px] h-20 outline-none resize-none leading-relaxed transition-all text-right font-semibold ${
                        isDark 
                          ? "border-white/[0.08] bg-zinc-950/40 text-zinc-300 placeholder:text-zinc-700" 
                          : "border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400"
                      }`}
                    />
                    
                    <div className="absolute left-3 bottom-3">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleVoiceSimulate}
                        disabled={isListening}
                        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md cursor-pointer ${
                          isListening 
                            ? "bg-red-500 text-white animate-pulse" 
                            : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#07241b]"
                        }`}
                      >
                        <Microphone size={16} weight={isListening ? "fill" : "bold"} />
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {voiceParsedMessage && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0 }}
                        className={`p-3 rounded-xl border text-[10px] leading-relaxed ${
                          isDark ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                        }`}
                      >
                        {voiceParsedMessage}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-1.5 justify-center py-1 bg-black/[0.04] dark:bg-white/[0.02] rounded-xl text-[9px] font-bold text-slate-400 dark:text-zinc-500">
                  <CheckCircle size={10} className="text-[#C8A762]" />
                  <span>محاكاة صوتية متصلة بمحرك RAG المالي</span>
                </div>
              </div>
            </div>

            {/* تنبيه بالمتأخرات */}
            {totalOverdue > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`${cardCls} p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-red-500/20 bg-red-500/[0.01]`}
              >
                <div className="flex items-center gap-3">
                  <span className="p-2.5 rounded-2xl bg-red-500/10 text-red-500">
                    <Wallet size={20} weight="duotone" />
                  </span>
                  <div className="space-y-0.5">
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مستحقات متأخرة معلقة</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      لديك فواتير متأخرة غير مسددة بقيمة <strong className="font-mono text-xs">{totalOverdue.toLocaleString()} ﷼</strong> لدى عملائك المتأخرين.
                    </p>
                  </div>
                </div>
                <motion.button 
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    confetti({ particleCount: 30, spread: 40 });
                    alert("تم إرسال إشعارات تذكير بالسداد متوافقة مع الأنظمة لـ " + invoices.filter(i => i.status === "overdue").length + " عملاء.");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 text-[11px] font-black border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer"
                >
                  إرسال تذكير بالسداد فوراً
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── تبويب إدارة الفواتير ── */}
        {activeTab === "invoices" && (
          <motion.div 
            key="invoices" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className="space-y-6"
          >
            {/* الفلاتر والبحث الجمالي */}
            <div className="flex flex-col xl:flex-row gap-4">
              
              {/* شريط البحث */}
              <div className={`flex items-center gap-2 flex-1 px-4 py-3 rounded-2xl border transition-all focus-within:border-[#C8A762]/50 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm"}`}>
                <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <input 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  placeholder="بحث في الفواتير (اسم العميل، رقم الفاتورة، التفاصيل)..."
                  className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-700" : "text-slate-700 placeholder:text-slate-400"}`} 
                />
              </div>

              {/* شريط التصفية السريع بالكبسولة المنزلقة */}
              <div className={`p-1.5 rounded-2xl flex gap-1 flex-wrap md:flex-nowrap overflow-x-auto ${isDark ? "bg-zinc-800/80 border border-white/[0.06]" : "bg-slate-100 border border-slate-200"}`}>
                {(["all", "paid", "partial", "pending", "overdue"] as const).map(s => {
                  const isActive = filter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className="relative px-4 py-2 rounded-xl text-[11px] font-black cursor-pointer transition-all flex-shrink-0"
                      style={{ color: isActive ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#52525b" : "#64748b") }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeFilterPill"
                          className={`absolute inset-0 z-0 ${isDark ? "bg-zinc-700" : "bg-white shadow-sm border border-slate-200"}`}
                          transition={{ type: "spring", stiffness: 150, damping: 20 }}
                        />
                      )}
                      <span className="relative z-10">
                        {s === "all" ? "كافة الفواتير" : STATUS_CFG[s].label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* قائمة الفواتير التفاعلية */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filteredInvoices.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className={`${cardCls} p-12 text-center text-slate-400 dark:text-zinc-600 text-xs font-semibold`}
                  >
                    لا توجد فواتير مطابقة لمعايير البحث والتصفية المحددة.
                  </motion.div>
                ) : (
                  filteredInvoices.map((inv, i) => {
                    const sc = STATUS_CFG[inv.status as InvoiceStatus];
                    const StatusIcon = sc.icon;
                    const payPct = inv.totalFee ? Math.round(inv.paidAmount / inv.totalFee * 100) : 0;
                    return (
                      <motion.div 
                        key={inv.id} 
                        layout
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 100, damping: 18 }}
                      >
                        <div className={`${cardCls} p-5 hover:border-[#C8A762]/30 transition-all shadow-[0_4px_20px_-10px_rgba(0,0,0,0.02)]`}>
                          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                              <span className={`p-2.5 rounded-2xl flex-shrink-0 mt-0.5 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                                <Receipt size={18} weight="duotone" className="text-[#C8A762]" />
                              </span>
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className={`text-[14px] font-black truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{inv.client}</h3>
                                  <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1 flex-shrink-0 ${sc.color}`}>
                                    <StatusIcon size={9} weight="fill" /> {sc.label}
                                    {inv.daysOver && <span className="font-normal font-mono">({inv.daysOver}يوم)</span>}
                                  </span>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                                    inv.feeType === "full"
                                      ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                      : isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700"
                                  }`}>
                                    {inv.feeType === "full" ? "أتعاب كاملة" : "دفعة جزئية"}
                                  </span>
                                </div>
                                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{inv.desc}</p>
                                <div className={`flex items-center gap-2 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                                  {inv.caseTitle !== "—" && (
                                    <>
                                      <span className="flex items-center gap-1"><FileText size={11} /> {inv.caseTitle}</span>
                                      <span>·</span>
                                    </>
                                  )}
                                  <span className="flex items-center gap-1"><CalendarBlank size={11} /> {inv.date}</span>
                                  <span>·</span>
                                  <span className="font-mono">{inv.id}</span>
                                </div>
                                
                                {inv.status === "partial" && (
                                  <div className="pt-2 max-w-md">
                                    <div className={`flex justify-between text-[9px] mb-1 font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                                      <span>محصّل: {inv.paidAmount.toLocaleString()} ﷼</span>
                                      <span>متبقي: {(inv.totalFee - inv.paidAmount).toLocaleString()} ﷼</span>
                                    </div>
                                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
                                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${payPct}%` }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex sm:flex-col items-end justify-between sm:justify-start w-full sm:w-auto border-t sm:border-0 pt-3 sm:pt-0 mt-2 sm:mt-0 flex-shrink-0">
                              <p className="text-[17px] font-black font-mono tracking-tight text-slate-800 dark:text-zinc-100">
                                {inv.totalFee.toLocaleString()} <span className="text-xs font-normal font-sans">﷼</span>
                              </p>
                              {inv.status === "partial" && <span className="text-[10px] font-black text-blue-500 mt-1">{payPct}% محصّل</span>}
                              {inv.status === "overdue" && (
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => {
                                    confetti({ particleCount: 20, spread: 30 });
                                    alert("تم إرسال تذكير ودّي للعميل: " + inv.client);
                                  }}
                                  className="mt-1 text-[10px] font-black text-red-500 hover:underline cursor-pointer"
                                >
                                  إرسال تذكير سريع
                                </motion.button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── سجل المصروفات ── */}
        {activeTab === "expenses" && (
          <motion.div 
            key="expenses" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className="space-y-6"
          >
            {/* بطاقات تلخيص المصروفات والضريبة */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "إجمالي المصروفات", value: totalExpenses, color: "text-red-500", bg: "bg-red-500/10 dark:bg-red-500/20" },
                { label: "مسترجع ضريبة VAT (15%)", value: vatAmount, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10 dark:bg-[#C8A762]/20" },
                { label: "المصروفات الصافية (دون VAT)", value: totalExpenses - vatAmount, color: "bg-[#0B3D2E]/10 dark:bg-[#0B3D2E]/25 text-[#C8A762]", bg: "text-[#C8A762]" },
              ].map((k, i) => (
                <div key={i} className={`${cardCls} p-5`}>
                  <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
                  <p className={`text-xl font-black font-mono tracking-tight ${k.color}`}>
                    {k.value.toLocaleString()} <span className="text-xs font-normal font-sans">﷼</span>
                  </p>
                </div>
              ))}
            </div>

            {/* الرسم التفصيلي للمصروفات حسب الكاتيجوري */}
            <div className={`${cardCls} p-6 space-y-4`}>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>توزيع المصروفات التشغيلية حسب الفئة</p>
              <div className="space-y-3 pt-2">
                {expByCategory.sort((a, b) => b.total - a.total).map(cat => {
                  const pct = totalExpenses ? Math.round(cat.total / totalExpenses * 100) : 0;
                  const barColor = cat.color.replace("text-", "bg-");
                  return (
                    <div key={cat.key} className="space-y-1">
                      <div className={`flex items-center justify-between text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                        <span className="flex items-center gap-2 font-bold">
                          <span className={`w-2.5 h-2.5 rounded-full ${barColor}`} />{cat.label}
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{cat.total.toLocaleString()} ﷼ ({pct}%)</span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
                        <motion.div className={`h-full rounded-full ${barColor}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* تصفيات فئات المصروفات */}
            <div className="flex gap-1.5 flex-wrap">
              {(["all", ...Object.keys(EXP_CFG)] as (ExpenseCategory | "all")[]).map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setExpCat(cat as ExpenseCategory | "all")}
                  className={`px-4 py-2 rounded-2xl border text-[11px] font-black cursor-pointer transition-all ${
                    expCat === cat 
                      ? "bg-red-500 text-white border-red-500 shadow-md shadow-red-500/10" 
                      : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {cat === "all" ? "كافة الفئات" : EXP_CFG[cat as ExpenseCategory].label}
                </button>
              ))}
            </div>

            {/* قائمة المصروفات الفعلية */}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredExpenses.map((exp, i) => {
                  const cfg = EXP_CFG[exp.category as ExpenseCategory];
                  const barColor = cfg.color.replace("text-", "bg-");
                  return (
                    <motion.div 
                      key={exp.id} 
                      layout
                      initial={{ opacity: 0, y: 8 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 100, damping: 18 }}
                      className={`${cardCls} p-4 hover:border-slate-300 dark:hover:border-white/10 transition-all flex items-center justify-between gap-4`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                          <ShoppingCart size={18} weight="duotone" className={cfg.color} />
                        </span>
                        <div className="min-w-0 space-y-1">
                          <p className={`text-[13px] font-black truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{exp.desc}</p>
                          <div className={`flex items-center gap-2 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                            <span className={`px-2 py-0.5 rounded-full font-black text-[9px] ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                            <span>·</span><span>{exp.date}</span>
                            {exp.vatIncluded && (
                              <>
                                <span>·</span>
                                <span className="text-[#C8A762] font-black text-[9px] px-1.5 py-0.5 rounded-full bg-[#C8A762]/10 border border-[#C8A762]/20">VAT شاملة</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className={`text-[15px] font-black font-mono flex-shrink-0 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                        {exp.amount.toLocaleString()} <span className="text-xs font-normal font-sans">﷼</span>
                      </p>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── قائمة الأرباح والخسائر (P&L) ── */}
        {activeTab === "pl" && (
          <motion.div 
            key="pl" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className="space-y-6 animate-stagger"
          >
            <div className={`${cardCls} p-6 md:p-8 space-y-6 shadow-xl shadow-slate-200/20 dark:shadow-none`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-200/50 dark:border-white/[0.06] pb-4">
                <p className={`text-[12px] font-black uppercase tracking-wider ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                  بيان الدخل (الأرباح والخسائر) — الربع الثاني ٢٠٢٦
                </p>
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                  <CalendarBlank size={12} /> متوافق مع مبدأ الاستحقاق والتحصيل الفعلي
                </span>
              </div>

              {/* الإيرادات */}
              <div className="space-y-2">
                <div className={`py-1.5 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الإيرادات والتحصيل</p>
                </div>
                {[
                  { label: "إجمالي الأتعاب المقيدة بالفواتير", value: totalAll, indent: false, muted: false },
                  { label: "الأتعاب المحصلة فعلياً (السيولة النقدية الواردة)", value: totalCollected, indent: true, muted: false, highlight: true },
                  { label: "الأتعاب المعلقة والجزئية (تحت التحصيل)", value: totalPending + totalPartial, indent: true, muted: true },
                  { label: "المستحقات المتأخرة والديون المعدومة", value: totalOverdue, indent: true, muted: true },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between py-2.5 ${row.indent ? "ps-5 border-dashed" : ""} border-b ${isDark ? "border-white/[0.03]" : "border-slate-50"} ${row.highlight ? "bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] px-2 rounded-xl" : ""}`}>
                    <span className={`text-[12px] ${row.highlight ? "font-bold text-emerald-500" : row.muted ? isDark ? "text-zinc-600" : "text-slate-400" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{row.label}</span>
                    <span className={`font-mono text-[12px] font-black ${row.highlight ? "text-emerald-500" : row.muted ? isDark ? "text-zinc-600" : "text-slate-400" : isDark ? "text-zinc-200" : "text-slate-700"}`}>{row.value.toLocaleString()} ﷼</span>
                  </div>
                ))}
              </div>

              {/* المصروفات */}
              <div className="space-y-2 pt-3">
                <div className={`py-1.5 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المصروفات التشغيلية والضرائب</p>
                </div>
                {expByCategory.map(cat => (
                  <div key={cat.key} className={`flex items-center justify-between py-2.5 ps-5 border-b ${isDark ? "border-white/[0.03]" : "border-slate-50"}`}>
                    <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{cat.label}</span>
                    <span className="font-mono text-[12px] font-black text-red-500">{cat.total.toLocaleString()} ﷼</span>
                  </div>
                ))}
                <div className={`flex items-center justify-between py-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                  <span className={`text-[13px] font-black ${isDark ? "text-zinc-300" : "text-slate-700"}`}>إجمالي المصروفات التشغيلية</span>
                  <span className="font-mono text-[13px] font-black text-red-500">{totalExpenses.toLocaleString()} ﷼</span>
                </div>
              </div>

              {/* الضريبة والزكاة */}
              <div className="space-y-2 pt-3">
                <div className={`flex items-center justify-between py-2.5 border-b ${isDark ? "border-white/[0.03]" : "border-slate-50"}`}>
                  <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>ضريبة القيمة المضافة المحسوبة (15% شاملة للمصروفات المؤهلة)</span>
                  <span className="font-mono text-[12px] font-black text-amber-500">{vatAmount.toLocaleString()} ﷼</span>
                </div>
              </div>

              {/* الربح الصافي النهائي */}
              <div className={`flex items-center justify-between py-4 mt-6 rounded-2xl px-5 border ${
                netProfit >= 0 
                  ? isDark ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-100" 
                  : isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-100"
              }`}>
                <span className={`text-[15px] font-black ${netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  صافي الأرباح التشغيلية النهائية للمكتب
                </span>
                <span className={`font-mono text-[19px] font-black ${netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {netProfit.toLocaleString()} ﷼
                </span>
              </div>
            </div>

            {/* الهامش ومؤشر الأداء النهائي */}
            <div className={`${cardCls} p-5 flex items-center gap-4`}>
              <span className="p-3 rounded-2xl bg-[#0B3D2E]/10 dark:bg-[#0B3D2E]/25 text-[#C8A762]">
                <ChartBar size={20} weight="duotone" />
              </span>
              <div className="space-y-1">
                <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                  هامش الربح الصافي للمكتب: {Math.round((netProfit / (totalCollected || 1)) * 100)}%
                </p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  محسوب بالاعتماد على إجمالي التحصيل الفعلي ({totalCollected.toLocaleString()} ﷼) مقسوماً على المصروفات الإجمالية.
                </p>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── 4. النافذة الزجاجية التفاعلية المنبثقة: إنشاء فاتورة جديدة ── */}
      <AnimatePresence>
        {isInvoiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* الخلفية المعتمة والزجاج المشوش */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsInvoiceModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            {/* محتوى النافذة المنبثقة مع spring physics */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className={`relative z-10 w-full max-w-lg p-6 md:p-8 rounded-[2.5rem] border text-right shadow-2xl ${
                isDark 
                  ? "bg-zinc-950/90 border-white/10 text-zinc-100" 
                  : "bg-white border-slate-200 text-slate-800"
              }`}
            >
              
              {/* إغلاق */}
              <button 
                onClick={() => setIsInvoiceModalOpen(false)}
                className="absolute top-6 left-6 p-2 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] transition-colors cursor-pointer"
              >
                <X size={14} className={isDark ? "text-zinc-400" : "text-slate-500"} />
              </button>

              <div className="flex items-center gap-2 mb-6">
                <span className="p-2.5 rounded-2xl bg-[#0B3D2E]/10 dark:bg-[#0B3D2E]/25 text-[#C8A762]">
                  <Receipt size={18} weight="duotone" />
                </span>
                <h2 className="text-xl font-extrabold tracking-tight">إصدار فاتورة قانونية جديدة</h2>
              </div>

              <AnimatePresence mode="wait">
                {isSubmitting ? (
                  // شاشة التحميل Shimmer التفاعلية
                  <motion.div 
                    key="shimmer"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="py-12 space-y-6 text-center"
                  >
                    <div className="relative w-16 h-16 mx-auto">
                      <motion.div 
                        className="absolute inset-0 rounded-full border-4 border-[#C8A762]/20 border-t-[#C8A762]"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">
                        جارٍ معالجة وتسجيل الفاتورة نظامياً...
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-xs mx-auto leading-relaxed">
                        يتم الآن فحص المطابقة وحساب الضريبة الضريبية وحفظ الفاتورة في السجل المالي للمنصة بالذكاء الاصطناعي.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  // نموذج المدخلات التفاعلي
                  <motion.form 
                    key="form"
                    onSubmit={handleCreateInvoice} 
                    className="space-y-4"
                  >
                    {/* حقل العميل */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">اسم الجهة أو العميل المستحق:</label>
                      <input
                        required
                        type="text"
                        value={newInvClient}
                        onChange={(e) => setNewInvClient(e.target.value)}
                        placeholder="أدخل الاسم التجاري للشركة أو اسم الفرد..."
                        className={`w-full rounded-2xl border px-4 py-3 text-[12px] outline-none focus:border-[#C8A762]/50 transition-all text-right ${
                          isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      />
                    </div>

                    {/* حقل القضية */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">القضية أو المعاملة المرتبطة بها (اختياري):</label>
                      <input
                        type="text"
                        value={newInvCase}
                        onChange={(e) => setNewInvCase(e.target.value)}
                        placeholder="مثال: قضية نزاع شركة الأفق، استشارة عمالية..."
                        className={`w-full rounded-2xl border px-4 py-3 text-[12px] outline-none focus:border-[#C8A762]/50 transition-all text-right ${
                          isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      />
                    </div>

                    {/* حقل الوصف وقيمة الأتعاب في سطر واحد */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">قيمة الأتعاب المقررة (﷼):</label>
                        <input
                          required
                          type="number"
                          value={newInvFee}
                          onChange={(e) => setNewInvFee(e.target.value)}
                          placeholder="مثال: ٢٥٠٠٠"
                          className={`w-full rounded-2xl border px-4 py-3 text-[12px] outline-none focus:border-[#C8A762]/50 transition-all text-right font-semibold font-mono ${
                            isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">طريقة احتساب الدفعة:</label>
                        <select
                          value={newInvType}
                          onChange={(e) => setNewInvType(e.target.value as FeeType)}
                          className={`w-full rounded-2xl border px-4 py-3 text-[12px] outline-none focus:border-[#C8A762]/50 transition-all text-right font-bold ${
                            isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          <option value="full">أتعاب أصلية كاملة</option>
                          <option value="partial">دفعة جزئية (مرحلية)</option>
                        </select>
                      </div>
                    </div>

                    {/* حقل تفاصيل الفاتورة */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">تفاصيل الخدمة أو البند:</label>
                      <textarea
                        value={newInvDesc}
                        onChange={(e) => setNewInvDesc(e.target.value)}
                        placeholder="اكتب بنود الفاتورة باختصار... مثل: أتعاب المرافعة في الدعوى التجارية عن الجلسة الأولى..."
                        rows={3}
                        className={`w-full rounded-2xl border px-4 py-3 text-[12px] outline-none focus:border-[#C8A762]/50 transition-all text-right resize-none leading-relaxed ${
                          isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      />
                    </div>

                    <div className="pt-4 flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="flex-1 py-3 rounded-2xl text-xs font-black bg-[#0B3D2E] text-[#C8A762] hover:bg-[#07241b] shadow-lg shadow-[#0B3D2E]/10 cursor-pointer"
                      >
                        حفظ الفاتورة وإصدارها
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => setIsInvoiceModalOpen(false)}
                        className={`px-6 py-3 rounded-2xl text-xs font-black border cursor-pointer ${
                          isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"
                        }`}
                      >
                        إلغاء
                      </motion.button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
