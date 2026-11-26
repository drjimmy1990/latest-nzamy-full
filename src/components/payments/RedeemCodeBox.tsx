"use client";

import { useState } from "react";
import Link from "next/link";
import { Ticket } from "@phosphor-icons/react";
import { redeemDoneAr } from "@/lib/payments/freeActivationView";
import { saveRequestCoupon } from "@/lib/payments/manualRequest";

/**
 * RedeemCodeBox — «هل لديك كود خصم أو قسيمة؟» (batch l16, A-59; owner 25 Nov
 * §7.7.3), on the subscription tab and on /dashboard/billing.
 *   - a free-plan or points code is activated at once (POST
 *     /api/v1/coupons/redeem) and links to its free-activation receipt;
 *   - a discount code is recognised: it applies at checkout, and while
 *     online payment is off it is kept for this tab (saveRequestCoupon) so
 *     the next activation request from a plan card carries it;
 *   - every refusal shows the server's sentence as it is.
 * Nothing here is charged.
 */
type Result = { ok: boolean; msg: string; receiptHref?: string };

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function RedeemCodeBox({ className = "" }: { className?: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        kind?: string;
        code?: string;
        note?: string;
        points?: number;
        labelAr?: string;
        billing?: string;
        receiptNumber?: string;
        redemptionId?: string;
      };
      if (!res.ok) {
        setResult({ ok: false, msg: body.error ?? "تعذّر تفعيل الكود، حاول مرة أخرى بعد قليل" });
      } else if (body.kind === "discount") {
        saveRequestCoupon(sessionStore(), body.code);
        setResult({ ok: true, msg: body.note ?? "كود خصم صالح للشراء." });
      } else {
        setResult({
          ok: true,
          msg: redeemDoneAr({ kind: body.kind ?? "", points: body.points, labelAr: body.labelAr, billing: body.billing, receiptNumber: body.receiptNumber }),
          receiptHref: body.redemptionId ? `/dashboard/billing/activation/${body.redemptionId}` : undefined,
        });
        setCode("");
      }
    } catch {
      setResult({ ok: false, msg: "تعذّر الاتصال بالخادم" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="تفعيل كود"
      className={`rounded-[2rem] border border-slate-200/50 bg-white/80 px-6 py-6 dark:border-white/[0.06] dark:bg-[#161b22]/80 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/10 dark:text-[#C8A762]">
          <Ticket size={20} weight="fill" />
        </div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">هل لديك كود خصم أو قسيمة؟</h3>
      </div>
      <p className="mt-2 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
        قسيمة الباقة المجانية أو النقاط تُفعَّل هنا فوراً ويصدر لها إيصال تفعيل مجاني. وكود الخصم يُطبَّق عند الدفع.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="redeem-code" className="sr-only">
          الكود
        </label>
        <input
          id="redeem-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={40}
          autoComplete="off"
          dir="ltr"
          placeholder="CODE"
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 font-mono text-sm uppercase text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-[#C8A762] dark:text-[#0B3D2E]"
        >
          {busy ? "جارٍ التحقق…" : "تفعيل الكود"}
        </button>
      </form>
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-3 text-sm font-semibold ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
        >
          {result.msg}
          {result.receiptHref ? (
            <>
              {" "}
              <Link href={result.receiptHref} className="underline">
                عرض الإيصال
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
