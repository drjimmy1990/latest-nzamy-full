"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wallet,
  Clock,
  CheckCircle,
  Copy,
  Receipt,
  ArrowDown,
  ArrowUp,
  Tag,
  Info,
  ArrowUpRight,
  UserCircle,
  HourglassHigh
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types & Data ─────────────────────────────────────────────────────────────
// These are the shapes /api/v1/wallet sends. `descEn` is optional: the DB
// stores a single Arabic description, so only the mock rows below carry one.

interface Coupon {
  code: string;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn?: string;
  discount: string;
  expiry: string;
  daysRemaining: number;
  type: "admin" | "provider" | "referral";
  providerName?: string;
  /**
   * THERE IS DELIBERATELY NO `used` FIELD, even though the route sends one.
   *
   * /api/v1/wallet computes it as `max_uses_per_user > 0 && usageCount >=
   * max_uses_per_user`, counting rows in `coupon_usage`. That table is SELECTed
   * in exactly one place in the entire tree — route.ts:149, the query that
   * builds this very count — and INSERTed in none. Nothing on any page, in any
   * route or in any trigger records a redemption, because nothing redeems a
   * coupon at all (see the tab comment below). So the count is permanently 0
   * and `used` is permanently false.
   *
   * Four branches on this page were keyed to it: a dimmed/greyed card border,
   * a «مُستخدم» badge, and two `!c.used &&` guards around the days-remaining
   * line and the code+copy block. A badge that cannot fire is a claim that we
   * track redemptions; we do not. All four are gone. Restore them — and this
   * field — the day something writes a `coupon_usage` row.
   */
  color: string;
}

interface TxRow {
  id: string;
  type: "credit" | "debit" | "system";
  amountAr: string;
  amountEn: string;
  descAr: string;
  descEn?: string;
  date: string;
}

/**
 * EXACTLY what GET /api/v1/wallet returns — no more.
 *
 * There used to be a `stats` member here (`successfulReferrals`,
 * `activeOffers`, `totalSaved`, `referralEarnings`, `spentOnServices`,
 * `pendingReferralReward`) and six places on this page read it. The route
 * (src/app/api/v1/wallet/route.ts) sends `{ balance, pendingBalance,
 * transactions, coupons }` and has never sent a `stats` key at all, so every
 * one of those reads resolved to `undefined`: three hero tiles printed a
 * hard-coded «٠» — «٠ إحالات ناجحة», «٠ عروض نشطة», «وفّرت ٠ ر.س حتى الآن» —
 * and three balance rows printed «—» under a «(قريباً)» label, permanently.
 * A rendered ٠ is a claim about the client's account exactly as much as a
 * rendered ٤٢ is. The type is now the contract, so a field with no source
 * cannot be read by accident.
 */
interface WalletApiResponse {
  data: {
    balance?: number;
    pendingBalance?: number;
    transactions?: TxRow[];
    coupons?: Coupon[];
  };
}

const coupons: Coupon[] = [
  {
    code: "SAUD-CONSULT-20",
    labelAr: "عرض محامي",
    labelEn: "Lawyer Promo",
    descAr: "٢٠٪ على استشارة ٤٥ دقيقة",
    descEn: "20% off 45min consultation",
    discount: "20%",
    expiry: "٣٠ يونيو ٢٠٢٦",
    daysRemaining: 45,
    type: "provider",
    providerName: "المحامي سعود القحطاني",
    color: "from-indigo-500 to-blue-400",
  },
  {
    code: "REF-GOLD-20",
    labelAr: "خصم إحالة",
    labelEn: "Referral Discount",
    descAr: "٢٠٪ على الاستشارة القادمة",
    descEn: "20% off your next consultation",
    discount: "20%",
    expiry: "٣٠ أبريل ٢٠٢٦",
    daysRemaining: 12,
    type: "referral",
    color: "from-amber-500 to-amber-400",
  },
  {
    code: "WELCOME-50",
    labelAr: "مكافأة المنصة",
    labelEn: "Platform Reward",
    descAr: "خصم ٥٠ ر.س على أول خدمة مدفوعة",
    descEn: "50 SAR off your first paid service",
    discount: "50 ر.س",
    expiry: "٣١ مارس ٢٠٢٦",
    daysRemaining: 0,
    type: "admin",
    color: "from-emerald-500 to-teal-400",
  },
];

const transactions: TxRow[] = [
  {
    id: "W1",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — أحمد العتيبي",
    descEn: "Referral reward — Ahmed Al-Otaibi",
    date: "٥ أبريل ٢٠٢٦",
  },
  {
    id: "W2",
    type: "debit",
    amountAr: "−٥٠ ر.س",
    amountEn: "−50 SAR",
    descAr: "خصم على استشارة قانون العمل",
    descEn: "Discount applied — Labor law consultation",
    date: "٧ أبريل ٢٠٢٦",
  },
  {
    id: "W3",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — سارة القحطاني",
    descEn: "Referral reward — Sara Al-Qahtani",
    date: "١٢ أبريل ٢٠٢٦",
  },
  {
    id: "W4",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — فهد الشمري",
    descEn: "Referral reward — Fahad Al-Shammari",
    date: "١٥ أبريل ٢٠٢٦",
  },
  {
    id: "W5",
    type: "debit",
    amountAr: "−٣٠ ر.س",
    amountEn: "−30 SAR",
    descAr: "خصم على مراجعة عقد إيجار",
    descEn: "Discount applied — Lease contract review",
    date: "١٨ أبريل ٢٠٢٦",
  },
  {
    id: "W6",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — خالد الدوسري",
    descEn: "Referral reward — Khaled Al-Dosari",
    date: "١٩ أبريل ٢٠٢٦",
  },
  {
    id: "W7",
    type: "system",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR معلقة",
    descAr: "مكافأة معلقة — نورة البقمي (لم تشترك بعد)",
    descEn: "Pending reward — Noura Al-Baqmi (not subscribed yet)",
    date: "٢٠ أبريل ٢٠٢٦",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: "easeOut" as const },
  }),
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const { isDark } = useTheme();
  const [walletBalance, setWalletBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  /**
   * True only once /api/v1/wallet has answered successfully.
   *
   * The balance starts at 0 and is only meaningful after the call returns, so
   * without this the hero prints «٠ ر.س» to every client for the length of the
   * round trip and forever after a failed one — a specific claim about their
   * money, made before we know it and again when we cannot. Until it is true
   * the figure renders as «—».
   *
   * The balance itself IS real: the route sums this user's own
   * `wallet_transactions` rows (credits minus debits, `pending` kept separate),
   * and src/lib/entitlements.ts:212 is the code that writes a credit. A zero
   * that comes back from that sum is a fact and is shown as one.
   */
  const [balanceKnown, setBalanceKnown] = useState(false);
  // Live arrays start empty — mock data is only shown while `loading` is true.
  const [liveCoupons, setLiveCoupons] = useState<Coupon[]>([]);
  const [liveTransactions, setLiveTransactions] = useState<TxRow[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<WalletApiResponse>("/api/v1/wallet")
      .then((res) => {
        setWalletError(null);
        if (res.data?.balance !== undefined) setWalletBalance(res.data.balance);
        if (res.data?.pendingBalance !== undefined) setPendingBalance(res.data.pendingBalance);
        setBalanceKnown(true);
        // Always replace with the API result (which may be []) — never keep mock
        // data after the call resolves.
        setLiveTransactions(res.data?.transactions ?? []);
        setLiveCoupons(res.data?.coupons ?? []);
      })
      .catch((err) => {
        console.error("[wallet] failed to load:", err);
        setWalletError("تعذر تحميل رصيد المحفظة. حاول مرة أخرى لاحقاً.");
        // On failure show nothing rather than fake rows — and do not claim a
        // balance we could not read.
        setBalanceKnown(false);
        setLiveTransactions([]);
        setLiveCoupons([]);
      })
      .finally(() => setWalletLoading(false));
  }, []);
  const [activeTab, setActiveTab] = useState<"overview" | "coupons" | "history">("overview");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Arabic-Indic digits, so the page's own figures read the same way as every
  // amount the API formats for it (`amountAr`, `discount`).
  function toArDigits(n: number): string {
    return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const tabs = [
    { id: "overview" as const, labelAr: "نظرة عامة", icon: Wallet },
    { id: "coupons" as const, labelAr: "كوبونات وعروض", icon: Tag },
    { id: "history" as const, labelAr: "سجل المعاملات", icon: Receipt },
  ];

  /**
   * The one list the coupons tab renders — hoisted because THREE places used to
   * re-derive it inline (`walletLoading && !isSupabaseMode ? coupons :
   * liveCoupons`): the empty state, the map, and now the explanatory paragraph
   * above them. Three copies of one expression is three chances for the
   * paragraph to disagree with the list underneath it — which is the exact
   * class of defect this pass is closing, at a smaller scale.
   *
   * `!isSupabaseMode` is kept verbatim: it is a module-level constant, so the
   * mock branch is dead-code-eliminated from the production bundle and this
   * reads as plain `liveCoupons` there.
   */
  const visibleCoupons = walletLoading && !isSupabaseMode ? coupons : liveCoupons;

  return (
    <div dir="rtl" className={`min-h-screen pb-24 ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-slate-50 text-zinc-900"}`}>
      <div className="mx-auto max-w-[760px] px-4 py-8 space-y-6">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Link href="/dashboard/client" className="hover:text-emerald-600 transition-colors">
            لوحة التحكم
          </Link>
          <span>/</span>
          <span className={isDark ? "text-zinc-300" : "text-zinc-600"}>محفظتي والمكافآت</span>
        </div>

        {/* ── Load Error Banner ── */}
        {walletError && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-[12px] ${
            isDark
              ? "bg-red-900/10 border-red-700/20 text-red-400"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            <Clock size={16} weight="duotone" className="flex-shrink-0" />
            <span>{walletError}</span>
          </div>
        )}

        {/* ── Hero Balance Card ── */}
        <motion.div
          custom={0} variants={fadeUp} initial="hidden" animate="visible"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B3D2E] to-[#0a5040] p-7 shadow-xl"
        >
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-12 -end-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -start-8 h-36 w-36 rounded-full bg-amber-400/10 blur-2xl" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={18} weight="fill" className="text-amber-400" />
              <p className="text-sm text-white/60 font-medium">رصيد المحفظة</p>
            </div>
            <div className="flex items-end gap-3 mb-4">
              <span className="text-5xl font-extrabold text-white font-mono">
                {balanceKnown ? toArDigits(walletBalance) : "—"}
              </span>
              <span className="text-xl font-bold text-white/70 mb-1">ر.س</span>
              {balanceKnown && pendingBalance > 0 && (
                <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-full px-2.5 py-0.5">
                  <Clock size={11} />
                  {toArDigits(pendingBalance)} ر.س معلقة
                </span>
              )}
            </div>

            {/*
              WHAT USED TO BE HERE. Three tiles reading «٠ إحالات ناجحة»,
              «٠ عروض نشطة» and «وفّرت ٠ ر.س حتى الآن» — all three off a `stats`
              object the wallet route does not send — then the line «يُطبَّق
              الرصيد تلقائياً عند الدفع لأي خدمة» over a button to the lawyer
              directory. There is no payment step anywhere in the product for
              the balance to be applied at: the gateway is behind an admin flag
              and no provider has been chosen. Saying so is the fix; the tiles
              had no source at all, so they are gone rather than zeroed.
            */}
            <p className="text-xs text-white/60 leading-relaxed border-t border-white/10 pt-4">
              الرصيد محفوظ على حسابك، ولا يمكن استخدامه بعد — بوابة الدفع في المنصة غير مفعَّلة حالياً.
            </p>
          </div>
        </motion.div>

        {/* ── Honest note on what the balance can and cannot do ── */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
          className={`flex items-start gap-3 rounded-2xl border p-4 ${
            isDark ? "bg-amber-950/30 border-amber-700/20" : "bg-amber-50 border-amber-200"
          }`}
        >
          <Info size={18} weight="fill" className="text-amber-500 mt-0.5 shrink-0" />
          <div className={`text-sm leading-relaxed ${isDark ? "text-amber-300" : "text-amber-800"}`}>
            {/*
              The balance and the coupons are NOT the same kind of thing, and
              this paragraph used to lump them together as «الرصيد والكوبونات
              تبقى مسجّلة على حسابك». Half of that is true and half is not:

               • the balance IS the client's — the route sums THIS user's own
                 `wallet_transactions` rows (`.eq("user_id", user.id)`), and
                 src/lib/entitlements.ts:212 is what writes a credit;
               • a coupon is not owned by anybody. `coupons` has no owner
                 column at all and the route asks only for `active = true`,
                 so every client is shown the identical platform-wide list.

              Saying «على حسابك» over both understated the first and invented
              the second. They are stated separately now.
            */}
            <p>
              <strong>متى أستطيع استخدام الرصيد؟</strong> لا توجد حتى الآن صفحة دفع في المنصة يُخصم منها
              الرصيد، ولم تُفعَّل بوابة الدفع. رصيدك يبقى مسجّلاً على حسابك وسيُتاح استخدامه فور تفعيل
              البوابة، أمّا الكوبونات فهي عروض عامة على المنصة وليست مخصّصة لحسابك. طلباتك القانونية حتى
              ذلك الحين تُنسَّق مع فريق نظامي مباشرة.
            </p>
            <Link
              href="/dashboard/client/services"
              className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold ${
                isDark ? "text-amber-200 hover:text-amber-100" : "text-amber-900 hover:text-amber-700"
              }`}
            >
              تصفّح الخدمات القانونية
              <ArrowUpRight size={14} weight="bold" />
            </Link>
          </div>
        </motion.div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 rounded-2xl border border-zinc-200/40 bg-white p-1.5 dark:border-white/10 dark:bg-zinc-900 flex-wrap">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-[#0B3D2E] text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                <Icon size={14} weight={activeTab === tab.id ? "fill" : "regular"} />
                {tab.labelAr}
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >

            {/* ── Overview ── */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/*
                  Balance breakdown — only the two figures the route actually
                  computes. It used to carry three more rows («مكتسب من
                  الإحالات», «مُستخدم على خدمات سابقة», «رصيد معلق») whose
                  amounts came off the absent `stats` object, so all three
                  printed «—» beside a «(قريباً)» label for every client,
                  forever. A row that can never carry a number is not a row.
                  Underneath them sat a card offering «٥٠ ر.س لكل صديق ينضم» —
                  a reward nobody has approved, for a referral programme that
                  records nothing (see ../referral/page.tsx). Both are gone.
                */}
                <div className={`${card} p-5`}>
                  <h3 className={`font-bold text-sm mb-4 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    تفاصيل الرصيد
                  </h3>
                  <div className="space-y-3">
                    <div className={`flex items-center gap-3 rounded-xl p-3 ${isDark ? "bg-emerald-900/20" : "bg-emerald-50"}`}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Wallet size={16} weight="duotone" className="text-emerald-500" />
                      </div>
                      <p className={`flex-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الرصيد المتاح</p>
                      <span className="font-bold text-sm font-mono text-emerald-500">
                        {balanceKnown ? `${toArDigits(walletBalance)} ر.س` : "—"}
                      </span>
                    </div>

                    {/* Shown only when there is something pending. `pending` is
                        its own `wallet_transactions.kind`, so this figure is
                        read off real rows exactly like the balance is. */}
                    {balanceKnown && pendingBalance > 0 && (
                      <div className={`flex items-center gap-3 rounded-xl p-3 ${isDark ? "bg-amber-900/20" : "bg-amber-50"}`}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Clock size={16} weight="duotone" className="text-amber-400" />
                        </div>
                        <p className={`flex-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                          رصيد معلّق — لم يُفرج عنه بعد
                        </p>
                        <span className="font-bold text-sm font-mono text-amber-400">
                          {toArDigits(pendingBalance)} ر.س
                        </span>
                      </div>
                    )}
                  </div>

                  <p className={`mt-4 pt-4 border-t text-[12px] leading-relaxed ${
                    isDark ? "border-white/10 text-zinc-500" : "border-zinc-100 text-zinc-500"
                  }`}>
                    يُضاف الرصيد إلى حسابك من إدارة نظامي. كل حركة عليه مسجّلة في «سجل المعاملات».
                  </p>
                </div>
              </div>
            )}

            {/* ── Coupons ── */}
            {activeTab === "coupons" && (
              <div className="space-y-3">
                {/*
                  THESE COUPONS ARE NOT THIS CLIENT'S. Two rewrites have now
                  been wrong about the same list, in opposite directions:

                   • «انسخ الكود وأدخله في صفحة الدفع، أو سيُطبّق تلقائياً عند
                     حجزك للخدمة المرتبطة به» — false about SPENDING one. There
                     is no payment page to paste a code into and nothing redeems
                     one at booking.
                   • «هذه الكوبونات مسجّلة على حسابك» — false about OWNING one,
                     which is what replaced it. Nothing scopes a coupon to a
                     user: /api/v1/wallet:139 asks for `.from("coupons")
                     .select("*").eq("active", true)` with no user predicate,
                     because the table HAS no owner column
                     (20260603_phase1_003_subscriptions_billing.sql:91-110), and
                     its RLS policy at :213 is «anyone can read active coupons».
                     Every client is shown the identical platform-wide list.

                  There is a second, quieter falsehood in calling them the
                  client's: `coupons` does carry `eligible_user_types`,
                  `eligible_plan_tiers` and `min_order_amount`, and the route
                  reads NONE of them. So the list CAN include an offer this
                  particular client would not qualify for. Whether it does
                  today is unread — nobody has looked at the live `coupons`
                  rows, and the eligibility columns default to '{}', so an
                  all-empty table would mis-show nothing. The copy is written
                  to be true either way.

                  What is left that is true, and all the copy now claims: these
                  are offers currently live on the platform, and not one of them
                  can be redeemed yet. The paragraph is also gated on there
                  being something to describe — it used to render above the
                  empty state, so a client with no coupons read a sentence about
                  «هذه الكوبونات» immediately followed by «لا توجد كوبونات».
                */}
                {visibleCoupons.length > 0 && (
                  <p className={`text-xs mb-4 leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    هذه عروض متاحة على المنصة حالياً وليست كوبونات مخصّصة لحسابك. لا يمكن استبدال أي منها
                    بعد — لا توجد صفحة دفع تُطبَّق عليها، وقد لا ينطبق بعضها على حسابك عند تفعيل الاستبدال.
                  </p>
                )}
                {visibleCoupons.length === 0 ? (
                  <div className={`text-center text-sm py-10 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {/* «كوبونات» and not «عروض»: the tab is labelled «كوبونات
                        وعروض» and the cards carry «مكافأة المنصة» / «عرض محامي»
                        / «خصم إحالة», so renaming the thing only in its empty
                        state would leave one screen using two words for it.
                        The sentence claims no ownership either way. */}
                    {walletLoading ? "جارٍ التحميل…" : "لا توجد كوبونات حالياً."}
                  </div>
                ) : null}
                {visibleCoupons.map((c, i) => (
                  <motion.div
                    key={c.code}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    className={`relative overflow-hidden rounded-2xl border ${
                      isDark ? "border-white/10" : "border-zinc-200"
                    } ${isDark ? "bg-zinc-900" : "bg-white"} shadow-sm`}
                  >
                    {/* Color stripe */}
                    <div className={`absolute start-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${c.color} rounded-e-full`} />

                    <div className="px-5 py-4 ms-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${c.color} text-white`}>
                              {c.labelAr}
                            </span>
                            {c.type === "provider" && c.providerName && (
                              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/10 text-indigo-300" : "bg-indigo-50 text-indigo-700"}`}>
                                <UserCircle size={12} weight="fill" />
                                {c.providerName}
                              </span>
                            )}
                            {/* A «مُستخدم» badge stood here on `c.used`. See the
                                `Coupon` interface: nothing in the tree ever
                                writes a `coupon_usage` row, so the flag could
                                only ever be false and the badge could only ever
                                be dead markup claiming we track redemptions. */}
                          </div>

                          <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                            {c.descAr}
                          </p>

                          <div className={`flex flex-wrap items-center gap-3 mt-2`}>
                            {c.expiry && (
                              <p className={`text-xs flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                                <Clock size={12} />
                                ينتهي {c.expiry}
                              </p>
                            )}
                            {c.daysRemaining > 0 && (
                              <p className={`text-xs font-bold flex items-center gap-1 ${c.daysRemaining < 15 ? "text-rose-500" : isDark ? "text-amber-400" : "text-amber-600"}`}>
                                <HourglassHigh size={12} weight="fill" />
                                باقي {c.daysRemaining} يوماً
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-end flex-shrink-0">
                          <div className={`text-2xl font-extrabold font-mono ${isDark ? "text-white" : "text-zinc-800"}`}>
                            {c.discount}
                          </div>
                          <div className={`text-[10px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            خصم
                          </div>
                        </div>
                      </div>

                      {/* The code + copy control. It used to sit behind
                          `!c.used`; unconditional now, for the same reason the
                          badge is gone. Copying still does something real — it
                          puts the code on the clipboard — and the paragraph
                          above says plainly that nothing redeems it yet, so
                          this is a copy button that copies, not a redeem
                          button that does not redeem. */}
                      <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${
                        isDark ? "bg-zinc-800/60 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}>
                        <Tag size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                        <code className={`flex-1 text-sm font-mono font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                          {c.code}
                        </code>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => copyCode(c.code)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            copiedCode === c.code
                              ? "bg-emerald-500 text-white"
                              : isDark
                              ? "bg-emerald-800/50 text-emerald-400 hover:bg-emerald-700/50"
                              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          }`}
                        >
                          <AnimatePresence mode="wait">
                            {copiedCode === c.code ? (
                              <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex items-center gap-1">
                                <CheckCircle size={12} weight="fill" />
                                تم
                              </motion.span>
                            ) : (
                              <motion.span key="copy" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex items-center gap-1">
                                <Copy size={12} />
                                نسخ
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* ── History ── */}
            {activeTab === "history" && (
              <div className={`${card} overflow-hidden`}>
                <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                  <h3 className={`font-bold text-sm ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                    سجل معاملات المحفظة
                  </h3>
                </div>
                <div className="divide-y divide-dashed divide-zinc-100 dark:divide-white/[0.05]">
                  {(walletLoading && !isSupabaseMode ? transactions : liveTransactions).length === 0 ? (
                    <div className={`text-center text-sm py-10 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      {walletLoading ? "جارٍ التحميل…" : "لا توجد معاملات بعد."}
                    </div>
                  ) : null}
                  {(walletLoading && !isSupabaseMode ? transactions : liveTransactions).map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      custom={i}
                      variants={fadeUp}
                      initial="hidden"
                      animate="visible"
                      className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
                        isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50"
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        tx.type === "credit"
                          ? isDark ? "bg-emerald-900/30" : "bg-emerald-50"
                          : tx.type === "debit"
                          ? isDark ? "bg-red-900/20" : "bg-red-50"
                          : isDark ? "bg-amber-900/20" : "bg-amber-50"
                      }`}>
                        {tx.type === "credit" ? (
                          <ArrowDown size={15} weight="bold" className="text-emerald-500" />
                        ) : tx.type === "debit" ? (
                          <ArrowUp size={15} weight="bold" className="text-red-400" />
                        ) : (
                          <Clock size={15} weight="duotone" className="text-amber-400" />
                        )}
                      </div>

                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                          {tx.descAr}
                        </p>
                        <p className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                          {tx.date}
                        </p>
                      </div>

                      {/* Amount */}
                      <span className={`font-bold text-sm font-mono flex-shrink-0 ${
                        tx.type === "credit"
                          ? "text-emerald-500"
                          : tx.type === "debit"
                          ? "text-red-400"
                          : "text-amber-400"
                      }`}>
                        {tx.amountAr}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}
