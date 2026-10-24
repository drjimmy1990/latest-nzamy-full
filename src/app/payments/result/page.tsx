import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ResultAutoRefresh from "@/components/payments/ResultAutoRefresh";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fulfillOrder } from "@/lib/payments/fulfillOrder";
import { isMissingPaymentsObject } from "@/lib/payments/fulfillDecision";
import { MOYASAR_DISABLED_MESSAGE_AR } from "@/lib/payments/moyasarConfig";
import {
  paymentResultView,
  pendingView,
  resultViewWithoutPayment,
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
        <p className="mt-3 text-sm opacity-80">
          رسالة بوابة الدفع:{" "}
          <span dir="auto" className="font-mono">
            {view.detail}
          </span>
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

function Shell({ view, refreshHref }: { view: ResultView; refreshHref: string }) {
  return (
    <>
      <Navbar />
      <main dir="rtl" className="min-h-[70dvh] bg-zinc-50 px-4 pb-20 pt-32 dark:bg-[#0A0A0A]">
        <div className="mx-auto max-w-xl">
          <ResultCard view={view} refreshHref={refreshHref} />
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

  return <Shell view={view} refreshHref={selfHref} />;
}
