"use client";

import { useEffect, useState, useCallback } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { uploadDocumentFile } from "@/lib/services/documentService";
import type { OrderAttachment } from "@/lib/services/orderIntake";
import { validateUploadFile } from "@/lib/services/fileValidation";
import { buildOrderPrompt } from "@/lib/services/orderPrompt";
import { uploadErrorMessage } from "./_errorCopy";

interface AdminOrder {
  id: string; title: string; description: string; status: string;
  created_at: string; metadata: Record<string, unknown>;
  profile: { display_name?: string; email?: string; phone?: string; user_type?: string } | null;
  // Task 7 — the latest `notification.whatsapp_*` event n8n reported back for
  // this ORDER (see GET /api/v1/admin/service-orders), or null when nothing
  // ever reported back. `status` is the raw suffix n8n sent: sent | failed |
  // read (the callback route rejects anything else).
  //
  // It says nothing about WHICH outbound message it answers: the callback body
  // (src/app/api/v1/n8n/callback/route.ts:25) carries only orderId/channel/
  // status, and `request_events` has no metadata column to hold more. Every
  // order also gets an intake dispatch at creation
  // (`service_request.created` → /new-request, src/app/api/v1/service-requests/
  // route.ts), so the latest row here is very often the confirmation of the
  // INTAKE message, not the delivery one. Never attribute it to a specific
  // message without comparing its timestamp — see whatsappNoticeState().
  whatsappNotice: { status: string; at: string } | null;
}

const STATUSES = [
  { key: "", label: "الكل" },
  { key: "pending_assignment", label: "جديدة" },
  { key: "in_review", label: "قيد التنفيذ" },
  { key: "completed", label: "مُسلّمة" },
  { key: "cancelled", label: "ملغاة" },
];

// Task 5 — account-type badge, keyed by profiles.user_type. Every key here
// matches a value in the CHECK constraint at
// supabase/migrations/20260603_phase1_001_profiles.sql:32 except `provider`
// and `admin`, deliberately left unmapped: `provider` has no distinct
// Arabic label in this queue's context yet, and an order's requester is
// never an admin account. An unmapped user_type simply renders no badge —
// see the `ACCOUNT_BADGE[...]` guard below — never an empty grey pill.
const ACCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  lawyer:     { label: "محامٍ",        cls: "bg-emerald-500/10 text-emerald-500" },
  firm:       { label: "مكتب محاماة",  cls: "bg-emerald-500/10 text-emerald-500" },
  individual: { label: "عميل فرد",     cls: "bg-sky-500/10 text-sky-500" },
  corporate:  { label: "منشأة تجارية", cls: "bg-amber-500/10 text-amber-600" },
  micro:      { label: "منشأة صغيرة",  cls: "bg-amber-500/10 text-amber-600" },
  government: { label: "جهة حكومية",   cls: "bg-violet-500/10 text-violet-500" },
  ngo:        { label: "جهة غير ربحية", cls: "bg-violet-500/10 text-violet-500" },
};

const SERVICE_BADGE: Record<string, string> = {
  draft: "الصائغ", contracts: "العقود", wargaming: "المحاكاة", legal_opinion: "الرأي الفصل",
};

/**
 * Task 7 (owner س١١) — the ISO instant the deliverable was written, i.e. the
 * moment the ONLY client notice an admin action ever dispatches was triggered
 * (`metadata.deliverable.deliveredAt`, written at
 * src/app/api/v1/admin/service-orders/[id]/route.ts on the deliver branch).
 *
 * A `typeof === "string"` guard is safe HERE — unlike the attachments.id case
 * further down this file, where a bigserial arriving as a JSON number would
 * silently drop a control. This value is only ever the ISO string that route
 * writes, and anything unexpected falls back to "", which forces the
 * no-claim state below. Understating is the safe direction; there is no
 * control to lose.
 */
function deliveredAtOf(order: AdminOrder): string {
  const deliverable = (order.metadata?.deliverable ?? null) as { deliveredAt?: unknown } | null;
  return typeof deliverable?.deliveredAt === "string" ? deliverable.deliveredAt : "";
}

function formatNoticeAt(at: string): string {
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleString("ar-SA");
}

/**
 * Task 7 (owner س١١) — the honest states of the client's WhatsApp notice **for
 * the delivery message, and only that message**.
 *
 * The ONLY evidence this app ever has is the n8n callback
 * (`src/app/api/v1/n8n/callback/route.ts`) writing a
 * `notification.whatsapp_<status>` row into `request_events`. There is no
 * delivery receipt anywhere else in the system.
 *
 * That callback cannot say which outbound message it answers — its body is
 * orderId/channel/status and `request_events` has no metadata column — while
 * EVERY order already got an earlier dispatch at intake
 * (`service_request.created` → /new-request). So "the newest
 * notification.whatsapp_sent for this order" is NOT evidence that the delivery
 * notice landed: on the ordinary timeline (order created 10:00, intake
 * callback lands, admin delivers 14:00, the /request-completed callback never
 * arrives) it is the intake confirmation, four hours stale. Rendering it as a
 * green ✓ under a delivered order claims the client was told the document is
 * ready when the client may have heard nothing about it. Hence `deliveredAt`:
 * only a callback that POSTDATES the deliverable can be about it. Clock skew
 * between the app server and Postgres can only push a genuine confirmation
 * into the no-claim state, never the reverse.
 *
 * The no-claim state is the important one and is deliberately NOT dressed up
 * as success. No callback can mean `N8N_WEBHOOK_SECRET` is unset (the callback
 * fails closed and 401s every call — which is the state on the server today),
 * or `N8N_WEBHOOK_BASE_URL` is unset (no outbound call is made at all), or n8n
 * is down, or the workflow never ran, or its 5s webhook timeout fired. In
 * every one of those cases the client may have received nothing, so the copy
 * must claim nothing — and the hint must say which of those it is looking at
 * rather than asserting "nothing arrived" over the top of a stale row that
 * did.
 *
 * `read` collapses into the same copy as `sent`: a read receipt entails the
 * message was sent, so «تم إرسال إشعار الواتساب» is true for it, and inventing
 * a stronger "the client opened it" claim would outrun what a WhatsApp read
 * receipt actually proves. Any other suffix (nothing can write one today —
 * the callback route's VALID_STATUSES is sent | failed | read) falls through
 * to the no-claim state on purpose: understating is the safe direction.
 */
function whatsappNoticeState(
  notice: AdminOrder["whatsappNotice"],
  deliveredAt: string,
): { label: string; hint: string; tone: "ok" | "failed" | "unknown"; at: string } {
  const UNKNOWN_LABEL = "لم يصل تأكيد الإرسال بعد";
  const unknown = (hint: string) => ({ label: UNKNOWN_LABEL, hint, tone: "unknown" as const, at: "" });

  // (a) nothing ever reported back. «بعد» on its own reads as "it will arrive
  // shortly"; it might never arrive, so say what the absence actually means.
  if (!notice) {
    return unknown(
      "لم يصل من n8n أي تأكيد لهذا الطلب — قد لا يكون إشعار التسليم قد أُرسل أصلًا، وقد لا يكون العميل قد استلم شيئًا.",
    );
  }

  // (b) a status this panel cannot interpret. Unreachable today (the callback
  // route only writes sent | failed | read) and kept as the safe fallback.
  if (notice.status !== "sent" && notice.status !== "read" && notice.status !== "failed") {
    return unknown(
      "وصل تأكيد من n8n لهذا الطلب بحالة غير معروفة لهذه اللوحة، فلا يمكن اعتباره تأكيدًا لوصول إشعار التسليم.",
    );
  }

  const noticeMs = Date.parse(notice.at);
  const deliveredMs = Date.parse(deliveredAt);

  // (c) one of the two instants is missing or unparseable, so the confirmation
  // cannot be placed before or after the delivery.
  if (Number.isNaN(noticeMs) || Number.isNaN(deliveredMs)) {
    return unknown(
      "وصل تأكيد من n8n لهذا الطلب لكن تعذّر مقارنة وقته بوقت التسليم، فلا يمكن اعتباره تأكيدًا لوصول إشعار التسليم.",
    );
  }

  // (d) the confirmation predates the deliverable — it answers an earlier
  // message (the intake notice), never the delivery one.
  if (noticeMs < deliveredMs) {
    return unknown(
      `آخر تأكيد من n8n لهذا الطلب مؤرَّخ ${formatNoticeAt(notice.at)}، أي قبل تسليم المستند، فهو يخصّ إشعارًا سابقًا لا إشعار التسليم. لم يصل أي تأكيد بعد التسليم.`,
    );
  }

  // The confirmation postdates the deliverable: it is about the delivery notice.
  return notice.status === "failed"
    ? { label: "⚠️ تعذّر إرسال إشعار الواتساب", hint: "", tone: "failed", at: notice.at }
    : { label: "📱 تم إرسال إشعار الواتساب ✓", hint: "", tone: "ok", at: notice.at };
}

function WhatsappNoticeBox(
  { notice, deliveredAt, isDark }:
  { notice: AdminOrder["whatsappNotice"]; deliveredAt: string; isDark: boolean },
) {
  const { label, hint, tone, at } = whatsappNoticeState(notice, deliveredAt);
  // The unknown state is neutral zinc, never green: it must not read as a
  // successful send at a glance.
  const cls =
    tone === "ok"
      ? isDark ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-emerald-600/20 bg-emerald-50 text-emerald-700"
      : tone === "failed"
        ? isDark ? "border-red-500/25 bg-red-500/10 text-red-400" : "border-red-500/20 bg-red-50 text-red-600"
        : isDark ? "border-white/10 bg-white/[0.03] text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      {/* Names which message the box is about, so the label underneath cannot
          be read as "the client was told something at some point". It states
          what is being reported on, not that anything was sent. */}
      <p className="text-[10px] font-semibold opacity-70">حالة إشعار الواتساب الخاص بتسليم المستند</p>
      <p className="mt-1 text-[11px] font-bold">{label}</p>
      {hint && <p className="mt-1 text-[10px] leading-[1.8] opacity-80">{hint}</p>}
      {/* Only ever the timestamp of a confirmation that actually answers the
          delivery notice — `at` is "" in every no-claim state, so a stale
          intake confirmation never prints a date under «لم يصل تأكيد الإرسال
          بعد», where it would read as the time that non-event happened. */}
      {at && <p className="mt-1 text-[10px] opacity-70">{formatNoticeAt(at)}</p>}
    </div>
  );
}

export default function AdminServiceOrdersPage() {
  const { isDark } = useTheme();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<AdminOrder | null>(null);
  const [notes, setNotes] = useState("");
  // Task 3 — a second, private note for the team, never sent to the client.
  // Page-level state shared by every order card, same reset discipline as
  // `notes`: leftover text from order A must never survive into order B.
  const [internalNotes, setInternalNotes] = useState("");
  // Task 2 — the file an admin picked in the browser dialog, held here until
  // اعتماد وتسليم المستند للعميل is pressed. Page-level state shared by every
  // order card, exactly like `notes` below: a file staged on order A must
  // never survive into order B, so it is reset everywhere `notes` is reset.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  // Deliberate deviation from the brief's literal load(): the original has
  // no error path, so a 403/500/dropped connection leaves `orders` at its
  // previous value (or `[]`) and the page renders "لا توجد طلبات." — visually
  // identical to a genuinely empty queue. This is the one screen whose whole
  // job is telling a human what work exists, so a silent failure here is
  // worse than elsewhere. Mirrors the loading/error split already
  // established in src/app/ai/orders/[id]/page.tsx.
  const load = useCallback(async () => {
    setLoadErr("");
    try {
      const res = await fetch(`/api/v1/admin/service-orders${filter ? `?status=${filter}` : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadErr(body.error ?? "تعذّر تحميل الطلبات");
        return;
      }
      const body = await res.json();
      setOrders(body.data ?? []);
    } catch {
      setLoadErr("تعذّر تحميل الطلبات. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, payload: Record<string, unknown>, opts: { keepOpen?: boolean } = {}) {
    setBusy(true); setErr("");
    // Deliberate deviation from the brief's literal act(): the original
    // fetch is unguarded, so a dropped connection throws out of an
    // onClick handler with no catch anywhere in the call chain — busy
    // stays true forever and claim/cancel look permanently disabled with
    // no error shown. try/finally guarantees setBusy(false) always runs.
    try {
      const res = await fetch(`/api/v1/admin/service-orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "فشل الإجراء");
      else {
        // Claim starts work on an order; deliver and cancel finish it. Only the
        // finishing actions should collapse the panel — closing it on claim
        // hides the upload field the admin pressed استلام to reach.
        if (!opts.keepOpen) { setOpen(null); setNotes(""); setInternalNotes(""); setPendingFile(null); }
        await load();
      }
    } catch {
      setErr("تعذّر تنفيذ الإجراء. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function deliver(order: AdminOrder, file: File) {
    setBusy(true); setErr("");
    try {
      const doc = await uploadDocumentFile(file, { requestId: order.id });
      await act(order.id, { action: "deliver", documentId: doc.id, fileName: doc.file_name, notes, internalNotes });
    } catch (e) {
      // Fix (review finding IMPORTANT 3): uploadDocumentFile can throw raw,
      // untranslated causes — see _errorCopy.ts for the full trace and the
      // covering tests. Never render e.message verbatim.
      setErr(uploadErrorMessage(e));
      setBusy(false);
    }
  }

  // Task 9b — click-to-fetch-then-open, same pattern as
  // src/app/ai/orders/[id]/page.tsx's download(): never prefetch, never
  // cache the signed URL (it expires in 300s), fetch fresh on every click.
  async function downloadAttachment(orderId: string, attachmentId: string) {
    setErr("");
    try {
      const res = await fetch(
        `/api/v1/service-requests/${orderId}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error ?? "تعذّر التحميل");
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      setErr("تعذّر التحميل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
  }

  // Task 4 — a copy of buildOrderPrompt(o) the admin can hand to another
  // tool, so the queue itself is not the only place the brief exists.
  function downloadPrompt(o: AdminOrder) {
    const blob = new Blob([buildOrderPrompt(o)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-${o.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // navigator.clipboard is unavailable on insecure origins (plain HTTP,
  // non-localhost) — wrapped so the copy button reports failure in Arabic
  // instead of looking dead.
  async function copyPrompt(o: AdminOrder) {
    try {
      await navigator.clipboard.writeText(buildOrderPrompt(o));
    } catch {
      setErr("تعذّر نسخ الملخص. حاول تنزيل الملف بدلاً من ذلك.");
    }
  }

  // Fix (review finding IMPORTANT 1): `notes` is a single page-level state
  // shared by every order card's deliver/cancel form. Without this reset, an
  // admin who drafts a note for order A and then opens order B without
  // submitting would have A's leftover text sent as B's delivery notes or
  // cancellation reason. Clearing it on every open/close transition — not
  // just on successful submit (act() already does that) — closes that gap.
  function toggleOpen(o: AdminOrder) {
    setOpen(open?.id === o.id ? null : o);
    setNotes("");
    setInternalNotes("");
    setPendingFile(null);
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلبات الخدمات</h1>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
              filter === s.key ? "bg-[#0B3D2E] text-white border-transparent"
                : isDark ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {err && <p className="text-[12px] text-red-500">{err}</p>}

      {loadErr && (
        <div className={`${card} p-5 flex items-center justify-between gap-3`}>
          <p className="text-[12px] text-red-500">{loadErr}</p>
          <button onClick={() => load()}
            className="shrink-0 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white">
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className={`${card} p-4`}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                  {/* Task 5 — account-type and service badges. An unmapped
                      user_type (e.g. `provider`, `admin`) or service key
                      renders nothing here rather than an empty grey pill. */}
                  {o.profile?.user_type && ACCOUNT_BADGE[o.profile.user_type] && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${ACCOUNT_BADGE[o.profile.user_type].cls}`}>
                      {ACCOUNT_BADGE[o.profile.user_type].label}
                    </span>
                  )}
                  {SERVICE_BADGE[(o.metadata?.service as string) ?? ""] && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                      isDark ? "bg-white/5 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>
                      {SERVICE_BADGE[(o.metadata?.service as string) ?? ""]}
                    </span>
                  )}
                </div>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {o.profile?.display_name ?? "—"} · {o.profile?.phone ?? "لا يوجد جوال"} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
                </p>
              </div>
              <button onClick={() => toggleOpen(o)}
                className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                {open?.id === o.id ? "إغلاق" : "التفاصيل"}
              </button>
            </div>

            {open?.id === o.id && (
              <div className="mt-4 space-y-3 border-t pt-4 border-white/[0.06]">
                <div className="flex gap-2">
                  <button onClick={() => copyPrompt(o)}
                    className="rounded-xl border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-500">
                    نسخ ملخص الطلب
                  </button>
                  <button onClick={() => downloadPrompt(o)}
                    className={`rounded-xl border px-3 py-1.5 text-[11px] font-bold ${
                      isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
                    تنزيل ملف .md
                  </button>
                </div>

                {/* Task 7 (owner س١١) — did the WhatsApp notice actually reach
                    the client? Delivered orders ONLY, because deliver is the
                    only admin action that dispatches anything to n8n: PATCH
                    /api/v1/admin/service-orders/[id] sends
                    `service_request.completed` on deliver, but sends
                    `service_request.status_changed` on both claim and cancel,
                    and resolvePath() in src/lib/n8n/dispatch.ts returns null
                    for status `in_review` and for `cancelled` — no webhook is
                    fired, nothing is sent to the client's WhatsApp, so there
                    is nothing to report. (The plan assumed cancel dispatched
                    too; the code says it does not. The client IS still told
                    in-app: recordNotification «تم إلغاء طلبك».)

                    An earlier version also rendered this on ANY order carrying
                    a callback, meaning to avoid hiding evidence. It hid
                    nothing but asserted plenty: the only callback a cancelled
                    or in_review order can carry is the one answering the
                    INTAKE dispatch every order gets at creation, and this
                    panel's label does not name that message — so a cancelled
                    order wore a green «تم إرسال إشعار الواتساب ✓» reading as
                    "we told the client we cancelled", which nothing did.

                    Placed above the prompt block, which can run long — this is
                    the line that must not be scrolled past. */}
                {o.status === "completed" && (
                  <WhatsappNoticeBox
                    notice={o.whatsappNotice ?? null}
                    deliveredAt={deliveredAtOf(o)}
                    isDark={isDark}
                  />
                )}

                <pre className={`text-[11px] leading-[1.9] whitespace-pre-wrap p-3 rounded-xl overflow-x-auto ${
                  isDark ? "bg-zinc-950 text-zinc-400" : "bg-slate-50 text-slate-600"}`}>
                  {buildOrderPrompt(o)}
                </pre>

                {Array.isArray(o.metadata?.attachments) && (o.metadata.attachments as OrderAttachment[]).length > 0 && (
                  <div className="space-y-1.5">
                    <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      مرفقات العميل
                    </p>
                    <div className="flex flex-col gap-1">
                      {/* documentId is typed `string` (OrderAttachment) but that's a
                          TS-level promise, not a runtime one: attachments.id is a
                          Postgres bigserial, and PostgREST serialises int8 as a JSON
                          number — POST /api/v1/documents returns it uncast, so it may
                          arrive as a number despite its declared type. Accept both and
                          coerce with String(...) rather than type-guarding on "string"
                          alone, or a numeric id silently drops every download button. */}
                      {(o.metadata.attachments as OrderAttachment[])
                        .filter((a) => a && (typeof a.documentId === "string" || typeof a.documentId === "number"))
                        .map((a) => {
                          const documentId = String(a.documentId);
                          return (
                            <button key={documentId} disabled={busy}
                              onClick={() => downloadAttachment(o.id, documentId)}
                              className={`flex items-center gap-2 text-[12px] font-semibold disabled:opacity-40 ${
                                isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                              <DownloadSimple size={13} />
                              {a.name || "مرفق"} {a.size ? `(${Math.max(1, Math.round(a.size / 1024))} كيلوبايت)` : ""}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {o.status === "pending_assignment" && (
                  <button disabled={busy} onClick={() => act(o.id, { action: "claim" }, { keepOpen: true })}
                    className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                    استلام
                  </button>
                )}

                {o.status === "in_review" && (
                  <div className="space-y-2">
                    {/* Fix (review finding IMPORTANT 2): the backend's claim
                        action is an intentional takeover — it re-assigns an
                        in_review order to whoever calls it, specifically so an
                        order stuck with an AWOL admin can be unstuck (see the
                        PATCH handler's own comment). Without this control, a
                        second admin who opens an in_review order they aren't
                        assigned to has no way to become the assignee, so their
                        upload silently 403s at POST /api/v1/documents. */}
                    <button disabled={busy} onClick={() => act(o.id, { action: "claim" }, { keepOpen: true })}
                      className="rounded-xl border border-emerald-500/30 px-4 py-2 text-[12px] font-bold text-emerald-500 disabled:opacity-40">
                      تولّي الطلب (نقل لي)
                    </button>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      placeholder="ملاحظات تظهر للعميل مع المستند (اختياري)"
                      className={`w-full rounded-xl p-2.5 text-[12px] border ${
                        isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200"}`} />
                    <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2}
                      placeholder="ملاحظة داخلية للفريق — لا يراها العميل (اختياري)"
                      className={`w-full rounded-xl p-2.5 text-[12px] border ${
                        isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200"}`} />
                    <input type="file" disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        // Reset the input so a failed upload can be retried by
                        // re-picking the exact same file — without this, the
                        // browser suppresses onChange for an unchanged value
                        // and the file picker looks dead after an error.
                        e.target.value = "";
                        const rejection = f ? validateUploadFile(f) : null;
                        if (rejection) { setErr(rejection); setPendingFile(null); return; }
                        setPendingFile(f);
                      }}
                      className={`block text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`} />
                    {pendingFile && (
                      <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                        الملف المختار: <span className="font-semibold">{pendingFile.name}</span>
                        {" "}({Math.max(1, Math.round(pendingFile.size / 1024))} كيلوبايت)
                      </p>
                    )}
                    <button
                      disabled={busy || !pendingFile}
                      onClick={() => { if (pendingFile) deliver(o, pendingFile); }}
                      className="w-full rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-40">
                      اعتماد وتسليم المستند للعميل
                    </button>
                    <button disabled={busy} onClick={() => act(o.id, { action: "cancel", reason: notes, internalNotes })}
                      className="rounded-xl border border-red-500/30 px-4 py-2 text-[12px] font-bold text-red-500 disabled:opacity-40">
                      إلغاء الطلب
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {!loadErr && orders.length === 0 && (
          <div className={`${card} p-8 text-center text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات.</div>
        )}
      </div>
    </div>
  );
}
