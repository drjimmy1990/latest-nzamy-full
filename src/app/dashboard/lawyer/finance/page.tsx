"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, CheckCircle, Clock, Warning, Plus, MagnifyingGlass,
  ChartLine, Wallet, TrendUp, ChartBar, Scales, ArrowClockwise,
  X, Coins, FileText, CalendarBlank, Bank
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import confetti from "canvas-confetti";

import { type FinanceTab, type InvoiceStatus, type FeeType, type Period, STATUS_CFG } from "@/constants/lawyerFinanceData";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { AreaBarChart, DonutChart } from "@/components/dashboard/lawyer/FinanceCharts";

// ── تحصيل الفاتورة ──
// لا توجد بوابة دفع بعد، فالتحصيل يدوي: نقداً أو تحويل بنكي فقط.
type CollectMethod = "cash" | "bank_transfer";

const COLLECT_METHODS = [
  { key: "cash" as CollectMethod,          label: "نقداً",        icon: Coins, hint: "استلمت المبلغ نقداً من العميل" },
  { key: "bank_transfer" as CollectMethod, label: "تحويل بنكي", icon: Bank,  hint: "وصل المبلغ إلى حساب المكتب البنكي" },
] as const;

/**
 * PATCH /api/v1/lawyer/finance لا يقبل إلا صف دفع حالته `requires_payment`،
 * وهي الحالة التي تُعرض هنا «معلقة» أو «مسدّدة جزئياً». أما «مسدّدة كاملاً»
 * فقد حُصّلت، و«متأخرة» تعني failed في قاعدة البيانات ويردّها الخادم بـ 409.
 */
const isCollectable = (inv: any) =>
  (inv?.status === "pending" || inv?.status === "partial") &&
  (Number(inv?.paidAmount) || 0) < (Number(inv?.totalFee) || 0);

/** رسائل الخادم إنجليزية — نعرضها للمحامي بالعربية. */
const COLLECT_ERROR_AR: Record<string, string> = {
  "Invoice not found": "لم يُعثر على هذه الفاتورة — قد تكون حُذفت.",
  "Forbidden": "لا تملك صلاحية تحصيل هذه الفاتورة.",
  "Invoice is not collectable": "هذه الفاتورة لم تعد قابلة للتحصيل — قد تكون حُصّلت بالفعل. حدّث الصفحة.",
  "paymentId required": "تعذّر تحديد الفاتورة المطلوبة.",
  "method must be cash or bank_transfer": "طريقة التحصيل غير صالحة.",
  "paidAmount must be greater than 0 and at most the invoice total":
    "المبلغ المحصّل يجب أن يكون أكبر من صفر وألا يتجاوز إجمالي الفاتورة.",
};

/**
 * أسماء الشهور الميلادية.
 *
 * الخادم يشتق `month`/`quarter`/`year` من `payments.created_at` عبر
 * getMonth()/getFullYear()، وكلاهما ميلادي؛ بينما التاريخ المطبوع على بطاقة
 * الفاتورة هجري (ar-SA = أم القرى، كما في بقية لوحة المحامي). لذلك تُكتب السنة
 * الميلادية صراحةً في تسميات المحور حتى لا يُقرأ الشهر على أنه هجري. توحيد
 * التقويمين على مستوى المنتج قرار يخص المالك، لا هذه الصفحة.
 */
const GREGORIAN_MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * تصنيف حركة المحفظة. العمود `amount` في wallet_transactions بلا إشارة،
 * والاتجاه يعيش في `kind` — ونفس القراءة مطبقة في /api/v1/wallet
 * (credit = دخول، وما عداه من debit/reversal = خروج، و pending محجوز).
 */
const WALLET_KIND_CFG: Record<string, { label: string; sign: string; color: string; bg: string }> = {
  credit:   { label: "إيداع",      sign: "+", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  debit:    { label: "خصم",        sign: "−", color: "text-red-500",     bg: "bg-red-500/10"     },
  reversal: { label: "عكس قيد",   sign: "−", color: "text-orange-500",  bg: "bg-orange-500/10"  },
  pending:  { label: "معلّق",      sign: "",  color: "text-amber-500",   bg: "bg-amber-500/10"   },
};

/** المتبقي على الفاتورة، بلا سالب — لا يُفترض وجوده لكن صفاً قديماً قد يحمله. */
const remainderOf = (inv: any) =>
  Math.max((Number(inv?.totalFee) || 0) - (Number(inv?.paidAmount) || 0), 0);

/**
 * بطاقة «لا توجد بيانات» — تُعرض فقط بعد قراءة ناجحة، فهي تقول «لا يوجد»
 * لا «تعذّرت القراءة». حالة الخطأ لها بطاقتها المستقلة مع زر إعادة المحاولة.
 */
function EmptyCard({ text, cardCls }: { text: string; cardCls: string }) {
  return (
    <div className={`${cardCls} p-12 text-center text-slate-400 dark:text-zinc-500 text-xs font-semibold leading-relaxed`}>
      {text}
    </div>
  );
}

type ChartBucket = { sort: number; label: string; paid: number; pending: number };

/**
 * يجمّع الفواتير في فترات مشتقة من تواريخها الفعلية.
 *
 * كان المحور قبل ذلك أربع تسميات ثابتة («يناير…أبريل») ورثتها الصفحة عن بيانات
 * تجريبية محذوفة، فكانت كل فاتورة صادرة من مايو إلى ديسمبر — أي كل فاتورة
 * تُصدر اليوم — تسقط خارج المحور تماماً بينما يبدو الرسم مأهولاً.
 *
 * الفاتورة التي لا يمكن تأريخها بثقة تُترك خارج المحور بدل وضعها في فترة
 * مُختلقة؛ ومجاميع المؤشرات أعلاه غير محدودة بفترة فلا يضيع منها شيء.
 */
function groupInvoices(
  invoices: any[],
  bucketOf: (inv: any) => { key: string; sort: number; label: string } | null,
  keepMostRecent: number,
): ChartBucket[] {
  const map = new Map<string, ChartBucket>();
  for (const inv of invoices) {
    const b = bucketOf(inv);
    if (!b) continue;
    const cur = map.get(b.key) ?? { sort: b.sort, label: b.label, paid: 0, pending: 0 };
    cur.paid += Number(inv.paidAmount) || 0;
    cur.pending += remainderOf(inv);
    map.set(b.key, cur);
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort).slice(-keepMostRecent);
}

export default function FinancePage() {
  const { isDark } = useTheme();
  const payments = usePaymentsStatus();
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [period,    setPeriod]    = useState<Period>("monthly");
  const [filter,    setFilter]    = useState<InvoiceStatus | "all">("all");
  const [search,    setSearch]    = useState("");

  // الحالات التفاعلية للبيانات الحية
  const [invoices, setInvoices] = useState<any[]>([]);
  const [walletTxns, setWalletTxns] = useState<any[]>([]);
  /**
   * العدد الحقيقي للصفوف في قاعدة البيانات، أو null إن لم يُرسله الخادم.
   *
   * عدّادان منفصلان لأن القائمتين قراءتان مستقلتان لجدولين مختلفين، ولكلٍّ
   * سقفها الخاص (MAX_ROWS في الخادم): يمكن أن تُقتطع الفواتير وحدها أو حركات
   * المحفظة وحدها. عدّاد واحد كان سيضع عدد الفواتير فوق قائمة المحفظة.
   */
  const [invoicesTotal, setInvoicesTotal] = useState<number | null>(null);
  const [walletTotal, setWalletTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * ثلاث حالات مفصولة: جارٍ التحميل / تعذّرت القراءة / لا توجد بيانات فعلاً.
   *
   * كانت القراءة الفاشلة تُبتلع في ثلاث طبقات (الخادم يردّ 200 بأصفار، و
   * `.catch` هنا يتجاهل الخطأ، و`loading` معلن ولا يُعرض)، فيقرأ المحامي «لا
   * توجد فواتير» و«٠ ﷼» أثناء عطل في قاعدة البيانات ويظنّ أنه لم يُصدر شيئاً.
   */
  const loadFinance = useCallback(() => {
    // isSupabaseMode ثابت على مستوى الوحدة، فهذا الفرع يُحذف من حزمة الإنتاج.
    if (!isSupabaseMode) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    apiGet<{
      invoices?: any[];
      invoicesTotal?: number | null;
      walletTransactions?: any[];
      walletTransactionsTotal?: number | null;
    }>("/api/v1/lawyer/finance")
      .then((data) => {
        // إسناد غير مشروط: الشرط القديم `if (data.invoices?.length)` كان يُبقي
        // القائمة السابقة معروضة حين يردّ الخادم قائمة فارغة عن حق.
        setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
        setWalletTxns(Array.isArray(data?.walletTransactions) ? data.walletTransactions : []);
        // رقمٌ فقط يُقبل كرقم. الغياب يبقى null فلا يظهر التنبيه أصلاً — ولا
        // يُملأ العدد من طول القائمة المعروضة، فذلك يجعل كل قراءة مقتطعة تبدو
        // كاملة وهو عين العيب الذي يُغلق هنا.
        setInvoicesTotal(typeof data?.invoicesTotal === "number" ? data.invoicesTotal : null);
        setWalletTotal(
          typeof data?.walletTransactionsTotal === "number" ? data.walletTransactionsTotal : null,
        );
        setLoading(false);
      })
      .catch((err: any) => {
        console.error("[finance] load failed:", err);
        setLoadError("تعذّرت قراءة بياناتك المالية من الخادم، فلا تُعرض أي أرقام على هذه الشاشة. هذا عطل في القراءة وليس معناه أنك لم تُصدر فواتير — أعد المحاولة.");
        // القراءة فشلت فلا عدد معلوماً: تُمسح الأعداد كما تبقى القوائم فارغة،
        // حتى لا يبقى «من ٧٤٠» من قراءة سابقة معلّقاً فوق شاشة لا تعرض شيئاً.
        setInvoicesTotal(null);
        setWalletTotal(null);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadFinance(); }, [loadFinance]);

  // حالات النوافذ المنبثقة
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // نموذج الفاتورة الجديدة
  const [newInvClient, setNewInvClient] = useState("");
  const [newInvDesc, setNewInvDesc] = useState("");
  const [newInvFee, setNewInvFee] = useState("");
  const [newInvType, setNewInvType] = useState<FeeType>("full");
  const [newInvCase, setNewInvCase] = useState("");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // نافذة تسجيل التحصيل (نقداً أو تحويل بنكي) — الفاتورة المستهدفة وحالتها
  const [collectTarget, setCollectTarget] = useState<any | null>(null);
  const [collectMethod, setCollectMethod] = useState<CollectMethod>("cash");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectError, setCollectError] = useState<string | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);

  const cardCls = isDark
    ? "rounded-[2rem] border border-white/[0.06] bg-zinc-900/60 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    : "rounded-[2rem] border border-slate-200/50 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]";

  // ── حساب المجاميع الحية ──
  // كل هذه المبالغ من نفس النوع (ريالات من إجمالي المفوتر)، ومجموع
  // المحصّل + المتبقيات الثلاثة = إجمالي الأتعاب. كان الرسم الدائري قبل ذلك
  // يخلط أتعاباً كاملة مع «متبقي» الفواتير الجزئية في مقام واحد، فيعلن نسبة
  // تحصيل تخالف بطاقة المؤشر التي تبعد عنها عشرين بكسلاً.
  const totalAll         = useMemo(() => invoices.reduce((s, b) => s + (Number(b.totalFee) || 0), 0), [invoices]);
  const totalCollected   = useMemo(() => invoices.reduce((s, b) => s + (Number(b.paidAmount) || 0), 0), [invoices]);
  const pendingRemainder = useMemo(() => invoices.filter(i => i.status === "pending").reduce((s, b) => s + remainderOf(b), 0), [invoices]);
  const partialRemainder = useMemo(() => invoices.filter(i => i.status === "partial").reduce((s, b) => s + remainderOf(b), 0), [invoices]);
  const overdueRemainder = useMemo(() => invoices.filter(i => i.status === "overdue").reduce((s, b) => s + remainderOf(b), 0), [invoices]);
  const collectedPct     = totalAll > 0 ? Math.round((totalCollected / totalAll) * 100) : 0;

  const feeSegments = useMemo(() => [
    { label: "محصّل",                 value: totalCollected,   color: "#10b981" },
    { label: "متبقٍ (جزئية)",         value: partialRemainder, color: "#3b82f6" },
    { label: "متبقٍ (معلقة)",         value: pendingRemainder, color: "#f59e0b" },
    { label: "متبقٍ (متأخرة)",        value: overdueRemainder, color: "#ef4444" },
  ], [totalCollected, partialRemainder, pendingRemainder, overdueRemainder]);

  // ── بيانات الرسم البياني الحية (فترات مشتقة من تواريخ الفواتير) ──
  const monthlyData = useMemo(() => groupInvoices(invoices, (inv) => {
    const y = Number(inv.year); const m = Number(inv.month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    return { key: `${y}-${m}`, sort: y * 12 + m, label: `${GREGORIAN_MONTHS_AR[m - 1]} ${y}` };
  }, 6), [invoices]);

  const quarterlyData = useMemo(() => groupInvoices(invoices, (inv) => {
    const y = Number(inv.year); const q = Number(inv.quarter);
    if (!Number.isFinite(y) || !Number.isFinite(q) || q < 1 || q > 4) return null;
    return { key: `${y}-Q${q}`, sort: y * 4 + q, label: `الربع ${q} — ${y}` };
  }, 4), [invoices]);

  const annualData = useMemo(() => groupInvoices(invoices, (inv) => {
    const y = Number(inv.year);
    if (!Number.isFinite(y)) return null;
    return { key: `${y}`, sort: y, label: `عام ${y}` };
  }, 5), [invoices]);

  const chartData = period === "quarterly" ? quarterlyData : period === "annual" ? annualData : monthlyData;
  const chartScopeLabel =
    period === "quarterly" ? "آخر أربعة أرباع فيها فواتير"
    : period === "annual"  ? "آخر خمس سنوات فيها فواتير"
    : "آخر ستة أشهر فيها فواتير";

  // ── تصفية الفواتير ──
  // الترتيب بـ createdAt لا بـ id: معرّف الفاتورة UUID عشوائي، وترتيب القائمة
  // به كان يعني أن «أحدث فاتورة» في أعلى الشاشة اختيار عشوائي.
  const filteredInvoices = useMemo(() =>
    invoices.filter(inv => {
      const ms = filter === "all" || inv.status === filter;
      const mq = !search || inv.client.includes(search) || inv.desc.includes(search) || inv.id.includes(search);
      return ms && mq;
    }).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
  [invoices, filter, search]);

  // ── معالجة إضافة فاتورة جديدة ──
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvClient.trim() || !newInvFee) return;

    const feeNum = parseFloat(newInvFee);
    // قيمة سالبة أو صفرية كانت تمرّ إلى قاعدة البيانات (لا CHECK على
    // payments.amount) وتُطرح من كل مجموع في الصفحة، ولا توجد أداة إلغاء هنا.
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setInvoiceError("أدخل قيمة أتعاب أكبر من صفر.");
      return;
    }

    setInvoiceError(null);
    setIsSubmitting(true);

    if (isSupabaseMode) {
      try {
        const res = await apiMutate<{ data: any }>("/api/v1/lawyer/finance", "POST", {
          client: newInvClient,
          description: newInvDesc || "أتعاب نظامية متفق عليها",
          amount: feeNum,
          feeType: newInvType,
          caseTitle: newInvCase || undefined,
          clientType: "company",
        });
        const d = res?.data;
        if (d) {
          setInvoices(prev => [d, ...prev]);
          window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
        }
        setIsSubmitting(false);
        setIsInvoiceModalOpen(false);

        // تفريغ الحقول
        setNewInvClient("");
        setNewInvDesc("");
        setNewInvFee("");
        setNewInvCase("");

        // إطلاق كرات الاحتفال بالنجاح
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      } catch (err: any) {
        console.error("[finance] create invoice failed:", err);
        setInvoiceError(err?.message || "تعذّر إصدار الفاتورة. حاول مرة أخرى.");
        setIsSubmitting(false);
      }
    } else {
      // Demo fallback: local only (محذوف من حزمة الإنتاج عبر isSupabaseMode)
      const now = new Date();
      const month = now.getMonth() + 1;
      setInvoices(prev => [{
        id: `INV-0${prev.length + 1}`,
        client: newInvClient,
        clientType: "company",
        caseTitle: newInvCase || "—",
        desc: newInvDesc || "أتعاب نظامية متفق عليها",
        totalFee: feeNum,
        paidAmount: 0,
        feeType: newInvType,
        status: "pending",
        date: now.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" }),
        month,
        quarter: Math.ceil(month / 3),
        year: now.getFullYear(),
        createdAt: now.toISOString(),
      }, ...prev]);
      setIsSubmitting(false);
      setIsInvoiceModalOpen(false);

      setNewInvClient("");
      setNewInvDesc("");
      setNewInvFee("");
      setNewInvCase("");

      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  };

  // ── فتح نافذة تأكيد التحصيل ──
  const openCollectModal = (inv: any) => {
    setCollectTarget(inv);
    setCollectMethod("cash");
    setCollectAmount("");
    setCollectError(null);
  };

  // ── تسجيل تحصيل فاتورة (نقداً / تحويل بنكي) ──
  // الخادم يتوقع `paidAmount` كإجمالي محصّل تراكمي، بينما يُدخل المحامي هنا
  // المبلغ المستلم الآن — فنجمعه على ما سبق تحصيله قبل الإرسال.
  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTarget || isCollecting) return;

    const inv = collectTarget;
    const alreadyCollected = Number(inv.paidAmount) || 0;
    const totalFee = Number(inv.totalFee) || 0;
    const remaining = totalFee - alreadyCollected;

    if (remaining <= 0) {
      setCollectError("لا يوجد مبلغ متبقٍ على هذه الفاتورة.");
      return;
    }

    let collectedNow = remaining;
    if (collectAmount.trim()) {
      collectedNow = parseFloat(collectAmount);
      if (!Number.isFinite(collectedNow) || collectedNow <= 0) {
        setCollectError("أدخل مبلغاً صحيحاً أكبر من صفر.");
        return;
      }
      if (collectedNow > remaining) {
        setCollectError(`المبلغ يتجاوز المتبقي على الفاتورة (${remaining.toLocaleString()} ﷼).`);
        return;
      }
    }

    const cumulative = alreadyCollected + collectedNow;

    setCollectError(null);
    setIsCollecting(true);

    if (isSupabaseMode) {
      try {
        const res = await apiMutate<{ data: any }>("/api/v1/lawyer/finance", "PATCH", {
          paymentId: inv.id,
          method: collectMethod,
          paidAmount: cumulative,
        });
        const d = res?.data;
        // نستبدل الصف بما أعاده الخادم حتى تبقى المجاميع مطابقة لقاعدة البيانات
        if (d) setInvoices(prev => prev.map(x => (x.id === d.id ? d : x)));
        setIsCollecting(false);
        setCollectTarget(null);
        window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
      } catch (err: any) {
        console.error("[finance] collect invoice failed:", err);
        const raw = err?.message || "";
        setCollectError(COLLECT_ERROR_AR[raw] || "تعذّر تسجيل التحصيل. حاول مرة أخرى.");
        setIsCollecting(false);
      }
    } else {
      // وضع العرض التجريبي: التحديث محلي فقط بنفس منطق الخادم
      setInvoices(prev => prev.map(x => x.id === inv.id
        ? { ...x, paidAmount: cumulative, status: cumulative >= totalFee ? "paid" : "partial" }
        : x));
      setIsCollecting(false);
      setCollectTarget(null);
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
    }
  };

  /**
   * هل ما على الشاشة هو كل ما في الحساب؟
   *
   * كل مبلغ في هذه الصفحة — «إجمالي الأتعاب المفوترة»، «المبالغ المحصّلة
   * فعلياً»، نسبة التحصيل، الرسم الدائري، أعمدة الأشهر، وملخص الأتعاب — مجموعٌ
   * من مصفوفة `invoices` نفسها. والخادم يقرأ أحدث MAX_ROWS فاتورة فقط، فإن
   * تجاوز عددها ذلك السقف صار كل رقم يحمل كلمة «إجمالي» أقلَّ من الحقيقة بلا
   * أي إشارة. المقارنة بـ `>` لا بـ `!==`: عدد أصغر من المعروض لا معنى له وليس
   * سبباً لادّعاء الاقتطاع.
   */
  const invoicesTruncated = invoicesTotal !== null && invoicesTotal > invoices.length;
  const walletTruncated = walletTotal !== null && walletTotal > walletTxns.length;

  const hasInvoices = invoices.length > 0;
  // فواتير موجودة لكن بمجموع صفر (صفوف payments.amount = 0 كان يمكن إنشاؤها
  // قبل إضافة شرط «أكبر من صفر» في الخادم) تجعل الرسم الدائري يعود null
  // فيظهر إطار فارغ بلا تفسير — نقولها صراحةً بدلاً من ذلك.
  const hasFeeAmounts = totalAll > 0;

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
              الفواتير والتحصيل
            </h1>
          </div>
          {/* الوصف السابق كان يعد بـ«تحليلات ضريبية متوافقة مع هيئة الزكاة
              والضريبة والجمارك» — لا تحتسب المنصة ضريبة ولا تسجّل مصروفات. */}
          <p className="text-[13px] text-slate-500 dark:text-zinc-500 leading-relaxed">
            الفواتير التي أصدرتها ومبالغ التحصيل المسجلة على حسابك. القيود اليدوية فقط — لا توجد بوابة دفع إلكتروني.
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

      {/* ── جارٍ التحميل ── */}
      {loading && (
        <div className={`${cardCls} p-12 flex flex-col items-center justify-center gap-4`}>
          <motion.span
            className="w-8 h-8 rounded-full border-[3px] border-[#C8A762]/25 border-t-[#C8A762]"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-[12px] font-bold text-slate-500 dark:text-zinc-400">جارٍ قراءة بياناتك المالية...</p>
        </div>
      )}

      {/* ── تعذّرت القراءة ── */}
      {!loading && loadError && (
        <div className={`${cardCls} p-8 flex flex-col sm:flex-row items-center gap-4 border-red-500/20`}>
          <span className="p-3 rounded-2xl bg-red-500/10 text-red-500 flex-shrink-0">
            <Warning size={22} weight="duotone" />
          </span>
          <div className="flex-1 space-y-1 text-center sm:text-right">
            <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>تعذّر تحميل البيانات المالية</p>
            <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{loadError}</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={loadFinance}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 text-[11px] font-black border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer flex-shrink-0"
          >
            <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
          </motion.button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          {/* ── تنبيه الاقتطاع ──
              فوق التبويبات لا داخل أحدها، لأن الفواتير المقروءة تغذّي أربعة
              تبويبات: المؤشرات والرسوم في «نظرة عامة»، القائمة في «إدارة
              الفواتير»، والملخص في «ملخص الأتعاب». تنبيه داخل تبويب واحد يترك
              الأرقام في الثلاثة الأخرى تدّعي أنها إجمالي.

              الجملة لا تُؤخذ من truncationNoticeAr() في
              src/lib/services/listRead.ts: خاتمتها «استخدم البحث للوصول إلى
              الباقي» كاذبة هنا. مربع البحث وشرائح الحالة كلاهما يصفّي مصفوفة
              `invoices` في الذاكرة (انظر filteredInvoices)، ولا يُرسل أيٌّ
              منهما إلى الخادم، فلا سبيل في هذه الشاشة إلى الفاتورة رقم ٥٠١.
              لذلك تقف الجملة عند حدّ ما هو صحيح ولا تعد بمخرج غير موجود.

              والأرقام بـ toLocaleString() المجرّدة، وهي نفس الدالة التي تطبع
              بها بطاقات المؤشرات مبالغها على بُعد بضعة بكسلات — فلا يمكن أن
              يختلف تنسيق التنبيه عن تنسيق الرقم الذي يتحدث عنه. */}
          {invoicesTruncated && invoicesTotal !== null && (
            <div className={`rounded-2xl p-4 border flex items-start gap-3 ${
              isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"
            }`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
                <Warning size={18} weight="fill" className="text-amber-500" />
              </span>
              <div className="space-y-1">
                <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  هذه الشاشة تقرأ أحدث {invoices.length.toLocaleString()} فاتورة من {invoicesTotal.toLocaleString()}
                </p>
                <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-amber-700/70"}`}>
                  كل المبالغ والنِّسَب والرسوم في هذه الصفحة محسوبة على هذه الفواتير وحدها، فهي ليست إجمالي
                  ما أصدره مكتبك. والبحث وشرائح التصفية تعمل على المعروض فقط، فلا تصل إلى الفواتير الأقدم.
                </p>
              </div>
            </div>
          )}

          {/* ── شريط التبويبات الفخم مع الكبسولة المنزلقة ── */}
          <div className={`p-1.5 rounded-3xl flex gap-1 ${isDark ? "bg-zinc-800/50" : "bg-slate-100/80"}`}>
            {([
              { key: "overview"  as FinanceTab, label: "نظرة عامة",              icon: ChartBar },
              { key: "invoices"  as FinanceTab, label: "إدارة الفواتير",          icon: Receipt },
              { key: "expenses"  as FinanceTab, label: "حركات محفظة المنصة",   icon: Wallet },
              { key: "pl"        as FinanceTab, label: "ملخص الأتعاب والتحصيل", icon: Scales },
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
                {!hasInvoices ? (
                  <EmptyCard cardCls={cardCls} text="لم تُسجَّل أي فاتورة على حسابك بعد. أصدر أول فاتورة من الزر أعلى الصفحة." />
                ) : (
                  <>
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
                            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{chartScopeLabel} — بالتقويم الميلادي</p>
                          </div>
                          <div className="flex gap-3 text-[10px] font-bold">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0B3D2E]" />محصّل</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b8974f]" />غير محصّل</span>
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
                          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>توزيع إجمالي الأتعاب المفوترة بين ما حُصّل وما تبقّى</p>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                          {hasFeeAmounts ? (
                            <DonutChart segments={feeSegments} centerPct={collectedPct} centerLabel="محصّل" />
                          ) : (
                            <p className="text-[11px] text-center text-slate-400 dark:text-zinc-500 leading-relaxed">
                              لا توجد مبالغ لعرضها — كل الفواتير المسجلة قيمتها ٠ ﷼.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* الصف الثاني من Bento Grid: كروت المؤشرات المالية (KPI Cards) */}
                    {/* كل بطاقة من قاعدة البيانات؛ ٢+٣+٤ = ١ بالضبط. حُذفت بطاقتا
                        «إجمالي المصروفات» و«صافي أرباح المكتب»: لا تسجّل المنصة
                        مصروفات مكتب، وكانت الأولى تجمع إيداعات المحفظة (نقداً
                        داخلاً) كأنها مصروفات، والثانية تطرحها من الأرباح. */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: "إجمالي الأتعاب المفوترة", value: totalAll, icon: ChartLine, color: "text-emerald-500", bg: "bg-emerald-500/10 dark:bg-emerald-500/25" },
                        { label: "المبالغ المحصّلة فعلياً", value: totalCollected, icon: TrendUp, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10 dark:bg-[#C8A762]/20", pct: `${collectedPct}% التحصيل`, pulse: true },
                        { label: "متبقٍ تحت التحصيل", value: pendingRemainder + partialRemainder, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10 dark:bg-amber-500/20" },
                        { label: "متبقٍ على فواتير متأخرة", value: overdueRemainder, icon: Warning, color: "text-red-500", bg: "bg-red-500/10 dark:bg-red-500/20" },
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

                    {/* توزيع السداد — نفس تقسيم الرسم الدائري، فتبلغ النسب ١٠٠٪ */}
                    {hasFeeAmounts && (
                    <div className={`${cardCls} p-6 space-y-4`}>
                      <div className="space-y-1">
                        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>توزيع الأتعاب حسب طبيعة السداد</p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نِسَب من إجمالي الأتعاب المفوترة ({totalAll.toLocaleString()} ﷼)</p>
                      </div>
                      <div className="space-y-4 pt-2">
                        {[
                          { label: "أتعاب محصّلة فعلياً", value: totalCollected, color: "bg-emerald-500" },
                          { label: "متبقٍ على فواتير مسدّدة جزئياً", value: partialRemainder, color: "bg-blue-400" },
                          { label: "متبقٍ على فواتير معلقة", value: pendingRemainder, color: "bg-amber-400" },
                          { label: "متبقٍ على فواتير متأخرة", value: overdueRemainder, color: "bg-red-500" },
                        ].map(row => {
                          const pct = totalAll > 0 ? Math.round((row.value / totalAll) * 100) : 0;
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
                    )}

                    {/* تنبيه بالمتأخرات — الزر ينقل إلى الفواتير المتأخرة فعلاً.
                        كان زر «إرسال تذكير بالسداد فوراً» يعرض alert يؤكد أن
                        إشعارات «متوافقة مع الأنظمة» أُرسلت لعدد من العملاء، ولا
                        يوجد في المستودع كله ما يرسل تذكيراً بالسداد. */}
                    {overdueRemainder > 0 && (
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
                              متبقٍ على فواتير متأخرة بقيمة <strong className="font-mono text-xs">{overdueRemainder.toLocaleString()} ﷼</strong>. متابعة العميل تتم خارج المنصة — لا تُرسل المنصة تذكيرات سداد.
                            </p>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => { setFilter("overdue"); setActiveTab("invoices"); }}
                          className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 text-[11px] font-black border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer flex-shrink-0"
                        >
                          عرض الفواتير المتأخرة
                        </motion.button>
                      </motion.div>
                    )}
                  </>
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
                        className={`${cardCls} p-12 text-center text-slate-400 dark:text-zinc-500 text-xs font-semibold`}
                      >
                        {/* التمييز مهم: «لا توجد نتائج للفلتر» غير «لم تُصدر فاتورة قط». */}
                        {hasInvoices
                          ? "لا توجد فواتير مطابقة لمعايير البحث والتصفية المحددة."
                          : "لم تُصدر أي فاتورة بعد."}
                      </motion.div>
                    ) : (
                      filteredInvoices.map((inv) => {
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
                                  {isCollectable(inv) && (
                                    <motion.button
                                      whileHover={{ scale: 1.04 }}
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => openCollectModal(inv)}
                                      className={`mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
                                        isDark
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                          : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                      }`}
                                    >
                                      <CheckCircle size={11} weight="fill" /> تم التحصيل
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

            {/* ── حركات محفظة المنصة ──
                هذا التبويب كان اسمه «سجل المصروفات»، وكان يعرض صفوف
                wallet_transactions كأنها مصروفات مكتب: يجمعها في «إجمالي
                المصروفات»، ويطرحها من «صافي أرباح المكتب»، ويحسب عليها استرجاع
                ضريبة. الجدول لا يحمل عمود فئة ولا عمود ضريبة، والكاتب الوحيد له
                في المستودع (src/lib/entitlements.ts) يكتب kind = 'credit' — أي
                نقداً داخلاً — فكان الإيداع يُطرح من الأرباح بدل أن يُضاف. لا
                توجد في المنصة أي جهة تسجّل مصروفات مكتب، فحُذف الادعاء كله. */}
            {activeTab === "expenses" && (
              <motion.div
                key="expenses"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className={`${cardCls} p-5 flex items-start gap-3`}>
                  <span className="p-2.5 rounded-2xl bg-[#C8A762]/10 text-[#C8A762] flex-shrink-0">
                    <Wallet size={18} weight="duotone" />
                  </span>
                  <div className="space-y-1">
                    <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>حركات محفظتك على منصة نظامي</p>
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      هذه حركات رصيدك داخل المنصة (مثل الإيداعات الإدارية) وليست مصروفات مكتبك.
                      لا تسجّل المنصة مصروفات المكتب ولا ضريبة القيمة المضافة، ولذلك لا تُعرض هنا أرباح صافية ولا مسترجع ضريبي.
                    </p>
                  </div>
                </div>

                {/* سقف مستقل عن سقف الفواتير وقراءة مستقلة، فتنبيهه هنا داخل
                    تبويبه لا فوق الصفحة. ولا وجهة تُذكر: لا بحث في هذا التبويب
                    ولا تصفية ولا صفحة تالية، فالجملة تقول العدد وتقف. */}
                {walletTruncated && walletTotal !== null && (
                  <p className={`text-[11px] leading-relaxed rounded-2xl border px-4 py-3 ${
                    isDark ? "border-amber-500/20 bg-amber-900/10 text-amber-400"
                      : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    يُعرض أحدث {walletTxns.length.toLocaleString()} حركة من {walletTotal.toLocaleString()}؛
                    الأقدم منها غير معروضة على هذه الشاشة.
                  </p>
                )}

                {walletTxns.length === 0 ? (
                  <EmptyCard cardCls={cardCls} text="لا توجد حركات على محفظتك في المنصة." />
                ) : (
                  <div className="space-y-2">
                    {walletTxns.map((t) => {
                      const cfg = WALLET_KIND_CFG[String(t.kind)] ?? {
                        // نوع غير معروف: نعرضه كما ورد بلا افتراض اتجاه.
                        label: String(t.kind || "حركة"), sign: "", color: "text-slate-500", bg: "bg-slate-500/10",
                      };
                      return (
                        <div
                          key={t.id}
                          className={`${cardCls} p-4 flex items-center justify-between gap-4`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                              <Wallet size={18} weight="duotone" className={cfg.color} />
                            </span>
                            <div className="min-w-0 space-y-1">
                              <p className={`text-[13px] font-black truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{t.desc || "—"}</p>
                              <div className={`flex items-center gap-2 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                                <span className={`px-2 py-0.5 rounded-full font-black text-[9px] ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                                <span>·</span><span>{t.date}</span>
                              </div>
                            </div>
                          </div>
                          <p className={`text-[15px] font-black font-mono flex-shrink-0 ${cfg.color}`}>
                            {cfg.sign}{Number(t.amount || 0).toLocaleString()} <span className="text-xs font-normal font-sans">﷼</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── ملخص الأتعاب والتحصيل ──
                كان هذا التبويب «قائمة الأرباح والخسائر»، بترويسة ثابتة «الربع
                الثاني ٢٠٢٦» فوق أرقام غير محدودة بفترة، وبند ضريبة قيمة مضافة
                لا مصدر له، وسطر «صافي الأرباح التشغيلية» يطرح إيداعات المحفظة.
                ما بقي هنا كله مقروء من صفوف payments فعلية. */}
            {activeTab === "pl" && (
              <motion.div
                key="pl"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {!hasInvoices ? (
                  <EmptyCard cardCls={cardCls} text="لا توجد فواتير لتلخيصها بعد." />
                ) : (
                  <div className={`${cardCls} p-6 md:p-8 space-y-6 shadow-xl shadow-slate-200/20 dark:shadow-none`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-200/50 dark:border-white/[0.06] pb-4">
                      <p className={`text-[12px] font-black uppercase tracking-wider ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                        ملخص الأتعاب والتحصيل
                      </p>
                      {/* «جميع الفواتير المسجلة على حسابك» هي أوضح جملة على
                          هذه الشاشة يمكن اقتباسها، وأول ما يكذب عند الاقتطاع:
                          الملخص أسفلها مجموعٌ من المعروض لا من الحساب كله.
                          الجزء الصحيح دائماً — «بدون تحديد فترة» — يبقى في
                          الحالتين، ويتغيّر الجزء الذي يدّعي الشمول وحده. */}
                      <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                        <CalendarBlank size={12} />
                        {invoicesTruncated && invoicesTotal !== null
                          ? `أحدث ${invoices.length.toLocaleString()} فاتورة من ${invoicesTotal.toLocaleString()} — بدون تحديد فترة`
                          : "جميع الفواتير المسجلة على حسابك — بدون تحديد فترة"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {[
                        { label: "إجمالي الأتعاب المقيدة بالفواتير", value: totalAll, indent: false, muted: false },
                        { label: "الأتعاب المحصلة فعلياً (نقداً أو تحويلاً بنكياً)", value: totalCollected, indent: true, muted: false, highlight: true },
                        { label: "المتبقي على فواتير معلقة وجزئية", value: pendingRemainder + partialRemainder, indent: true, muted: true },
                        { label: "المتبقي على فواتير متأخرة", value: overdueRemainder, indent: true, muted: true },
                      ].map(row => (
                        <div key={row.label} className={`flex items-center justify-between py-2.5 ${row.indent ? "ps-5 border-dashed" : ""} border-b ${isDark ? "border-white/[0.03]" : "border-slate-50"} ${row.highlight ? "bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] px-2 rounded-xl" : ""}`}>
                          <span className={`text-[12px] ${row.highlight ? "font-bold text-emerald-500" : row.muted ? isDark ? "text-zinc-500" : "text-slate-400" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{row.label}</span>
                          <span className={`font-mono text-[12px] font-black ${row.highlight ? "text-emerald-500" : row.muted ? isDark ? "text-zinc-500" : "text-slate-400" : isDark ? "text-zinc-200" : "text-slate-700"}`}>{row.value.toLocaleString()} ﷼</span>
                        </div>
                      ))}
                    </div>

                    {/* لماذا لا يوجد صافي ربح هنا: لا مصدر لمصروفات المكتب. */}
                    <div className={`p-4 rounded-2xl border flex items-start gap-2.5 text-[11px] leading-relaxed ${
                      isDark ? "border-amber-500/20 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}>
                      <Warning size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
                      <span>
                        هذا ملخص تحصيل وليس قائمة أرباح وخسائر: المنصة لا تسجّل مصروفات المكتب ولا ضريبة القيمة المضافة،
                        فلا يمكن احتساب صافي ربح أو هامش منها. احتساب الأرباح والإقرار الضريبي يتمّان في دفاتر مكتبك.
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </>
      )}

      {/* ── النافذة الزجاجية التفاعلية المنبثقة: إنشاء فاتورة جديدة ── */}
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
                <h2 className="text-xl font-extrabold tracking-tight">إصدار فاتورة جديدة</h2>
              </div>

              <AnimatePresence mode="wait">
                {isSubmitting ? (
                  // شاشة الانتظار أثناء الحفظ على الخادم.
                  // النص السابق كان يعد بـ«فحص المطابقة وحساب الضريبة بالذكاء
                  // الاصطناعي»؛ الطلب يكتب صف فاتورة واحداً ولا يحسب ضريبة.
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
                        جارٍ حفظ الفاتورة...
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-xs mx-auto leading-relaxed">
                        يتم تسجيل الفاتورة في سجلّك المالي على المنصة.
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
                        placeholder="مثال: نزاع تجاري، استشارة عمالية..."
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
                          min="1"
                          step="any"
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

                    {invoiceError && (
                      <div className={`p-3 rounded-xl flex items-center gap-2 text-[11px] font-semibold ${isDark ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                        <Warning size={14} weight="fill" className="flex-shrink-0" />
                        <span>{invoiceError}</span>
                      </div>
                    )}

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

      {/* ── نافذة تأكيد تحصيل الفاتورة (نقداً / تحويل بنكي) ── */}
      <AnimatePresence>
        {collectTarget && (() => {
          const alreadyCollected = Number(collectTarget.paidAmount) || 0;
          const totalFee = Number(collectTarget.totalFee) || 0;
          const remaining = totalFee - alreadyCollected;
          const closeCollect = () => { if (!isCollecting) setCollectTarget(null); };

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">

              {/* الخلفية المعتمة */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeCollect}
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
                className={`relative z-10 w-full max-w-md p-6 md:p-7 rounded-[2.5rem] border text-right shadow-2xl ${
                  isDark
                    ? "bg-zinc-950/90 border-white/10 text-zinc-100"
                    : "bg-white border-slate-200 text-slate-800"
                }`}
              >
                {/* إغلاق */}
                <button
                  onClick={closeCollect}
                  disabled={isCollecting}
                  className="absolute top-6 left-6 p-2 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <X size={14} className={isDark ? "text-zinc-400" : "text-slate-500"} />
                </button>

                <div className="flex items-center gap-2 mb-5">
                  <span className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500">
                    <CheckCircle size={18} weight="duotone" />
                  </span>
                  <h2 className="text-lg font-extrabold tracking-tight">تسجيل تحصيل الفاتورة</h2>
                </div>

                <form onSubmit={handleCollect} className="space-y-4">

                  {/* ملخص الفاتورة المستهدفة */}
                  <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? "border-white/[0.06] bg-zinc-900/50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[12px] font-black truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{collectTarget.client}</span>
                      <span className={`text-[9px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{collectTarget.id}</span>
                    </div>
                    <div className={`flex items-center justify-between text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      <span>إجمالي الفاتورة</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{totalFee.toLocaleString()} ﷼</span>
                    </div>
                    {alreadyCollected > 0 && (
                      <div className={`flex items-center justify-between text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                        <span>محصّل سابقاً</span>
                        <span className="font-mono font-bold text-blue-500">{alreadyCollected.toLocaleString()} ﷼</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className={isDark ? "text-zinc-400" : "text-slate-600"}>المتبقي للتحصيل</span>
                      <span className="font-mono font-black text-emerald-500">{remaining.toLocaleString()} ﷼</span>
                    </div>
                  </div>

                  {/* طريقة استلام المبلغ */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">كيف استلمت المبلغ؟</label>
                    <div className="grid grid-cols-2 gap-3">
                      {COLLECT_METHODS.map(m => {
                        const MIcon = m.icon;
                        const isActive = collectMethod === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => setCollectMethod(m.key)}
                            disabled={isCollecting}
                            className={`rounded-2xl border p-3 text-right transition-all cursor-pointer disabled:cursor-not-allowed ${
                              isActive
                                ? "border-[#C8A762] bg-[#C8A762]/10"
                                : isDark ? "border-white/[0.08] bg-zinc-900/60 hover:border-white/20" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                            }`}
                          >
                            <MIcon size={18} weight="duotone" className={isActive ? "text-[#C8A762]" : isDark ? "text-zinc-500" : "text-slate-400"} />
                            <p className={`text-[12px] font-black mt-1.5 ${isActive ? "text-[#C8A762]" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{m.label}</p>
                            <p className={`text-[9px] leading-relaxed mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{m.hint}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* المبلغ المستلم الآن (اختياري) */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                      المبلغ المستلم الآن (﷼) — اتركه فارغاً لتحصيل المتبقي كاملاً:
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      disabled={isCollecting}
                      placeholder={remaining.toLocaleString()}
                      className={`w-full rounded-2xl border px-4 py-3 text-[12px] outline-none focus:border-[#C8A762]/50 transition-all text-right font-semibold font-mono disabled:opacity-60 ${
                        isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    />
                  </div>

                  {/* تنبيه: القيد نهائي ولا يمكن التراجع عنه من هنا */}
                  <div className={`p-3 rounded-xl border flex items-start gap-2 text-[10px] leading-relaxed ${
                    isDark ? "border-amber-500/20 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}>
                    <Warning size={13} weight="fill" className="flex-shrink-0 mt-0.5" />
                    <span>
                      هذا قيد محاسبي يدوي لمبلغ استلمته خارج المنصة، وليس عملية دفع إلكتروني.
                      لا يمكن التراجع عنه من هذه الصفحة بعد التأكيد.
                    </span>
                  </div>

                  {collectError && (
                    <div className={`p-3 rounded-xl flex items-center gap-2 text-[11px] font-semibold ${isDark ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      <Warning size={14} weight="fill" className="flex-shrink-0" />
                      <span>{collectError}</span>
                    </div>
                  )}

                  <div className="pt-2 flex gap-3">
                    <motion.button
                      whileHover={isCollecting ? undefined : { scale: 1.02 }}
                      whileTap={isCollecting ? undefined : { scale: 0.98 }}
                      type="submit"
                      disabled={isCollecting}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black bg-[#0B3D2E] text-[#C8A762] hover:bg-[#07241b] shadow-lg shadow-[#0B3D2E]/10 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isCollecting ? (
                        <>
                          <motion.span
                            className="w-3.5 h-3.5 rounded-full border-2 border-[#C8A762]/30 border-t-[#C8A762]"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          />
                          جارٍ تسجيل التحصيل...
                        </>
                      ) : "تأكيد التحصيل"}
                    </motion.button>
                    <motion.button
                      whileHover={isCollecting ? undefined : { scale: 1.02 }}
                      whileTap={isCollecting ? undefined : { scale: 0.98 }}
                      type="button"
                      onClick={closeCollect}
                      disabled={isCollecting}
                      className={`px-6 py-3 rounded-2xl text-xs font-black border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      إلغاء
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
