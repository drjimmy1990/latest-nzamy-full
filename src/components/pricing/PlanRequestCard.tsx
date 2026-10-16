"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { requestEntitlement } from "@/lib/services/entitlementService";
import { planEntitlementRequest } from "@/lib/pricing/planRequest";

// Shared by the last step of the e-mail sign-up (/register/client Step4) and
// the last step of the onboarding wizard, which a Google sign-up reaches
// instead (the plan travels there through src/lib/pricing/pendingPlan.ts).
//
// The plan the visitor clicked «اشترك» on before signing up (/pricing →
// /register/client?plan=<Plan.id>). There is no payment gateway: a plan is an
// entitlement request the admin reviews — the same request PricingCards sends
// for a signed-in user. It is sent only when the user presses the button here.
export default function PlanRequestCard({
  plan,
  canRequestNow,
}: {
  plan: { id: string; name: string };
  canRequestNow: boolean;
}) {
  const [state, setState] = useState<
    { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "failed"; error: string }
  >({ status: "idle" });

  async function send() {
    setState({ status: "sending" });
    const res = await requestEntitlement(planEntitlementRequest(plan));
    setState(res.ok ? { status: "sent" } : { status: "failed", error: res.error ?? "تعذّر إرسال الطلب" });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-royal bg-royal/5 p-4 text-start dark:bg-royal/20"
    >
      <div className="text-sm font-bold text-royal dark:text-gold">طلب الاشتراك في «{plan.name}»</div>
      {!canRequestNow ? (
        // signUp returned no session (email confirmation): a request now
        // would be refused, so say how to finish instead.
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
          أكّد بريدك الإلكتروني ثم سجّل الدخول، واطلب الباقة من{" "}
          <a href="/pricing" className="font-semibold text-royal underline dark:text-gold">صفحة الأسعار</a>
          {" "}— يُفعَّل الاشتراك بعد مراجعة الطلب.
        </p>
      ) : state.status === "sent" ? (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
          تم إرسال طلبك للمراجعة، ويُفعَّل الاشتراك بعد الموافقة عليه.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
            لا يتم الدفع عبر المنصة: يُرسَل طلبك للمراجعة ويُفعَّل الاشتراك بعد الموافقة عليه.
          </p>
          {state.status === "failed" && (
            <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{state.error}</p>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={state.status === "sending"}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-royal px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-royal-light disabled:opacity-50"
          >
            {state.status === "sending" ? "جارٍ الإرسال…" : state.status === "failed" ? "أعد المحاولة" : "أرسل طلب الاشتراك"}
            <ArrowLeft size={14} />
          </button>
        </>
      )}
    </motion.div>
  );
}
