import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import TopUpReturnLink from "@/components/payments/TopUpReturnLink";
import Footer from "@/components/Footer";
import ResultAutoRefresh from "@/components/payments/ResultAutoRefresh";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fulfillOrder } from "@/lib/payments/fulfillOrder";
import { isMissingPaymentsObject } from "@/lib/payments/fulfillDecision";
import { MOYASAR_DISABLED_MESSAGE_AR } from "@/lib/payments/moyasarConfig";
import {
  FOUNDER_WELCOME_RECEIPT_LABEL,
  FOUNDER_WELCOME_TOOLS_LABEL,
  founderWelcomeFor,
  paymentResultView,
  pendingView,
  resultViewWithoutPayment,
  type FounderWelcome,
  type ResultOrder,
  type ResultTone,
  type ResultView,
} from "@/lib/payments/resultView";

/**
 * /payments/result?order=<id>&id=<paymentId>&status=… — where Moyasar sends
 * the payer back (the intent's callback_url; Moyasar appends id, status and
 * message). Moyasar payments B1, Task 6.
 *
 * A server component, per request:
 *   - signed out → /login?from=<this page>;
 *   - the order is read with the service role AND `user_id = <the signed-in
 *     user>` in the same query: someone else's order (or none) is a 404;
 *   - fulfillOrder with the payment id already stored on the order (verified
 *     when it was stamped), or else the callback's — it re-fetches the payment from Moyasar with the secret
 *     key and decides. `?status=` and `?message=` are never read: the URL is
 *     the payer's to edit;
 *   - the outcome is shown in Arabic (src/lib/payments/resultView.ts):
 *     success with the receipt link, the refund-review notice, a failure with
 *     Moyasar's message beside the Arabic copy and a retry link, or
 *     «جارٍ تأكيد الدفع…» with a refresh. While it is pending the page
 *     re-renders itself every 3 s for about a minute (ResultAutoRefresh,
 *     autoRefreshDecision), so a confirmation that lands a moment later shows
 *     without a press; the manual refresh link stays.
 *
 * Deploy order: before 20261022_10 runs the orders table is missing — the
 * page says online payment is unavailable (logged once), never a 500.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "نتيجة الدفع | نظامي",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

function firstParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null;
}

const missingLogged = new Set<string>();

/** The orders table missing (deploy order): logged once per process. */
function logMissingOnce(code: string | undefined): void {
  if (missingLogged.has("orders")) return;
  missingLogged.add("orders");
  console.warn(`[payments/result] the orders table is missing (${code ?? "?"}); 20261022_10 is not applied yet`);
}

const TONE_CLASSES: Record<ResultTone, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  review: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  refunded: "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  failed: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
  pending: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
  closed: "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  rejected: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
};

const BUTTON =
  "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-colors";
const PRIMARY = `${BUTTON} bg-[#0B3D2E] text-white hover:bg-[#0E4D3A]`;
const SECONDARY = `${BUTTON} border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;

/** The page cannot reach the database right now: say so, offer a refresh. */
function temporarilyUnavailableView(): ResultView {
  return {
    tone: "pending",
    title: "الخدمة غير متاحة مؤقتاً",
    body: "تعذّر عرض حالة الدفع الآن. حدّث الصفحة بعد لحظات.",
    refresh: true,
    contact: false,
  };
}

function ResultCard({ view, refreshHref }: { view: ResultView; refreshHref: string }) {
  return (
    <section className={`rounded-2xl border p-6 sm:p-8 ${TONE_CLASSES[view.tone]}`} aria-live="polite">
      <h1 className="text-xl font-bold sm:text-2xl">{view.title}</h1>
      {view.body ? <p className="mt-3 leading-7">{view.body}</p> : null}
      {view.detail ? (
        <p className="mt-3 text-sm font-semibold leading-7">
          سبب الرفض: {view.detail}
        </p>
      ) : null}
      {/* While pending the page re-renders itself every 3 s for about a minute;
          a final render drops this, which stops it (autoRefreshDecision). */}
      {view.refresh ? <ResultAutoRefresh refresh /> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {view.receiptHref ? (
          <Link href={view.receiptHref} className={PRIMARY}>
            عرض إيصال الدفع
          </Link>
        ) : null}
        {/* l6-pay: started from a tool's in-place top-up → back to the tool, the input kept */}
        {view.receiptHref ? <TopUpReturnLink className={SECONDARY} /> : null}
        {view.retryHref ? (
          <Link href={view.retryHref} className={PRIMARY}>
            حاول مرة أخرى
          </Link>
        ) : null}
        {view.refresh ? (
          <a href={refreshHref} className={PRIMARY}>
            تحديث الصفحة
          </a>
        ) : null}
        {view.contact ? (
          <Link href="/contact" className={SECONDARY}>
            تواصل معنا
          </Link>
        ) : null}
        <Link href="/dashboard" className={SECONDARY}>
          لوحة التحكم
        </Link>
      </div>
    </section>
  );
}

const GOLD_PRIMARY = `${BUTTON} bg-[#0B3D2E] text-white shadow-[0_6px_18px_rgba(11,61,46,0.35)] hover:bg-[#0E4D3A] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:hover:bg-[#d6b877]`;
const GOLD_SECONDARY = `${BUTTON} border border-[#C8A762] text-[#7a6230] hover:bg-[#C8A762]/10 dark:text-[#e5cca0]`;

/** A four-point sparkle; decorative only. */
function Sparkle({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={style}>
      <path d="M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z" fill="currentColor" />
    </svg>
  );
}

/**
 * F16 — the founder membership's welcome (owner, 13-Nov package): a gold
 * #C8A762 frame, the founders' greeting, what the membership includes and two
 * ways on: the tools, and the receipt. A server component: the motion is CSS
 * only (globals.css .nz-founder-*), and prefers-reduced-motion turns it off.
 */
function FounderWelcomeCard({ welcome }: { welcome: FounderWelcome }) {
  return (
    <section
      aria-live="polite"
      className="nz-founder-rise relative rounded-3xl bg-gradient-to-br from-[#C8A762] via-[#e5cca0] to-[#b8974f] p-[2px] shadow-[0_0_48px_rgba(11,61,46,0.28)]"
    >
      <div className="relative overflow-hidden rounded-[calc(1.5rem-2px)] bg-[#fffdf8] px-6 py-8 text-center text-zinc-900 sm:px-10 dark:bg-[#0d1512] dark:text-zinc-100">
        <Sparkle className="nz-founder-sparkle absolute right-6 top-6 h-4 w-4 text-[#C8A762]" />
        <Sparkle className="nz-founder-sparkle absolute left-8 top-12 h-3 w-3 text-[#C8A762]" style={{ animationDelay: "0.6s" }} />
        <Sparkle className="nz-founder-sparkle absolute bottom-10 right-10 h-3 w-3 text-[#C8A762]" style={{ animationDelay: "1.2s" }} />

        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#C8A762] to-[#b8974f] text-[#0B3D2E] shadow-[0_8px_24px_rgba(200,167,98,0.45)]">
          {/* a crown */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
            <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z" fill="currentColor" />
            <rect x="5" y="19.5" width="14" height="2" rx="1" fill="currentColor" />
          </svg>
        </div>

        <h1 className="text-2xl font-extrabold text-[#0B3D2E] sm:text-3xl dark:text-[#e5cca0]">{welcome.title}</h1>
        <p className="mx-auto mt-3 max-w-md leading-7 text-zinc-700 dark:text-zinc-300">{welcome.body}</p>

        <p className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-[#C8A762]/50 bg-[#C8A762]/[0.12] px-4 py-1.5 text-sm font-bold text-[#0B3D2E] dark:text-[#e5cca0]">
          <Sparkle className="h-3.5 w-3.5 text-[#b8974f]" />
          {welcome.pointsLine}
        </p>

        <ul className="mx-auto mt-6 max-w-md space-y-2 text-start text-sm">
          {welcome.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 rounded-xl border border-[#C8A762]/30 bg-[#C8A762]/[0.07] px-3 py-2">
              <span aria-hidden="true" className="mt-0.5 font-bold text-[#b8974f]">✓</span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={welcome.toolsHref} className={GOLD_PRIMARY}>
            {FOUNDER_WELCOME_TOOLS_LABEL}
          </Link>
          <Link href={welcome.receiptHref} className={GOLD_SECONDARY}>
            {FOUNDER_WELCOME_RECEIPT_LABEL}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Shell({ view, refreshHref, welcome = null }: { view: ResultView; refreshHref: string; welcome?: FounderWelcome | null }) {
  return (
    <>
      <Navbar />
      <main dir="rtl" className="min-h-[70dvh] bg-zinc-50 px-4 pb-20 pt-32 dark:bg-[#0A0A0A]">
        <div className="mx-auto max-w-xl">
          {welcome ? <FounderWelcomeCard welcome={welcome} /> : <ResultCard view={view} refreshHref={refreshHref} />}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default async function PaymentResultPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const orderId = firstParam(sp.order);
  const callbackPaymentId = firstParam(sp.id);
  if (!orderId) notFound();

  const urlPaymentId = callbackPaymentId && SAFE_ID.test(callbackPaymentId) ? callbackPaymentId : null;
  const selfHref = `/payments/result?order=${encodeURIComponent(orderId)}${
    urlPaymentId ? `&id=${encodeURIComponent(urlPaymentId)}` : ""
  }`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?from=${encodeURIComponent(selfHref)}`);

  let admin: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    admin = await createServiceClient();
  } catch {
    console.error("[payments/result] the service client could not be created");
    return <Shell view={temporarilyUnavailableView()} refreshHref={selfHref} />;
  }
  const { data, error } = await admin
    .from("payment_orders")
    .select("id, kind, item_id, billing, status, receipt_number, moyasar_payment_id")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (error.code === "22P02") notFound(); // not a uuid
    if (isMissingPaymentsObject(error.code)) {
      logMissingOnce(error.code);
      const unavailable: ResultView = { tone: "closed", title: MOYASAR_DISABLED_MESSAGE_AR, body: "", refresh: false, contact: true };
      return <Shell view={unavailable} refreshHref={selfHref} />;
    }
    console.error("[payments/result] reading the order failed:", error.code);
    return <Shell view={pendingView()} refreshHref={selfHref} />;
  }
  if (!data) notFound();

  const order = data as ResultOrder & { moyasar_payment_id: string | null };
  // Task F fix round 1: a top-up names the points its lot actually credited
  // (an order bought before owner ٤٢٢ keeps its own count). Best-effort: no
  // lot yet (a fresh order) or a failed read falls back to the book's label.
  if (order.item_id.startsWith("topup-")) {
    try {
      const lot = await admin
        .from("points_lots")
        .select("points_total")
        .eq("order_id", order.id)
        .eq("user_id", user.id)
        .eq("source", "purchase")
        .maybeSingle();
      const points = (lot.data as { points_total?: unknown } | null)?.points_total;
      if (!lot.error && typeof points === "number" && Number.isSafeInteger(points)) order.credited_points = points;
    } catch {
      // the book's label stands
    }
  }
  // The stored payment id wins: it was verified against this order when it was
  // stamped. The callback's ?id= is used only while the order has none.
  const paymentId = order.moyasar_payment_id ?? urlPaymentId;

  let view: ResultView;
  if (!paymentId) {
    view = resultViewWithoutPayment(order);
  } else {
    try {
      const result = await fulfillOrder({ orderId: order.id, paymentId, merchant: "platform" });
      view = paymentResultView(result, order);
    } catch {
      console.error("[payments/result] fulfilment temporarily unavailable");
      view = pendingView();
    }
  }

  // F16: a successful founder membership gets the gold welcome; every other
  // outcome and order keeps the ordinary card.
  return <Shell view={view} refreshHref={selfHref} welcome={founderWelcomeFor(view, order)} />;
}
