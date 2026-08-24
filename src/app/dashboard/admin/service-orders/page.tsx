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
  // Task 7 — the latest `notification.whatsapp_*` event recorded for this
  // ORDER (see GET /api/v1/admin/service-orders), or null when nothing was
  // ever recorded. `status` is the raw suffix off the event name.
  //
  // Two different writers land in this one namespace, and the list route
  // returns whichever is newest without distinguishing them (its own doc
  // predates the second writer and still describes only the first):
  //   - n8n, through the callback route — sent | failed | read. A RECEIPT:
  //     evidence about the message itself.
  //   - this app, through the admin PATCH route — the DISPATCH_* suffixes
  //     below. An ATTEMPT: evidence about whether we managed to hand the
  //     message to n8n at all, which is the one thing a receipt can never
  //     tell us. Written only on the deliver/resend paths.
  // whatsappNoticeState() below is where the two are told apart.
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

/**
 * The three `notification.whatsapp_*` suffixes THIS APP writes, as opposed to
 * the sent | failed | read that n8n reports back. Mirrors the constants in
 * src/app/api/v1/admin/service-orders/[id]/route.ts, which is the only writer
 * — change one, change the other. They are deliberately in the same namespace
 * n8n's receipts use, because the list route surfaces exactly one «latest
 * whatsapp event» per order and the newest fact about the notice is the one
 * worth showing, whichever side produced it.
 */
const DISPATCH_OK = "dispatched";
const DISPATCH_FAILED = "dispatch_failed";
const DISPATCH_NOT_CONFIGURED = "not_configured";

// `draft` and `pending_payment` are not decoration: both are reachable states
// for an ai_workspace order. `pending_payment` is what the client consultation
// flow writes on the AI path, and `draft` is accepted verbatim by the POST
// allow-list — the full producer audit is in
// src/lib/services/orderTransitions.ts:24-40. Until they had chips of their
// own an admin could only reach them through «الكل», mixed in with every
// delivered and cancelled order. Ordered by the lifecycle, not alphabetically.
const STATUSES = [
  { key: "", label: "الكل" },
  { key: "draft", label: "مسودة" },
  { key: "pending_payment", label: "بانتظار السداد" },
  { key: "pending_assignment", label: "جديدة" },
  { key: "in_review", label: "قيد التنفيذ" },
  { key: "completed", label: "مُسلّمة" },
  { key: "cancelled", label: "ملغاة" },
];

// Task 5 — account-type badge, keyed by profiles.user_type. Every key here
// matches a value in the CHECK constraint at
// supabase/migrations/20260603_phase1_001_profiles.sql:32-35. `admin` is the
// only value of that constraint left unmapped, deliberately: nothing in the
// schema stops an account with user_type 'admin' from placing an order, but
// this queue has no reason to name that case, and an unmapped user_type
// simply renders no badge — see the `ACCOUNT_BADGE[...]` guard below — never
// an empty grey pill.
//
// `provider` (owner س٦: «شارة ملونة وموحدة لـ provider — 🟣 مزوّد خدمة») is
// fuchsia rather than violet or purple. violet-500 is already spent on TWO
// types, government and ngo, and Tailwind's purple-500 sits close enough to
// violet-500 that a provider would read at a glance as a third
// government-ish account. fuchsia-500 stays inside the 🟣 family the owner
// asked for and is plainly distinguishable from both.
const ACCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  lawyer:     { label: "محامٍ",        cls: "bg-emerald-500/10 text-emerald-500" },
  firm:       { label: "مكتب محاماة",  cls: "bg-emerald-500/10 text-emerald-500" },
  individual: { label: "عميل فرد",     cls: "bg-sky-500/10 text-sky-500" },
  corporate:  { label: "منشأة تجارية", cls: "bg-amber-500/10 text-amber-600" },
  micro:      { label: "منشأة صغيرة",  cls: "bg-amber-500/10 text-amber-600" },
  provider:   { label: "مزوّد خدمة",   cls: "bg-fuchsia-500/10 text-fuchsia-500" },
  government: { label: "جهة حكومية",   cls: "bg-violet-500/10 text-violet-500" },
  ngo:        { label: "جهة غير ربحية", cls: "bg-violet-500/10 text-violet-500" },
};

const SERVICE_BADGE: Record<string, string> = {
  draft: "الصائغ", contracts: "العقود", wargaming: "المحاكاة", legal_opinion: "الرأي الفصل",
};

/**
 * Task 5 (owner س٥) — is this one attachment the «المذكرة المراد نقضها», as
 * opposed to an ordinary case file?
 *
 * The only evidence is `metadata.intake.memoAttachmentIds`: the documentIds
 * the client tagged through wargaming's memo-specific dropzone, NOT "any file
 * on the order". It is written by buildIntake() in
 * src/app/ai/wargaming/page.tsx:922-923 and normalised by
 * src/lib/services/orderIntake.wargaming.ts:80-81.
 *
 * It is ABSENT — and this returns false for every attachment, so nothing is
 * badged — in three ordinary cases, none of them a fault:
 *   1. every non-wargaming order (draft, contracts, legal_opinion);
 *   2. every wargaming order placed before commit 7b5480b added the control;
 *   3. a wargaming order whose client typed the memo into `memoText` instead
 *      of uploading it — there is genuinely no memo FILE to badge.
 * Badging an unrelated case file would be worse than badging nothing, so the
 * absent case fails closed rather than guessing.
 *
 * String(v) on both sides, never `typeof v === "string"`: these ids trace to
 * attachments.id, a Postgres bigserial that PostgREST serialises as a JSON
 * NUMBER — see documentIdStr() in src/lib/services/orderIntake.ts:78-82 and
 * the test that pins the numeric case at
 * src/lib/services/orderIntake.wargaming.test.ts:88-98. A `typeof` guard here
 * would silently un-badge every real memo while tsc and the suite stayed green.
 *
 * Twin of the identical function in
 * src/app/ai/orders/[id]/_components/OrderSummary.tsx, which shows the same
 * badge to the client. Duplicated on purpose — but note the reason changed:
 * intakeValues.ts is no longer client-page-local (it moved to
 * src/lib/services/intakeValues.ts so this panel's buildOrderPrompt could reach
 * its Arabic labels). It still is not the right home for this: that module maps
 * intake KEYS to labels and stored VALUES to Arabic, whereas this matches an
 * attachment id against a list. Six lines did not justify a third module.
 * Change one, change the other.
 */
function isMemoAttachment(intake: Record<string, unknown> | undefined, documentId: string): boolean {
  if (!documentId) return false;
  const raw = intake?.memoAttachmentIds;
  if (!Array.isArray(raw)) return false;
  return raw.some((v) => String(v) === documentId);
}

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

/**
 * Did the admin ask for a WhatsApp notice when they delivered? Written by the
 * deliver branch from the «إرسال إشعار وتسليم المستند للموكل عبر الواتساب»
 * toggle (owner's silent-delivery request).
 *
 * Defaults to TRUE when the key is absent, which covers every order delivered
 * before the toggle existed: those all dispatched. Only an explicit `false`
 * means the admin chose to deliver silently — anything else is read as "a
 * notice was meant to go out", so a malformed value can never invent a
 * suppression that did not happen.
 */
function whatsappNotifiedOf(order: AdminOrder): boolean {
  const deliverable = (order.metadata?.deliverable ?? null) as { whatsappNotified?: unknown } | null;
  return deliverable?.whatsappNotified !== false;
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
 * receipt actually proves. Any other suffix falls through to the no-claim
 * state on purpose: understating is the safe direction.
 *
 * ── What this app now records itself ──────────────────────────────────────
 *
 * Everything above is about a RECEIPT, and a receipt only exists if n8n was
 * reached in the first place. dispatchToN8n() never throws: an unreachable
 * host, a 500, or an unset base URL all return `{ delivered: false }` and the
 * order still goes `completed` with a 200 to the admin. Until the deliver
 * path started recording that boolean, "we never managed to send it" and "n8n
 * has not reported back yet" were the same empty state on this card — the
 * admin saw a delivered order and no reason to look further.
 *
 * So the three DISPATCH_* suffixes are checked FIRST, and only when they
 * postdate the deliverable. They are the newer and more specific fact: they
 * are written by the delivery itself, whereas the newest receipt may still be
 * the intake one from hours earlier. A receipt that arrives afterwards is
 * newer again and wins on its own — the list route hands over whichever event
 * is latest, so a real `sent` callback replaces `dispatched` without any
 * precedence rule needed here.
 *
 * `notified` is the last word only when no dispatch event postdates the
 * delivery, and that ordering is the whole rule: an admin who delivers
 * silently and then presses «إعادة إرسال إشعار الواتساب» leaves the flag at
 * `false` forever, so the flag alone would keep claiming nothing was sent
 * after a resend that plainly was.
 */
function whatsappNoticeState(
  notice: AdminOrder["whatsappNotice"],
  deliveredAt: string,
  notified: boolean,
): { label: string; hint: string; tone: "ok" | "failed" | "unknown"; at: string } {
  const UNKNOWN_LABEL = "لم يصل تأكيد الإرسال بعد";
  const unknown = (hint: string) => ({ label: UNKNOWN_LABEL, hint, tone: "unknown" as const, at: "" });

  const noticeMs = notice ? Date.parse(notice.at) : Number.NaN;
  const deliveredMs = Date.parse(deliveredAt);
  // A dispatch attempt is only about THIS delivery when it postdates it — the
  // same test the receipt branches use further down, for the same reason.
  const attemptIsCurrent =
    !Number.isNaN(noticeMs) && !Number.isNaN(deliveredMs) && noticeMs >= deliveredMs;

  if (notice && attemptIsCurrent) {
    if (notice.status === DISPATCH_FAILED) {
      return {
        label: "⚠️ تعذّر تسليم الإشعار إلى n8n",
        hint: "لم يقبل خادم n8n طلب الإرسال — تعذّر الوصول إليه أو ردّ بخطأ — فلم تُرسل الرسالة إلى العميل أصلًا. أعد المحاولة بزر «إعادة إرسال إشعار الواتساب».",
        tone: "failed",
        at: notice.at,
      };
    }
    if (notice.status === DISPATCH_NOT_CONFIGURED) {
      return {
        label: "قناة الواتساب غير مفعّلة على الخادم",
        hint: "لم يُضبط عنوان n8n على الخادم، فلم يُرسل أي إشعار واتساب لهذا الطلب ولم يُحاول إرساله. المستند مُسلّم في حساب العميل، لكن أبلغ المسؤول التقني لتفعيل القناة.",
        tone: "unknown",
        at: notice.at,
      };
    }
    if (notice.status === DISPATCH_OK) {
      return unknown(
        "استلمت n8n طلب الإرسال بنجاح، لكنها لم تُبلّغ بعد بوصول الرسالة إلى واتساب العميل.",
      );
    }
  }

  // The admin chose to deliver silently and nothing has been dispatched
  // since. Says so plainly instead of borrowing the "no confirmation"
  // wording below, which would report a deliberate choice as a fault.
  if (!notified) {
    return unknown(
      "سُلّم المستند دون إشعار واتساب بناءً على اختيار الإدارة عند التسليم. لإرساله الآن استخدم زر «إعادة إرسال إشعار الواتساب».",
    );
  }

  // (a) nothing ever reported back. «بعد» on its own reads as "it will arrive
  // shortly"; it might never arrive, so say what the absence actually means.
  if (!notice) {
    return unknown(
      "لم يصل من n8n أي تأكيد لهذا الطلب — قد لا يكون إشعار التسليم قد أُرسل أصلًا، وقد لا يكون العميل قد استلم شيئًا.",
    );
  }

  // (b) a status this panel cannot interpret — an n8n suffix outside sent |
  // failed | read, or a dispatch attempt that did NOT postdate the delivery
  // (it belongs to an earlier one).
  if (notice.status !== "sent" && notice.status !== "read" && notice.status !== "failed") {
    return unknown(
      "آخر ما سُجّل لهذا الطلب حالة غير معروفة لهذه اللوحة، فلا يمكن اعتباره تأكيدًا لوصول إشعار التسليم.",
    );
  }

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
  { notice, deliveredAt, notified, isDark, onResend, busy }:
  {
    notice: AdminOrder["whatsappNotice"]; deliveredAt: string; notified: boolean;
    isDark: boolean; onResend: () => void; busy: boolean;
  },
) {
  const { label, hint, tone, at } = whatsappNoticeState(notice, deliveredAt, notified);
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
      {/* The owner's manual retry. Offered in EVERY state, not only the failed
          one: the no-claim states are exactly the ones where nobody can tell
          whether the client heard anything, so that is when an admin most
          needs to be able to send it again. Re-sending a notice that did
          arrive costs the client one duplicate message; leaving them
          uninformed costs them the document. n8n can tell the two messages
          apart by the `notificationKind`/`messageId` this route puts in the
          payload. */}
      <button type="button" disabled={busy} onClick={onResend}
        className={`mt-2 rounded-lg border px-2.5 py-1 text-[10px] font-bold disabled:opacity-40 ${
          isDark ? "border-white/15 text-zinc-300" : "border-zinc-300 text-zinc-600"}`}>
        🔄 إعادة إرسال إشعار الواتساب
      </button>
    </div>
  );
}

/**
 * Keep the order whose panel is open in the list even when the refetch that
 * follows an action no longer returns it.
 *
 * This is what made «استلام» look broken on the «جديدة» tab. load() fetches
 * `?status=<chip>`, the list route turns that into `.eq("status", …)`, and a
 * claim moves the row to `in_review` — so the claimed order stops matching the
 * very filter that was showing it. Nothing about the panel state was wrong:
 * the card it lived inside vanished from `orders.map`, taking the upload field
 * the admin pressed استلام to reach with it. Keeping `keepOpen` on the panel
 * could not survive a card that no longer renders.
 *
 * `kept` carries the row as the PATCH handler returned it, so the panel
 * re-renders in its NEW status (the deliver form) rather than the pre-claim
 * snapshot. Slotted back in by `created_at` — the list route's own sort key —
 * instead of prepended, so the card does not jump to the top of the queue
 * under the admin's cursor mid-action.
 */
function mergeKeptOrder(next: AdminOrder[], kept: AdminOrder | null): AdminOrder[] {
  if (!kept || next.some((o) => o.id === kept.id)) return next;
  const keptMs = Date.parse(kept.created_at);
  const at = next.findIndex((o) => Date.parse(o.created_at) < keptMs);
  const merged = [...next];
  merged.splice(at === -1 ? merged.length : at, 0, kept);
  return merged;
}

/**
 * Does this order match what support typed in the search box? An order number
 * quoted over WhatsApp is the whole reason the box exists, so `id` is matched
 * as a substring: the client is reading a UUID aloud and will very often hand
 * over only its first block.
 *
 * Client-side over the loaded page, NOT a query param: the list route belongs
 * to another change and takes no search argument. That caps the reach at the
 * 200 rows it returns — enough for the queue as it stands, and the status
 * chips narrow it further before this ever runs.
 */
function matchesSearch(o: AdminOrder, needle: string): boolean {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    o.id.toLowerCase().includes(q) ||
    (o.profile?.display_name ?? "").toLowerCase().includes(q) ||
    (o.title ?? "").toLowerCase().includes(q)
  );
}

export default function AdminServiceOrdersPage() {
  const { isDark } = useTheme();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
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
  // The owner's silent-delivery control. ON by default — notifying the client
  // is the ordinary case and the admin has to opt out of it deliberately —
  // and reset to ON with every other per-order field below, so an admin who
  // silenced order A never silences order B by accident.
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [dragActive, setDragActive] = useState(false);
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
  const load = useCallback(async (kept: AdminOrder | null = null) => {
    setLoadErr("");
    try {
      const res = await fetch(`/api/v1/admin/service-orders${filter ? `?status=${filter}` : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadErr(body.error ?? "تعذّر تحميل الطلبات");
        return;
      }
      const body = await res.json();
      // `kept` is only ever passed by act() for the order whose panel must
      // stay open; the chips themselves are untouched, so a plain refetch
      // still shows exactly what the selected status returns.
      setOrders(mergeKeptOrder(body.data ?? [], kept));
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setErr(body.error ?? "فشل الإجراء");
      else {
        // Claim starts work on an order; deliver and cancel finish it. Only the
        // finishing actions should collapse the panel — closing it on claim
        // hides the upload field the admin pressed استلام to reach.
        if (!opts.keepOpen) {
          setOpen(null); setNotes(""); setInternalNotes(""); setPendingFile(null); setSendWhatsapp(true);
          await load();
        } else {
          // The row as the handler just wrote it, re-enriched with the two
          // fields only the LIST route computes (`profile`, `whatsappNotice`)
          // — the PATCH response is the bare service_requests row and would
          // otherwise blank the client's name off the card it is keeping
          // alive. Neither can go stale for long: mergeKeptOrder only reaches
          // for this copy when the refetch did NOT return the row, so the
          // moment the row matches the selected chip again the server's own
          // values win.
          const previous = orders.find((o) => o.id === id) ?? null;
          const kept: AdminOrder | null = body.data
            ? {
                ...(previous ?? {} as AdminOrder), ...(body.data as AdminOrder),
                profile: previous?.profile ?? null,
                whatsappNotice: previous?.whatsappNotice ?? null,
              }
            : previous;
          await load(kept);
        }
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
      await act(order.id, {
        action: "deliver", documentId: doc.id, fileName: doc.file_name, notes, internalNotes,
        sendWhatsapp,
      });
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
    setSendWhatsapp(true);
    setDragActive(false);
  }

  // Shared by the dropzone's click-picked and dragged-in paths so a dragged
  // file is validated exactly like a picked one — an unvalidated drop would
  // walk a 40MB .zip straight into uploadDocumentFile().
  function stageFile(f: File | null) {
    const rejection = f ? validateUploadFile(f) : null;
    if (rejection) { setErr(rejection); setPendingFile(null); return; }
    setPendingFile(f);
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const visibleOrders = orders.filter((o) => matchesSearch(o, search));

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

      {/* A client who quotes his order number over الواتساب was, until now,
          handing support a string support had no way to resolve — there was
          no text search on this screen at all. Matches the order number, the
          client's name and the order title; see matchesSearch(). */}
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث برقم الطلب أو اسم العميل"
        className={`w-full md:max-w-sm rounded-xl px-3 py-2 text-[12px] border ${
          isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200 placeholder:text-zinc-600"
            : "bg-white border-zinc-200 text-zinc-800 placeholder:text-zinc-400"}`} />

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
        {visibleOrders.map((o) => (
          <div key={o.id} className={`${card} p-4`}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                  {/* Task 5 — account-type and service badges. `provider` now
                      has its own badge (owner س٦); `admin` is the one
                      user_type still left unmapped, and an unmapped user_type
                      or service key renders nothing here rather than an empty
                      grey pill. */}
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
                {/* The email was always fetched by the list route and carried
                    on the profile, and was the one contact detail the card
                    never showed — so an admin whose WhatsApp message bounced
                    had no second way to reach the client without leaving the
                    queue. Rendered only when present: `profiles.email` can be
                    null, and «—» in its place would read as a missing
                    address rather than an absent one. */}
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {o.profile?.display_name ?? "—"} · {o.profile?.phone ?? "لا يوجد جوال"}
                  {o.profile?.email ? ` · ${o.profile.email}` : ""} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
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
                    notified={whatsappNotifiedOf(o)}
                    isDark={isDark}
                    busy={busy}
                    onResend={() => act(o.id, { action: "resend_whatsapp" }, { keepOpen: true })}
                  />
                )}

                {/* Task 3's other half. The note was written into
                    metadata.internalNotes on deliver/cancel and then rendered
                    nowhere — a note أ. أشرف left for the team was invisible to
                    أ. رامي on the very screen it was typed on. Read back
                    OUTSIDE the in_review block that holds the textarea: the
                    note only ever exists on a completed or cancelled order,
                    which are exactly the two statuses that block does not
                    render for. Admin-only surface — the client's own routes
                    strip this field through stripInternalNotes(), which is
                    untouched here. */}
                {typeof o.metadata?.internalNotes === "string" && o.metadata.internalNotes.trim() && (
                  <div className={`rounded-xl border px-3 py-2 ${
                    isDark ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-amber-500/25 bg-amber-50"}`}>
                    <p className={`text-[10px] font-semibold ${isDark ? "text-amber-400/80" : "text-amber-700/80"}`}>
                      🔒 ملاحظة داخلية للفريق — لا تظهر للعميل
                    </p>
                    <p className={`mt-1 text-[11px] leading-[1.9] whitespace-pre-wrap ${
                      isDark ? "text-amber-200" : "text-amber-800"}`}>
                      {o.metadata.internalNotes}
                    </p>
                  </div>
                )}

                <pre className={`text-[11px] leading-[1.9] whitespace-pre-wrap p-3 rounded-xl overflow-x-auto ${
                  isDark ? "bg-zinc-950 text-zinc-400" : "bg-slate-50 text-slate-600"}`}>
                  {buildOrderPrompt(o)}
                </pre>

                {/* The client's own files had no container of their own — one
                    faint grey line above a list of links, indistinguishable at
                    a glance from the deliverable controls below it. */}
                {Array.isArray(o.metadata?.attachments) && (o.metadata.attachments as OrderAttachment[]).length > 0 && (
                  <div className={`space-y-1.5 rounded-xl border p-3 ${
                    isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/70"}`}>
                    <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                      📁 مرفقات الطلب
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
                          const isMemo = isMemoAttachment(
                            o.metadata?.intake as Record<string, unknown> | undefined,
                            documentId,
                          );
                          return (
                            <button key={documentId} disabled={busy}
                              onClick={() => downloadAttachment(o.id, documentId)}
                              className={`flex items-center gap-2 text-[12px] font-semibold disabled:opacity-40 ${
                                isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                              <DownloadSimple size={13} />
                              {a.name || "مرفق"} {a.size ? `(${Math.max(1, Math.round(a.size / 1024))} كيلوبايت)` : ""}
                              {/* Task 5 (owner س٥) — amber, so it separates at a
                                  glance from the emerald the file name itself
                                  is drawn in. (It is NOT unique on the card:
                                  the corporate/micro account badges up in the
                                  header row are the same amber. Different
                                  region, different text, and nothing else in
                                  this expanded panel is amber.) Renders only
                                  for a file the client tagged as the memo; see
                                  isMemoAttachment() above for the three
                                  ordinary cases where nothing is badged. */}
                              {isMemo && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                                  isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-500/10 text-amber-600"}`}>
                                  مذكرة
                                </span>
                              )}
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
                    {/* The bare <input type="file"> this replaces rendered the
                        browser's own widget, which is untranslated English
                        («No file chosen · Choose File») on an otherwise
                        fully-Arabic RTL screen. The input itself is still the
                        control — hidden inside the label, so the click target,
                        keyboard focus and the disabled state all still come
                        from it rather than from a div pretending to be a
                        button. */}
                    <label
                      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        if (busy) return;
                        stageFile(e.dataTransfer.files?.[0] ?? null);
                      }}
                      className={`block cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
                        busy ? "opacity-40 cursor-not-allowed" : ""} ${
                        dragActive
                          ? "border-emerald-500/60 bg-emerald-500/[0.07]"
                          : isDark ? "border-white/15 bg-white/[0.02]" : "border-zinc-300 bg-zinc-50"}`}>
                      <input type="file" disabled={busy} className="hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          // Reset the input so a failed upload can be retried by
                          // re-picking the exact same file — without this, the
                          // browser suppresses onChange for an unchanged value
                          // and the file picker looks dead after an error.
                          e.target.value = "";
                          stageFile(f);
                        }} />
                      <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                        اضغط لرفع المستند النهائي المسلّم للعميل أو اسحب الملف هنا
                      </p>
                      <p className={`mt-1 text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                        PDF · Word · صور — بحد أقصى ٢٠ ميجابايت
                      </p>
                      {pendingFile && (
                        <p className={`mt-2 text-[11px] font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                          الملف المختار: {pendingFile.name}
                          {" "}({Math.max(1, Math.round(pendingFile.size / 1024))} كيلوبايت)
                        </p>
                      )}
                    </label>
                    {/* Owner's silent-delivery control. Checked by default, so
                        the ordinary delivery behaves exactly as it did before
                        this existed and an admin has to opt OUT deliberately.
                        The choice is recorded on the order (see
                        whatsappNotifiedOf), so the card can later say the
                        client was never messaged on purpose instead of
                        reporting it as a notice that failed. */}
                    <label className={`flex items-center gap-2 text-[11px] ${
                      isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                      <input type="checkbox" checked={sendWhatsapp} disabled={busy}
                        onChange={(e) => setSendWhatsapp(e.target.checked)}
                        className="accent-[#0B3D2E]" />
                      📱 إرسال إشعار وتسليم المستند للموكل عبر الواتساب
                    </label>
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
        {!loadErr && visibleOrders.length === 0 && (
          <div className={`${card} p-8 text-center text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {/* An empty result under an active search is a different fact from
                an empty queue, and the admin must not read one as the other. */}
            {orders.length > 0 ? "لا توجد طلبات مطابقة لبحثك." : "لا توجد طلبات."}
          </div>
        )}
      </div>
    </div>
  );
}
