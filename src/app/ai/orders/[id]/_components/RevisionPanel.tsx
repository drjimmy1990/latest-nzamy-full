"use client";

/**
 * RevisionPanel.tsx — «سياسة التعديلات: ٤٨ ساعة / تعديلان» + «فتح تذكرة دعم».
 *
 * Owner ruling, 25 August: after the team delivers, the client may ask for a
 * revision TWICE, free, within 48 hours of delivery; once that window closes
 * or both are spent, the way forward is a support ticket.
 *
 * ── This file is display only ─────────────────────────────────────────────
 *
 * The authority is the server: PATCH /api/v1/service-requests/[id] with
 * `{ action: "request_revision" }` re-derives BOTH the count and the deadline
 * from the persisted row on every call (`metadata.revisions.length` and
 * `metadata.deliverable.deliveredAt`) and refuses on its own. Nothing here is
 * a gate — reloading the page, opening a second tab, or calling the endpoint
 * by hand all meet the same two refusals, because no part of the budget is
 * kept in client state.
 *
 * What this component owes the server is the same discipline
 * openOrderStatuses.ts documents for the cancel button: its condition must
 * stay a strict SUBSET of what the server accepts, so it can never offer a
 * control whose action is then refused. It is one today — the server permits a
 * revision on `completed` + within-window + under-limit, and the form renders
 * on exactly that. The one gap it cannot close is time passing while the tab
 * sits open, which is precisely why the countdown ticks: the form removes
 * itself the moment the window runs out, and if a submit still races the
 * boundary the server answers `reason: "window_expired"` and the panel
 * re-renders into its escalation state.
 *
 * The two modules deliberately do NOT share constants. Importing the route's
 * numbers into a client bundle would make a server authority look like a value
 * the client holds; they are restated here, named, and the route is named as
 * the source. If the policy changes, both change — and the server is the half
 * that decides.
 */

import { useEffect, useState } from "react";
import { WhatsappLogo } from "@phosphor-icons/react";
import type { ServiceOrder } from "@/lib/services/serviceOrders";

/**
 * Mirrors REVISION_LIMIT / REVISION_WINDOW_HOURS in
 * src/app/api/v1/service-requests/[id]/route.ts — see the note above on why
 * they are restated rather than imported.
 */
const REVISION_LIMIT = 2;
const REVISION_WINDOW_HOURS = 48;
const REVISION_WINDOW_MS = REVISION_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * One entry of `metadata.revisions`, the shape the route writes and the admin
 * queue reads: `{ requestedAt, notes, index }`, index 1-based.
 *
 * Declared here rather than imported from serviceOrders.ts because
 * `ServiceOrder["metadata"]` is a closed object type that does not model
 * `revisions` yet, and that file belongs to another agent this wave (the
 * field addition is reported in this round's hand-off). Hence the
 * `Record<string, unknown>` cast in readRevisions below — a local narrowing,
 * not a claim about the shared type.
 */
interface OrderRevision {
  requestedAt: string;
  notes: string;
  index: number;
}

function readRevisions(order: ServiceOrder): OrderRevision[] {
  const raw = (order.metadata as unknown as Record<string, unknown> | null)?.revisions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is OrderRevision => entry != null && typeof entry === "object",
  );
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Arabic-Indic digits, to match the hand-written numerals in the Arabic copy
 * this page already ships («متوسط وقت التسليم المتوقع: خلال ٤ – ٢٤ ساعة»,
 * OrderTimeline.tsx). Done by substitution rather than
 * `toLocaleString("ar-SA")` because the numbering system that locale resolves
 * to depends on the runtime's ICU build, and a countdown that renders Western
 * digits on some devices and Arabic-Indic on others is worse than either.
 */
function ar(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/**
 * The remaining window, worded for a client rather than as a clock.
 *
 * Granularity tightens as the deadline approaches — hours and minutes while
 * there is a day left, minutes and seconds inside the last hour — so the last
 * few minutes read as urgent instead of rounding to a flat «٠ ساعة».
 */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "انتهت المهلة";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `متبقٍ ${ar(hours)} ساعة و${ar(minutes)} دقيقة`;
  if (minutes > 0) return `متبقٍ ${ar(minutes)} دقيقة و${ar(seconds)} ثانية`;
  return `متبقٍ ${ar(seconds)} ثانية`;
}

/**
 * Arabic copy for a refusal, keyed on the machine `reason` the route sends
 * beside its own Arabic `error`.
 *
 * The body's `error` is not echoed, for the reason OrderActions.tsx documents
 * at length: this route answers 401 with `{"error":"Unauthorized"}` and 404
 * with `{"error":"Service request not found"}`, and a 500 returns the raw
 * PostgREST message — all English, none of which may reach an Arabic user.
 * The policy refusals do carry Arabic, but keying on `reason` keeps one rule
 * for the whole surface instead of "echo these, translate those", and leaves
 * the wording here where the rest of this page's copy lives.
 */
function actionErrorAr(reason: string | undefined, status: number): string {
  switch (reason) {
    case "not_owner":
      return "هذا الطلب ليس ضمن طلباتك.";
    case "not_applicable":
      return "سياسة التعديلات لا تنطبق على هذا الطلب.";
    case "not_delivered":
      return "لا يمكن طلب تعديل قبل تسليم المستند من فريق نظامي.";
    case "window_expired":
      return `انتهت مهلة التعديلات المجانية (${ar(REVISION_WINDOW_HOURS)} ساعة من التسليم). يمكنك فتح تذكرة دعم.`;
    case "quota_exhausted":
      return `استُهلك الحد الأقصى للتعديلات المجانية (${ar(REVISION_LIMIT)}). يمكنك فتح تذكرة دعم.`;
    case "empty_notes":
      return "اكتب ملاحظات التعديل المطلوب.";
    case "notes_too_long":
      return "النص طويل جداً. اختصره ثم أعد المحاولة.";
    case "duplicate_open":
      return "لديك تذكرة مفتوحة بالفعل لهذا الطلب، وفريق الدعم يراجعها.";
    case "tickets_unavailable":
      return "تعذّر فتح التذكرة حالياً. تواصل مع الدعم عبر واتساب.";
    case "conflict":
      return "تغيّرت حالة الطلب. حدّث الصفحة ثم حاول مرة أخرى.";
    default:
      if (status === 401) return "انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.";
      if (status === 404) return "لم يعد هذا الطلب موجوداً.";
      return "تعذّر تنفيذ الطلب. حاول مرة أخرى.";
  }
}

export function RevisionPanel({
  order,
  isDark,
  supportHref,
  onChanged,
}: {
  order: ServiceOrder;
  isDark: boolean;
  /** The page's existing WhatsApp «تواصل مع الدعم» link, reused as the
   *  fallback when `support_tickets` cannot be written. */
  supportHref: string;
  /** The page's load() — refetch from the server rather than guessing the new
   *  state locally, so what renders next is what was actually persisted. */
  onChanged: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"idle" | "revision" | "ticket">("idle");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [offerWhatsapp, setOfferWhatsapp] = useState(false);
  const [ticketOpened, setTicketOpened] = useState(false);

  const deliveredAtRaw = order.metadata?.deliverable?.deliveredAt;
  const deliveredMs = deliveredAtRaw ? new Date(deliveredAtRaw).getTime() : NaN;
  const hasDelivery = Number.isFinite(deliveredMs);
  const deadlineMs = hasDelivery ? deliveredMs + REVISION_WINDOW_MS : 0;

  // One interval for the whole countdown. It never starts on an order whose
  // window has already closed, and — the part that needs doing inside the
  // tick — it cancels ITSELF the moment the deadline passes. Neither dep
  // changes when time runs out, so without that self-cancel an expired order
  // would keep a 1Hz re-render loop alive for as long as the tab stayed open,
  // invisibly, since `withinWindow` hides the output. Effects run
  // unconditionally (before any early return below) so the hook order is
  // stable across every state this panel has.
  useEffect(() => {
    if (!hasDelivery || Date.now() > deadlineMs) return;
    const t = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick > deadlineMs) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [hasDelivery, deadlineMs]);

  // Nothing was ever delivered — /ai/contract-drafter writes `completed`
  // ai_workspace rows with no `metadata.deliverable`, and the server refuses a
  // revision on exactly those, so there is no policy to describe here.
  if (!hasDelivery) return null;

  const revisions = readRevisions(order);
  const used = Math.min(revisions.length, REVISION_LIMIT);
  const remaining = Math.max(0, REVISION_LIMIT - used);
  const msLeft = deadlineMs - now;
  const withinWindow = msLeft > 0;

  // A revision the team is working on right now: the server moved the order
  // back to `in_review` and the history says why. Without this state the page
  // would fall through to its generic «طلبك قيد التنفيذ» panel and the client
  // would see no trace of the request they just sent.
  const underRevision = order.status === "in_review" && used > 0;
  const canRequest = order.status === "completed" && withinWindow && remaining > 0;
  // Window closed or budget spent, on a delivered order: the ticket is the
  // way forward. Not offered while a revision is already in flight.
  const canEscalate = order.status === "completed" && !canRequest;

  async function submit(action: "request_revision" | "support_ticket") {
    const text = notes.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr("");
    setOfferWhatsapp(false);
    try {
      const res = await fetch(`/api/v1/service-requests/${order.id}`, {
        method: action === "request_revision" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ action, notes: text }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        console.error(`[RevisionPanel] ${action} refused:`, res.status, payload?.reason);
        setErr(actionErrorAr(payload?.reason, res.status));
        // The one refusal the client can still act on: `support_tickets` is
        // not writable (the table may not be applied on this environment yet
        // — see the admin tickets route). Surface the WhatsApp contact rather
        // than leaving them with a dead end.
        if (payload?.reason === "tickets_unavailable") setOfferWhatsapp(true);
        setBusy(false);
        return;
      }
      setNotes("");
      setMode("idle");
      setBusy(false);
      if (action === "support_ticket") {
        setTicketOpened(true);
        return;
      }
      // Refetch: the panel's next state has to come from what the server
      // persisted, not from what this component assumed it wrote.
      onChanged();
    } catch {
      // Transport-level failure (offline, dropped connection) — same pattern
      // as this page's download()/doCancel() handlers: never leave a button
      // looking dead with no feedback.
      setErr("تعذّر الاتصال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      setBusy(false);
    }
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";
  const mutedText = isDark ? "text-zinc-400" : "text-zinc-600";
  const field = `w-full rounded-xl p-3 text-[12px] leading-[1.9] outline-none border ${
    isDark
      ? "bg-zinc-950 border-white/[0.08] text-zinc-200 focus:border-[#C8A762]"
      : "bg-white border-zinc-200 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  return (
    <div className={`${card} p-5 space-y-3`} dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
            سياسة التعديلات
          </p>
          <p className={`text-[11px] leading-[1.9] ${mutedText}`}>
            لك {ar(REVISION_LIMIT)} تعديلان مجانيان خلال {ar(REVISION_WINDOW_HOURS)} ساعة من
            تسليم المستند.
          </p>
        </div>

        {/* The counter and the live countdown the owner asked for, read as one
            line: «تعديل ٢ من ٢ — متبقٍ ١٩ ساعة و٢٣ دقيقة». */}
        {(canRequest || underRevision) && (
          <p className="text-[11px] font-bold text-amber-500">
            تعديل {ar(underRevision ? used : used + 1)} من {ar(REVISION_LIMIT)}
            {withinWindow && ` — ${formatRemaining(msLeft)}`}
          </p>
        )}
      </div>

      {underRevision ? (
        <div className="space-y-2">
          <p className={`text-[12px] leading-[1.9] ${mutedText}`}>
            تم استلام طلب التعديل، وفريق نظامي يعمل عليه الآن. سيصلك إشعار فور إعادة التسليم.
          </p>
          {/* Their own words, read back. A request whose text vanishes the
              moment it is sent gives the client nothing to check it against. */}
          {revisions.map((r) => (
            <div
              key={`${r.index}-${r.requestedAt}`}
              className={`rounded-xl p-3 text-[11px] leading-[1.9] ${
                isDark ? "bg-white/[0.03] text-zinc-300" : "bg-zinc-50 text-zinc-700"
              }`}
            >
              <span className="font-semibold">التعديل {ar(r.index)}: </span>
              {r.notes}
            </div>
          ))}
        </div>
      ) : canRequest ? (
        mode === "revision" ? (
          <div className="space-y-2">
            <label className={`block text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
              اكتب ما تريد تعديله بدقة:
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="مثال: يرجى إضافة فقرة عن الشرط الجزائي وتصحيح قيمة المطالبة."
              className={field}
            />
            <div className="flex gap-2">
              <button
                onClick={() => submit("request_revision")}
                disabled={busy || !notes.trim()}
                className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white disabled:opacity-40"
              >
                {busy ? "جارٍ الإرسال..." : "إرسال طلب التعديل"}
              </button>
              <button
                onClick={() => { setMode("idle"); setErr(""); }}
                disabled={busy}
                className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${
                  isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"
                }`}
              >
                تراجع
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setMode("revision"); setErr(""); }}
            className="rounded-xl border border-amber-500/40 px-4 py-2 text-[12px] font-bold text-amber-500"
          >
            طلب تعديل
          </button>
        )
      ) : canEscalate ? (
        <div className="space-y-2">
          <p className={`text-[12px] leading-[1.9] ${mutedText}`}>
            {remaining === 0
              ? `استُهلك التعديلان المجانيان لهذا الطلب.`
              : `انتهت مهلة التعديلات المجانية (${ar(REVISION_WINDOW_HOURS)} ساعة من التسليم).`}{" "}
            إن كان لديك ملاحظة أو شكوى، افتح تذكرة دعم وسيتواصل معك الفريق.
          </p>

          {ticketOpened ? (
            <p className="text-[12px] font-semibold text-emerald-600">
              تم فتح التذكرة. سيتواصل معك فريق الدعم قريباً.
            </p>
          ) : mode === "ticket" || mode === "revision" ? (
            <div className="space-y-2">
              {/* The window can run out while the client is mid-sentence: the
                  countdown ticks, `canRequest` flips false, and the revision
                  form they were typing into unmounts. `notes` is one shared
                  state, so their text is still here — this says so, instead
                  of letting the form vanish without explanation and their
                  words reappear later with no account of why. */}
              {mode === "revision" && (
                <p className="text-[11px] font-semibold text-amber-500">
                  انتهت المهلة أثناء الكتابة. نصّك محفوظ — يمكنك إرساله كتذكرة دعم.
                </p>
              )}
              <label className={`block text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                اكتب تفاصيل الشكوى أو الاستفسار:
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
                placeholder="اشرح المشكلة بوضوح، وسيصل رقم الطلب مع التذكرة تلقائياً."
                className={field}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => submit("support_ticket")}
                  disabled={busy || !notes.trim()}
                  className="rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                >
                  {busy ? "جارٍ الإرسال..." : "إرسال التذكرة"}
                </button>
                <button
                  onClick={() => { setMode("idle"); setErr(""); }}
                  disabled={busy}
                  className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${
                    isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"
                  }`}
                >
                  تراجع
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setMode("ticket"); setErr(""); }}
              className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${
                isDark ? "border-white/10 text-zinc-200" : "border-zinc-200 text-zinc-700"
              }`}
            >
              فتح تذكرة دعم / شكوى
            </button>
          )}
        </div>
      ) : null}

      {err && <p className="text-[11px] text-red-500">{err}</p>}

      {offerWhatsapp && (
        <a
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600"
        >
          <WhatsappLogo size={14} weight="fill" /> تواصل مع الدعم عبر واتساب
        </a>
      )}
    </div>
  );
}
