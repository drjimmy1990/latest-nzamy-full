"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatHalalas, type Billing } from "@/lib/payments/catalog";
import { NOT_FOR_SALE_AR, type CheckoutResponse } from "@/lib/payments/checkoutRules";
import {
  intentNeedsRefresh,
  moyasarInitConfig,
  parseCheckoutResponse,
  parseCouponPreview,
  type CouponPreview,
  quoteVatNotice,
  refreshDecision,
} from "@/lib/payments/checkoutView";

/**
 * MoyasarCheckout — the pay half of /checkout (Moyasar payments B1, Task 7).
 *
 *   1. «متابعة الدفع» POSTs /api/v1/payments/checkout {itemId, billing} from the
 *      click (never from an effect: a second POST would supersede the first
 *      order); an in-flight ref ignores a second press. The server prices the
 *      item for this buyer and creates the order and the Moyasar intent.
 *   2. The answer's quote is shown — net, VAT, total and the VAT sentence for
 *      the quoted mode — and the Moyasar form is mounted: the package and its
 *      CSS are imported only now, and Moyasar.init runs once per checkout,
 *      with the server's callback URL.
 *   3. When the payer presses pay, on_initiating hands Moyasar the intent and
 *      metadata.order_id (fulfilment rejects a payment without it). An intent
 *      near its expires_at is replaced by a new checkout first; if the new one
 *      charges a different total, the payment stops and the new figures are
 *      shown for the payer to confirm (refreshDecision).
 *   4. Whenever the form calls on_failure — a string message (Moyasar's
 *      documented shape) or an object such as a declined card or
 *      intent_not_fulfillable — the held checkout is dropped and «متابعة الدفع»
 *      starts a new one (needsNewCheckout). 3-D Secure failures land on
 *      /payments/result, whose retry link comes back here.
 *   5. The coupon field (P7, shown when the page says so): «تطبيق» asks
 *      POST /api/v1/coupons/validate for the server's figures and shows the
 *      discount line; «متابعة الدفع» then sends the code with the checkout,
 *      which applies it inside the order (the same rule — the preview is the
 *      charge). The field locks once the intent exists; a refreshed intent
 *      sends the same code.
 * 401 → /login and back here; 403 / 503 / 400 → the server's Arabic copy.
 * 403 (not this account type) and 410 (retired item or cycle, «لم يعد هذا
 * المنتج متاحاً للشراء») are final: «العودة إلى الباقات», never a retry.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "ready"; resp: CheckoutResponse }
  | { kind: "error"; message: string; audience: boolean };

// `audience`: a final refusal — 403 (account type) or 410 (no longer sold).
type StartResult =
  | { ok: true; resp: CheckoutResponse }
  | { ok: false; message: string; audience: boolean };

type MoyasarApi = { init: (config: object) => void; setAmount?: (amount: number) => void };

const START_FAILED_AR = "تعذّر بدء عملية الدفع، حاول مرة أخرى بعد قليل";
const FORM_FAILED_AR = "تعذّر تحميل نموذج الدفع، حدّث الصفحة وحاول مرة أخرى";
const REFRESH_FAILED_AR = "انتهت مهلة جلسة الدفع ولم نتمكّن من تجديدها، حدّث الصفحة وحاول مرة أخرى";
const TOTAL_CHANGED_AR = "تغيّر المبلغ المستحق منذ عرضه. راجع الإجمالي الجديد أعلاه ثم اضغط زر الدفع مرة أخرى.";
const NEW_CHECKOUT_AR = "لم يكتمل الدفع بجلسة الدفع هذه. اضغط «متابعة الدفع» لبدء محاولة جديدة.";

async function startCheckout(
  itemId: string,
  billing: Billing,
  couponCode: string | null,
): Promise<StartResult | "signed-out"> {
  let res: Response;
  try {
    res = await fetch("/api/v1/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(couponCode ? { itemId, billing, couponCode } : { itemId, billing }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: START_FAILED_AR, audience: false };
  }
  if (res.status === 401) return "signed-out";
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) {
    const resp = parseCheckoutResponse(body);
    return resp ? { ok: true, resp } : { ok: false, message: START_FAILED_AR, audience: false };
  }
  const error = (body as { error?: unknown } | null)?.error;
  const serverCopy = typeof error === "string" && error ? error : null;
  if (res.status === 410) return { ok: false, message: serverCopy ?? NOT_FOR_SALE_AR, audience: true };
  return {
    ok: false,
    message: serverCopy ?? START_FAILED_AR,
    audience: res.status === 403,
  };
}

/** /login and back to this checkout. */
function loginHref(): string {
  return `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
}

const COUPON_CHECK_FAILED_AR = "تعذّر التحقق من كود الخصم، حاول مرة أخرى بعد قليل";

type CouponCheck = { ok: true; preview: CouponPreview } | { ok: false; message: string } | "signed-out";

async function checkCoupon(code: string, itemId: string, billing: Billing): Promise<CouponCheck> {
  let res: Response;
  try {
    res = await fetch("/api/v1/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, itemId, billing }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: COUPON_CHECK_FAILED_AR };
  }
  if (res.status === 401) return "signed-out";
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) {
    const preview = parseCouponPreview(body);
    return preview ? { ok: true, preview } : { ok: false, message: COUPON_CHECK_FAILED_AR };
  }
  const error = (body as { error?: unknown } | null)?.error;
  return { ok: false, message: typeof error === "string" && error ? error : COUPON_CHECK_FAILED_AR };
}

const NOTICE_CLASS =
  "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";

export default function MoyasarCheckout({
  itemId,
  billing,
  couponsEnabled = false,
}: {
  itemId: string;
  billing: Billing;
  /** Show the coupon field (the page: 20261026_20 has run, not a top-up). */
  couponsEnabled?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  /** The applied code, read by the intent refresh (it must send the same one). */
  const couponCode = useRef<string | null>(null);
  /** The checkout the form pays with, and when it was received. */
  const current = useRef<{ resp: CheckoutResponse; at: number } | null>(null);
  /** A checkout POST is running: a second press is ignored. */
  const inFlight = useRef(false);
  const initialised = useRef(false);
  const moyasar = useRef<MoyasarApi | null>(null);

  async function onStart() {
    if (inFlight.current || current.current) return;
    inFlight.current = true;
    setNotice(null);
    setPhase({ kind: "starting" });
    try {
      const result = await startCheckout(itemId, billing, couponCode.current);
      if (result === "signed-out") {
        router.push(loginHref());
        return;
      }
      if (!result.ok) {
        setPhase({ kind: "error", message: result.message, audience: result.audience });
        return;
      }
      current.current = { resp: result.resp, at: Date.now() };
      setPhase({ kind: "ready", resp: result.resp });
    } finally {
      inFlight.current = false;
    }
  }

  async function onApplyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code || couponChecking || phase.kind !== "idle") return;
    setCouponChecking(true);
    setCouponMessage(null);
    try {
      const checked = await checkCoupon(code, itemId, billing);
      if (checked === "signed-out") {
        router.push(loginHref());
        return;
      }
      if (!checked.ok) {
        setCoupon(null);
        couponCode.current = null;
        setCouponMessage(checked.message);
        return;
      }
      setCoupon(checked.preview);
      couponCode.current = checked.preview.code;
    } finally {
      setCouponChecking(false);
    }
  }

  function onRemoveCoupon() {
    if (phase.kind !== "idle" && phase.kind !== "error") return;
    setCoupon(null);
    couponCode.current = null;
    setCouponInput("");
    setCouponMessage(null);
  }

  const ready = phase.kind === "ready" ? phase.resp : null;

  useEffect(() => {
    if (!ready || initialised.current) return;
    // Once per checkout. No cancel-on-cleanup: under StrictMode the effect
    // runs, is cleaned up and runs again, and the second run sees the guard —
    // a cancelled first run would leave the form never initialised.
    initialised.current = true;

    // The intent to pay with: the one held, or a new checkout when it is near
    // its expiry. Null → on_initiating answers false (no payment now).
    async function initiate(): Promise<CheckoutResponse | null> {
      const held = current.current;
      if (!held) return null;
      if (!intentNeedsRefresh(held.resp, held.at, Date.now())) return held.resp;
      const fresh = await startCheckout(itemId, billing, couponCode.current);
      if (fresh === "signed-out") {
        router.push(loginHref());
        return null;
      }
      if (!fresh.ok) {
        setNotice(fresh.audience ? fresh.message : REFRESH_FAILED_AR);
        return null;
      }
      current.current = { resp: fresh.resp, at: Date.now() };
      if (refreshDecision(held.resp, fresh.resp) === "confirm") {
        // Never charge a total the payer has not seen: show it, stop here.
        setPhase({ kind: "ready", resp: fresh.resp });
        moyasar.current?.setAmount?.(fresh.resp.amountHalalas);
        setNotice(TOTAL_CHANGED_AR);
        return null;
      }
      return fresh.resp;
    }

    // The form reported a failure: drop the intent; «متابعة الدفع» makes a new checkout
    // (the server closes this buyer's earlier unpaid orders for the item).
    function needNewCheckout() {
      current.current = null;
      initialised.current = false;
      setPhase({ kind: "idle" });
      setNotice(NEW_CHECKOUT_AR);
    }

    (async () => {
      try {
        const [mod] = await Promise.all([
          import("moyasar-payment-form"),
          import("moyasar-payment-form/dist/moyasar.css"),
        ]);
        if (!document.querySelector(".mysr-form")) return; // left the page meanwhile
        // The package's `import` export is its UMD build: webpack may hand it
        // over as the default export or as the module itself.
        const loaded = mod as unknown as { default?: { init?: unknown }; init?: unknown };
        const Moyasar = (typeof loaded.default?.init === "function" ? loaded.default : loaded) as MoyasarApi;
        if (typeof Moyasar.init !== "function") throw new Error("moyasar-payment-form has no init");
        moyasar.current = Moyasar;
        Moyasar.init(
          moyasarInitConfig(ready, {
            element: ".mysr-form",
            applePayFlag: process.env.NEXT_PUBLIC_APPLE_PAY_ENABLED,
            initiate,
            onNeedsNewCheckout: needNewCheckout,
          }),
        );
      } catch (err) {
        console.error("[checkout] the Moyasar form could not be loaded:", err instanceof Error ? err.message : "unknown");
        setNotice(FORM_FAILED_AR);
      }
    })();
  }, [ready, itemId, billing, router]);

  const couponBox = couponsEnabled ? (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <label htmlFor="nz-coupon" className="block font-semibold text-zinc-800 dark:text-zinc-200">
        كود الخصم
      </label>
      {coupon ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-[#0B3D2E] dark:text-[#C8A762]" dir="ltr">
              {coupon.code}
            </span>
            {phase.kind === "idle" || phase.kind === "error" ? (
              <button
                type="button"
                onClick={onRemoveCoupon}
                className="text-xs font-semibold text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
              >
                إزالة الكود
              </button>
            ) : null}
          </div>
          <dl className="space-y-1 text-zinc-700 dark:text-zinc-300">
            <div className="flex justify-between gap-4">
              <dt>السعر قبل الخصم</dt>
              <dd>{formatHalalas(coupon.listNet)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>الخصم</dt>
              <dd className="font-semibold text-emerald-700 dark:text-emerald-400">− {formatHalalas(coupon.discount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>المبلغ قبل الضريبة بعد الخصم</dt>
              <dd>{formatHalalas(coupon.net)}</dd>
            </div>
          </dl>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">تُحسب ضريبة القيمة المضافة على المبلغ بعد الخصم.</p>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            id="nz-coupon"
            dir="ltr"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            maxLength={32}
            autoComplete="off"
            disabled={phase.kind !== "idle" || couponChecking}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 uppercase text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={onApplyCoupon}
            disabled={phase.kind !== "idle" || couponChecking || couponInput.trim() === ""}
            className="shrink-0 rounded-xl border border-[#0B3D2E] px-4 py-2 font-bold text-[#0B3D2E] disabled:opacity-50 dark:border-[#C8A762] dark:text-[#C8A762]"
          >
            {couponChecking ? "جارٍ التحقق…" : "تطبيق"}
          </button>
        </div>
      )}
      {couponMessage ? (
        <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-400" role="alert">
          {couponMessage}
        </p>
      ) : null}
    </div>
  ) : null;

  if (phase.kind === "error") {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
        <p className="font-bold leading-7">{phase.message}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {phase.audience ? (
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0E4D3A]"
            >
              العودة إلى الباقات
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setPhase({ kind: "idle" })}
              className="inline-flex items-center justify-center rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0E4D3A]"
            >
              حاول مرة أخرى
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="space-y-4">
        {couponBox}
        {notice ? (
          <p className={NOTICE_CLASS} role="alert">
            {notice}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onStart}
          disabled={phase.kind === "starting"}
          className="inline-flex w-full items-center justify-center rounded-xl bg-[#0B3D2E] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#0E4D3A] disabled:cursor-wait disabled:opacity-70"
        >
          {phase.kind === "starting" ? "جارٍ تجهيز الدفع…" : "متابعة الدفع"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white text-sm dark:divide-zinc-700 dark:border-zinc-700 dark:bg-zinc-900">
        {ready.quote.discount && ready.quote.listNet !== undefined ? (
          <>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-zinc-600 dark:text-zinc-400">السعر قبل الخصم</dt>
              <dd className="font-semibold text-zinc-900 dark:text-zinc-100">{formatHalalas(ready.quote.listNet)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-zinc-600 dark:text-zinc-400">
                الخصم (<span dir="ltr">{ready.quote.couponCode}</span>)
              </dt>
              <dd className="font-semibold text-emerald-700 dark:text-emerald-400">− {formatHalalas(ready.quote.discount)}</dd>
            </div>
          </>
        ) : null}
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="text-zinc-600 dark:text-zinc-400">المبلغ قبل الضريبة</dt>
          <dd className="font-semibold text-zinc-900 dark:text-zinc-100">{formatHalalas(ready.quote.net)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="text-zinc-600 dark:text-zinc-400">ضريبة القيمة المضافة (١٥٪)</dt>
          <dd className="font-semibold text-zinc-900 dark:text-zinc-100">{formatHalalas(ready.quote.vat)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="font-bold text-zinc-900 dark:text-zinc-100">الإجمالي المستحق</dt>
          <dd className="text-base font-extrabold text-[#0B3D2E] dark:text-[#C8A762]">{formatHalalas(ready.quote.total)}</dd>
        </div>
      </dl>
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{quoteVatNotice(ready.quote.vatMode)}</p>

      {notice ? (
        <p className={NOTICE_CLASS} role="alert">
          {notice}
        </p>
      ) : null}

      {/* The Moyasar form renders into this element and keeps its own light
          styling (black field text), so it sits on an always-light surface in
          both themes: white, dark text, color-scheme light, and the scoped
          .nz-moyasar-surface rules in globals.css that undo the site-wide
          dark input colours inside it. Only this area — the summary above
          follows the theme. */}
      <div
        data-light-surface
        className="nz-moyasar-surface rounded-2xl bg-white p-4 text-zinc-900 shadow-sm ring-1 ring-zinc-200 [color-scheme:light] dark:ring-zinc-700"
        style={{ colorScheme: "light" }}
      >
        <div className="mysr-form" />
      </div>
    </div>
  );
}
