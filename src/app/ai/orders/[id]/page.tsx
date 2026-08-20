"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowRight, DownloadSimple, WhatsappLogo } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getServiceOrder, ORDER_STATUS_AR, type ServiceOrder,
} from "@/lib/services/serviceOrders";
// Reuse the codebase's one real support WhatsApp number (also used by
// src/app/contact/page.tsx and the floating WhatsApp widget) rather than
// inventing a second one for this page. NOT src/lib/betaConfig.ts's
// BETA_WHATSAPP_NUMBER / BetaReviewGate's inline "966XXXXXXXXX" — those are
// explicitly still placeholders ("Update with real number").
import { buildWhatsAppHref } from "@/components/floating/whatsappWorkflow";
import { OrderTimeline } from "./_components/OrderTimeline";
import { OrderSummary } from "./_components/OrderSummary";
import { OrderActions } from "./_components/OrderActions";

type LoadState = "loading" | "error" | "not_found" | "loaded";

// Statuses for which the three-stage progress strip (OrderTimeline) makes
// sense to show at all — every status ServiceOrder["status"] models except
// "cancelled" (a cancelled order never finishes this journey; it gets its
// own panel below, unchanged). The page's fifth, catch-all branch handles
// status values outside this union entirely and never gets a timeline.
const TIMELINE_STATUSES = new Set(["pending_assignment", "assigned", "in_review", "completed"]);

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isDark } = useTheme();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [downloadErr, setDownloadErr] = useState("");
  const [idCopied, setIdCopied] = useState(false);
  const [copyErr, setCopyErr] = useState("");

  const load = () => {
    setState("loading");
    getServiceOrder(id)
      .then((o) => { setOrder(o); setState("loaded"); })
      .catch((e) => {
        // Match on .name rather than `instanceof ServiceOrderNotFoundError`:
        // instanceof against a subclassed built-in (Error) is only reliable
        // once you're certain nothing in the bundling pipeline downlevels
        // classes to ES5 prototypes (which breaks the prototype chain for
        // built-in extends). Matching the name string sidesteps that
        // question entirely, at no cost, so there's nothing to verify later.
        setState(e instanceof Error && e.name === "ServiceOrderNotFoundError" ? "not_found" : "error");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function download() {
    setDownloadErr("");
    try {
      const res = await fetch(`/api/v1/service-requests/${id}/deliverable`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDownloadErr(body.error ?? "تعذّر التحميل");
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      // Transport-level failure (offline, dropped connection, malformed
      // response body) — never leave the button looking dead with no
      // feedback. This is a distinct message from the endpoint's own
      // (deliberately non-distinguishing) 404 body above.
      setDownloadErr("تعذّر التحميل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
  }

  async function copyId() {
    setCopyErr("");
    try {
      // navigator.clipboard throws on insecure origins (plain HTTP,
      // non-localhost) — never let the button look dead with no feedback.
      await navigator.clipboard.writeText(id);
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 2000);
    } catch {
      setCopyErr("تعذّر النسخ تلقائياً — انسخ الرقم يدوياً.");
    }
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";
  const mutedText = isDark ? "text-zinc-400" : "text-zinc-600";

  if (state === "loading") {
    return <div className={`p-7 text-[12px] ${mutedText}`} dir="rtl">جارٍ التحميل...</div>;
  }

  if (state === "error") {
    return (
      <div className="p-7 space-y-3" dir="rtl">
        <p className="text-[12px] text-red-500">تعذّر تحميل الطلب. حاول مرة أخرى.</p>
        <button onClick={load} className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (state === "not_found" || !order) {
    // The server's own GET route conflates "row genuinely doesn't exist"
    // with "any other query error" into the same 404 (it does
    // `if (error || !serviceRequest) return 404`) — so this branch cannot
    // promise the order truly doesn't exist, only that it couldn't be
    // loaded under that id. Never assert non-existence outright; offer a
    // retry, since a transient failure on the server side is indistinguishable
    // from here.
    return (
      <div className="p-7 space-y-3" dir="rtl">
        <p className={`text-[12px] ${mutedText}`}>الطلب غير موجود أو تعذّر الوصول إليه. حاول مرة أخرى.</p>
        <button onClick={load} className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const s = ORDER_STATUS_AR[order.status] ?? ORDER_STATUS_AR.pending_assignment;
  const deliverable = order.metadata?.deliverable;
  const supportHref = buildWhatsAppHref(
    `مرحباً فريق نظامي، أحتاج مساعدة بخصوص طلبي رقم ${order.id} (${order.metadata?.serviceTitleAr ?? order.title}).`,
  );

  return (
    <div className="p-5 md:p-7 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="space-y-1.5">
        {/* Task 6, Step 1 — a reference the client can quote. The order id
            is already the primary key (service_requests.id); this doesn't
            invent a second, parallel numbering scheme. */}
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-mono ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>#{order.id}</span>
          <button onClick={copyId} className="text-[11px] font-semibold text-[#0B3D2E]">
            {idCopied ? "تم النسخ ✓" : "نسخ رقم الطلب"}
          </button>
        </div>
        {copyErr && <p className="text-[10px] text-red-500">{copyErr}</p>}

        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{order.title}</h1>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {order.metadata?.serviceTitleAr} · الحالة: {s.label}
        </p>
      </div>

      {/* Task 6, Step 2 — progress strip + (on open orders only) the
          owner-ruled delivery-time card. Not shown for "cancelled" (its own
          panel below covers that) or for any status outside the five this
          page knows about (the catch-all branch at the bottom). */}
      {TIMELINE_STATUSES.has(order.status) && (
        <div className={`${card} p-5`}>
          <OrderTimeline status={order.status} isDark={isDark} />
        </div>
      )}

      {order.status === "completed" && deliverable ? (
        <div className={`${card} p-5 space-y-3`}>
          <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>المستند جاهز</p>
          {deliverable.notes && (
            <p className={`text-[12px] leading-[1.9] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{deliverable.notes}</p>
          )}
          <button onClick={download} className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white">
            <DownloadSimple size={14} /> تحميل {deliverable.fileName}
          </button>
          {downloadErr && <p className="text-[11px] text-red-500">{downloadErr}</p>}
        </div>
      ) : order.status === "completed" ? (
        // Reachable: the status flip to "completed" and the metadata.deliverable
        // write aren't guaranteed atomic upstream, so a completed order can
        // momentarily (or permanently, if that write failed) have no
        // deliverable attached yet. Never render a blank panel here.
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            طلبك جاهز لكن تعذّر تحميل بيانات المستند. حاول تحديث الصفحة أو تواصل مع الدعم.
          </p>
        </div>
      ) : order.status === "cancelled" ? (
        <div className={`${card} p-5`}>
          <p className="text-[12px] text-red-500">تم إلغاء الطلب.</p>
        </div>
      ) : order.status === "pending_assignment" || order.status === "assigned" || order.status === "in_review" ? (
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            طلبك قيد التنفيذ لدى فريق نظامي. سيصلك إشعار فور جهوزية المستند.
          </p>
        </div>
      ) : (
        // Catch-all: any status value outside the five this page knows about
        // (e.g. "draft"/"pending_payment", which CREATE_STATUS_ALLOWLIST on
        // the service-requests route admits but ServiceOrder["status"] does
        // not model) falls here instead of rendering a blank panel below the
        // header. Type-level exhaustiveness on ORDER_STATUS_AR does not
        // reach this render, so this branch is the runtime backstop.
        <div className={`${card} p-5`}>
          <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
            حالة الطلب غير معروفة حالياً. حاول تحديث الصفحة أو تواصل مع الدعم.
          </p>
        </div>
      )}

      {/* Task 6, Step 3 — what the client actually sent: intake answers
          rendered generically (differs per service) plus their own
          attachments with working download links. Shown regardless of
          status — it's a record of what was submitted, not a status
          indicator, so it stays visible on delivered/cancelled orders too. */}
      <OrderSummary order={order} isDark={isDark} />

      {/* Task 6, Step 4 — always-available actions, plus Task 7's cancel
          control (self-guarded: renders nothing once the order is no
          longer cancellable). */}
      <div className={`${card} p-5 flex flex-wrap items-center gap-3`}>
        <Link
          href="/ai/orders"
          className={`flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}
        >
          <ArrowRight size={14} /> رجوع إلى طلباتي
        </Link>
        <a
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600"
        >
          <WhatsappLogo size={14} weight="fill" /> تواصل مع الدعم
        </a>
        <OrderActions order={order} isDark={isDark} onCancelled={load} />
      </div>
    </div>
  );
}
