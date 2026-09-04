"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight, Robot, FileText, Warning, SealCheck,
  Copy, FileArrowUp, WhatsappLogo, CalendarBlank, ArrowClockwise, User,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import SessionChatPane from "@/components/dashboard/SessionChatPane";
import { buildWhatsAppHref } from "@/components/floating/whatsappWorkflow";
import { listClientWorkflowRequests } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequestStatus } from "@/lib/workflowStore";
import {
  CHANNEL_LABEL,
  readConsultChannel,
  type ConsultChannel,
} from "@/constants/clientConsultationData";
import {
  getChatRooms,
  createChatRoom,
  getChatMessages,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/services/chatService";
import { getConsultations, type Consultation as ConsultationStatusRow } from "@/lib/services/casesService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { CONSULTATION_STATUS_AR, CONSULTATION_MODE_AR, type ConsultationStatus } from "@/lib/services/consultationVocabulary";
import { formatGregorianAr } from "@/app/dashboard/lawyer/_components/DeadlineCard";
import { toArabicDigits, countPhraseAr, type ArabicCountForms } from "@/lib/services/arabicCount";

// ─── Types & Configurations ──────────────────────────────────────────────────

type ConsultStatus = "upcoming" | "active" | "completed" | "cancelled";

interface Consultation {
  id: string;
  /**
   * How the session is delivered — read from `metadata.mode`, the SAME
   * discriminator the list page keys its badge off (consultation/page.tsx).
   * null when the row records no mode: bookings made at /book/consultation
   * (useConsultationForm) write none, and a null channel renders NO session-type
   * row rather than a guessed one.
   */
  channel: ConsultChannel | null;
  /**
   * Does this row have a live chat thread — i.e. does this page render the chat
   * panel instead of the request record?
   *
   * True only for rows written with a receiver other than "ai_workspace", which
   * today means rows created BEFORE the receiver fix. Every consultation is now
   * written with `receiver: "ai_workspace"` because that literal is the whole of
   * "the fulfilment queue can see this row"
   * (api/v1/admin/service-orders/route.ts:54); it says nothing about who does
   * the work, and the field that does say so is `channel` above.
   *
   * WHY THIS IS NOT `metadata.mode`, which is what a reading of the finding
   * would suggest: pointing the render branch at the mode would send a ٧٠٠ ر.س
   * in-person booking — `assignedTo: null`, so no chat room can be created —
   * into the chat panel, where it renders «لا توجد محادثة مباشرة لهذا الطلب»
   * and LOSES the request facts, the client's own submitted text, the copy
   * button and the printable copy. That is a worse version of the same defect.
   * The mode decides what the record SAYS; the receiver decides which record
   * this page is able to show at all.
   */
  hasChatThread: boolean;
  status: ConsultStatus;
  /** The request's own status wording — see REQUEST_STATUS_AR. */
  requestStatusLabel: string;
  /**
   * `metadata.lawyerName` — the lawyer the client picked in the wizard. null
   * when the row names none (the beta assigns one later, and this page has no
   * source for who that is).
   */
  lawyerName: string | null;
  /** `metadata.specialty` — the legal branch the client picked. null when absent. */
  specialty: string | null;
  /** The stored request title, exactly as the booking wizard wrote it. */
  title: string;
  /** The client's own submitted text (`service_requests.description`). Never an answer. */
  topic: string;
  /** Formatted submission date, or "" when the row carries no usable timestamp. */
  date: string;
  price: number;
  /**
   * Where the fulfilled document actually appears, for `ai_workspace` rows only
   * — /ai/orders/[id] is the one page in this codebase that reads
   * `metadata.deliverable` and serves the file. Null for any other receiver, so
   * this page never points a client at a page that would not show their order.
   */
  orderHref: string | null;
}

interface Message {
  id: string;
  sender: "client" | "lawyer" | "ai";
  text: string;
  time: string;
  isVoice?: boolean;
  voiceDuration?: string;
  attachment?: { name: string; size: string };
  isRead?: boolean;
}

// Map a chatService ChatMessage (server row, column `body` → `content`) onto the
// local Message shape used by SessionChatPane. No fabricated content — only
// real persisted messages are rendered.
function mapChatMessage(
  cm: ChatMessage,
  currentUserId: string | undefined,
): Message {
  const isSelf = cm.sender_id === currentUserId;
  // Never "ai". A thread only exists on a row with `hasChatThread`, and the
  // chat effect below returns early for anything else — so the counterpart in
  // a rendered thread is the assigned lawyer, never an assistant. This used to
  // branch on a `type` that was the literal "ai" for every row on the page.
  const sender: Message["sender"] = isSelf ? "client" : "lawyer";
  const d = new Date(cm.created_at);
  const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return {
    id: cm.id,
    sender,
    text: cm.content,
    time: timeStr,
    isRead: isSelf,
  };
}

const STATUS_BADGE: Record<ConsultStatus, string> = {
  upcoming:  "text-blue-600 bg-blue-500/10 border-blue-500/20",
  active:    "text-emerald-500 bg-emerald-500/10 border-emerald-500/20 animate-pulse",
  // zinc/10 rather than white/5: a white-tinted pill on the light theme's white
  // card left the status word all but unreadable. Same tone the orders list
  // uses for a finished order.
  completed: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
  cancelled: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

/**
 * The session state this page renders, derived from the request's own status.
 *
 * WHY a total map instead of the ternary chain that stood here: that chain read
 * `completed ? "completed" : pending_payment ? "upcoming" : "upcoming"`, so a
 * CANCELLED request was painted «قادمة» — and because SessionChatPane only
 * hides its composer on `completed`/`cancelled`, a cancelled consultation kept
 * a live message box on a request nobody will ever answer. Declaring the map
 * `Record<WorkflowRequestStatus, ConsultStatus>` turns a new request status
 * into a compile error instead of another silent «قادمة».
 *
 * NOTHING maps to "active" on purpose. "active" is the only value that paints a
 * pulsing «نشطة الآن» badge, and nothing in this codebase reports that a
 * consultation session is actually running — there is no session-clock API. Do
 * not "fix" this later by pointing `assigned`/`in_review` at it; that would
 * claim a live session on the strength of a queue state.
 */
const CONSULT_STATUS_BY_REQUEST_STATUS: Record<WorkflowRequestStatus, ConsultStatus> = {
  draft: "upcoming",
  pending_payment: "upcoming",
  pending_assignment: "upcoming",
  assigned: "upcoming",
  in_review: "upcoming",
  completed: "completed",
  cancelled: "cancelled",
};

/**
 * The request's own status in Arabic. Kept separate from ConsultStatus because
 * the four session states collapse seven request states into «قادمة», which
 * would tell a client whose request is «قيد التنفيذ» that a session is coming.
 * Wording follows ORDER_STATUS_AR (src/lib/services/serviceOrders.ts) so the
 * same row does not read one way here and another way in «طلباتي».
 */
const REQUEST_STATUS_AR: Record<WorkflowRequestStatus, string> = {
  draft: "مسودة",
  pending_payment: "بانتظار الدفع",
  pending_assignment: "بانتظار الاستلام",
  assigned: "قيد التنفيذ",
  in_review: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
};

/**
 * The real submission date, or null when there is none to show.
 *
 * `metadata.day` — what this field used to read — is written by no creator of
 * these rows (neither /dashboard/client/consultation/new nor
 * useConsultationForm sets it), so its `?? "محفوظ الآن"` fallback printed a
 * placeholder into the date field of a document a client hands to a lawyer.
 * `createdAt` is server-set on every row; when it is absent or unparsable the
 * answer is "no date", never a stand-in.
 */
function formatRequestDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * `metadata.x` as a non-empty string, or null. Never "null"/"undefined".
 *
 * Load-bearing, not defensive: the booking wizard writes `lawyerName` and
 * `lawyerId` as an explicit `null` when the client picked no lawyer
 * (consultation/new/page.tsx), and `specialty` is `string | null` there too.
 * `String(found.metadata?.lawyerName)` — which is what this file used to do —
 * turns that null into the four characters «null» and passes every truthiness
 * test after it, so a row with no lawyer would render «المحامي: null».
 *
 * Copied from the list page (consultation/page.tsx), which needs the identical
 * guard on the identical keys. See the follow-up on extracting both pages'
 * shared readers into src/lib.
 */
function metaString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The Arabic wording for how this consultation is delivered, or null when the row records none. */
function channelLabelOf(c: Consultation): string | null {
  return c.channel ? CHANNEL_LABEL[c.channel] : null;
}

// ─── «حالة الاستشارة» — a REAL public.consultations row, read independently of
// the service_requests row above and matched onto it by `request_id`. Both
// helpers below PARSE a stored timestamptz value, never the current moment —
// unlike `new Date()`/`Date.now()` in a useState initializer or module scope,
// which the SSR cached-date trap this codebase has already been bitten by
// once, this is deterministic on the value it is given and carries no such
// risk. ───────────────────────────────────────────────────────────────────

/** The Gregorian+Hijri date half of a stored timestamptz, in local time. */
function isoDatePartAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatGregorianAr(`${y}-${m}-${day}`);
}

/** The 12-hour Arabic-Indic time half of a stored timestamptz, in local time. */
function isoTimePartAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours < 12 ? "ص" : "م";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${toArabicDigits(hour12)}:${toArabicDigits(String(minutes).padStart(2, "0"))} ${period}`;
}

const DURATION_FORMS: ArabicCountForms = {
  zero: null, one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة",
};

/** Local styling only — the wording itself is CONSULTATION_STATUS_AR. */
const CONSULT_ROW_STATUS_BADGE: Record<ConsultationStatus, string> = {
  requested: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  scheduled: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  completed: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  cancelled: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  no_show:   "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
};

/**
 * Escapes text interpolated into the printable document.
 *
 * The printed copy's entire claim is that it reproduces the client's own words.
 * Written into `document.write` raw, a description containing `<` is eaten by
 * the parser — the section silently drops exactly the text it promises to show
 * — and pasted markup would run inside the print window. Every interpolated
 * value goes through here.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The single sentence this page is allowed to say about a legal opinion. There
// is no AI engine and no lawyer write-back behind this record: `topic` is the
// client's own description column, and nothing in the codebase ever writes an
// answer into it. Any future "opinion" text must come from a real stored
// deliverable, not from re-labelling a field the client filled in.
const NO_OPINION_AR =
  "لم يصدر رأي قانوني في هذا الطلب. لا يتضمن هذا السجل تحليلاً آلياً ولا رأي محامٍ؛ ما هو معروض هنا هو نص الطلب كما أرسلته.";

const NO_REQUEST_TEXT_AR = "لم يُسجَّل نص لهذا الطلب.";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConsultationRoomPage() {
  const params = useParams();
  const id = params?.id as string;
  const user = useUser();
  const { isDark } = useTheme();

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The read did not answer — as distinct from `consultation === null`, which
   * means it answered and this id is not in the client's records.
   *
   * These are two different sentences and they must not share a screen.
   * «الاستشارة غير موجودة» is a statement about the client's own file; saying
   * it after a dropped request tells them a booking they paid for is gone.
   * `listClientWorkflowRequests` NO LONGER REJECTS (it answers `ok: false`), so
   * the `.catch()` below stopped being the place this was detected.
   */
  const [readFailed, setReadFailed] = useState(false);
  // Bumped by «إعادة المحاولة» so the read is retried without a page reload.
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  // Assigned lawyer's user id (used to find/create the chat room). Null until the
  // workflow request resolves; stays null for ai_workspace or unassigned requests.
  const [lawyerUserId, setLawyerUserId] = useState<string | null>(null);

  // «حالة الاستشارة» card — a REAL public.consultations row, read
  // independently of the service_requests row above (getConsultations has no
  // request_id filter, so the whole list is read and matched client-side;
  // limit raised well past the route's default 20 so a client with more
  // activity than that still finds their own row). Unlike `consultation`
  // above, a missing match here is not an error: the card simply renders
  // nothing (see the render below).
  const [consultRead, setConsultRead] = useState<ListRead<ConsultationStatusRow> | null>(null);
  const [consultLoading, setConsultLoading] = useState(true);
  const [consultReloadKey, setConsultReloadKey] = useState(0);

  useEffect(() => {
    if (user.loading) return;
    let cancelled = false;
    setConsultLoading(true);
    getConsultations({ limit: 200 })
      .then((result) => { if (!cancelled) setConsultRead(result); })
      .finally(() => { if (!cancelled) setConsultLoading(false); });
    return () => { cancelled = true; };
  }, [user.loading, consultReloadKey]);

  const consultView = listViewState(consultLoading, consultRead);
  const consultationStatusRow = useMemo(
    () => itemsOf(consultRead).find((c) => c.request_id === id) ?? null,
    [consultRead, id],
  );

  // Chat panel states
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showAIPanel, setShowAIPanel] = useState(false);
  // Real chat room id for this consultation (looked up / created via chatService).
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  // Starts true: the lawyer branch renders "no chat room" whenever this is
  // false and `chatRoomId` is null, and that verdict must not be shown before
  // the lookup has run.
  const [chatLoading, setChatLoading] = useState(true);
  // Honest, user-facing chat banner (no fabricated lawyer/AI messages).
  // Transient: sendMessage() writes here too, so nothing that must survive a
  // failed send belongs in it — see `chatUnreadable`.
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  /**
   * A chat READ did not answer — the room list, or the message history.
   *
   * Separate from `chatRoomId === null`, which means the lookup succeeded and
   * this request has no room. «لا توجد محادثة مباشرة لهذا الطلب» is a claim
   * about the request; after a failed read it is not one this page can make.
   */
  const [chatUnreadable, setChatUnreadable] = useState(false);
  // Bumped by the chat «إعادة المحاولة», which re-runs the room/history lookup.
  const [chatReloadKey, setChatReloadKey] = useState(0);
  // A required SessionChatPane prop that the pane does not render. A real
  // countdown needs a session-clock API that does not exist; never put a
  // ticking figure here.
  const [sessionTimeLeft] = useState("جارية");

  useEffect(() => {
    // Wait for the session first. Querying with an unresolved `userId` returns
    // nothing, and this page answers "nothing" with «الاستشارة غير موجودة» — a
    // statement about the client's records that would be made before we knew
    // whose records they are.
    if (user.loading) return;
    let cancelled = false;
    setLoading(true);
    setReadFailed(false);
    // Fetch the consultation from the dynamic workflow repository (real data only).
    // No mock fallback: an unknown id leaves consultation null and the not-found UI
    // renders honestly.
    listClientWorkflowRequests({ requesterUserId: user.userId })
      .then((read) => {
        if (cancelled) return;
        // The read failed. NOT "the consultation is missing" — we never got a
        // list to look in, so nothing may be concluded about this id.
        if (!read.ok) {
          setReadFailed(true);
          setConsultation(null);
          setLoading(false);
          return;
        }
        const found = read.items.find(r => r.id === id);
        if (found) {
          // ── WHY `metadata.mode` AND NOT `receiver` ────────────────────────
          //
          // `receiver` is the unconditional literal "ai_workspace" in BOTH
          // creators of a consultation row (consultation/new/page.tsx and
          // useConsultationForm.ts), so the ternary that stood here —
          // `found.receiver === "ai_workspace" ? "ai" : …` — resolved to "ai"
          // for every row this page can load. Everything downstream of it was
          // therefore dead: the read of `metadata.lawyerName` sat in the
          // branch that never runs, and a ٧٠٠ ر.س in-person booking with a
          // named lawyer showed that lawyer NOWHERE on the page.
          //
          // `metadata.mode` is the discriminator that actually varies, and it
          // is the one the list page already keys its badge off. A value this
          // codebase cannot name (or none at all) leaves `channel` null, and
          // every row built from it disappears rather than being guessed.
          // readConsultChannel() also covers /book/consultation's own key —
          // see its comment.
          const channel: ConsultChannel | null = readConsultChannel(found.metadata);
          setLawyerUserId(found.assignedTo ?? null);
          setConsultation({
            id: found.id,
            channel,
            hasChatThread: found.receiver !== "ai_workspace",
            // BOTH fallbacks are load-bearing, not defensive noise: the DB's
            // `service_requests_status_check` allows a value the TypeScript
            // union does not — supabase/migrations/20260616_production_readiness_fixes.sql
            // added 'pending' — and localStorage can still hold rows written
            // under an older shape. An unrecognised status must degrade to
            // something *stated*: an empty label would make the status row
            // disappear from the badge, the facts card and the printed copy at
            // once, leaving the client a document with no status line and no
            // sign that one was missing.
            status: CONSULT_STATUS_BY_REQUEST_STATUS[found.status] ?? "upcoming",
            requestStatusLabel: REQUEST_STATUS_AR[found.status] ?? "حالة غير معروفة",
            // `metadata.lawyerName`, not `metadata.lawyer`. The booking wizard
            // writes the client's chosen lawyer under `lawyerName`
            // (consultation/new/page.tsx) and both consultation pages read
            // `lawyer`, a key NOTHING writes — so a client who picked a specific
            // lawyer was shown «بانتظار تأكيد المحامي» on every screen after,
            // as if the choice had not been made. Reconciled on the reader side
            // in both files rather than papered over with a fallback chain.
            //
            // Stored RAW and nullable, with no fallback wording baked in. The
            // one fallback lives at the one site that cannot render an absence
            // — `lawyerDisplayName`, which the chat header and the pane share.
            // Every other site omits its whole row instead, which is the only
            // way «المحامي» can be absent rather than asserted.
            lawyerName: metaString(found.metadata?.lawyerName),
            specialty: metaString(found.metadata?.specialty),
            title: found.title ?? "",
            topic: found.description ?? "",
            date: formatRequestDate(found.createdAt),
            price: found.payment.amount,
            orderHref: found.receiver === "ai_workspace" ? `/ai/orders/${encodeURIComponent(found.id)}` : null,
          });
          // NOTE: there is deliberately no `questionText` any more. It read
          // `metadata.question`, which no creator of these rows writes, and its
          // only job was to be missing so a hardcoded «تأصيل الوقائع المحددة من
          // الاستبيان التشخيصي» could be printed in its place — invented facts
          // in the "facts established" row of a legal-looking document.
        } else {
          setConsultation(null);
        }
        setLoading(false);
      })
      .catch(() => {
        // Retained for the throws the fetch layer can still raise. A rejection
        // is a failed read, never an absent consultation.
        if (cancelled) return;
        setReadFailed(true);
        setConsultation(null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, user.userId, user.loading, reloadKey]);

  // Wire the real chat room for this consultation — only for rows that render
  // the chat panel at all. Every other row renders the request record below and
  // never reaches SessionChatPane, so looking a room up for it would be a
  // request made on behalf of a screen that does not exist.
  useEffect(() => {
    if (!consultation || !consultation.hasChatThread) return;
    if (user.loading) return;
    let cancelled = false;
    (async () => {
      if (!user.userId) {
        // No account, no room to look up — and no reason to leave the pane on a
        // loading state for a lookup that will never be attempted.
        //
        // Flagged unreadable, not empty: no lookup happened, so «لا توجد محادثة
        // مباشرة لهذا الطلب» would be a verdict on the request reached without
        // asking about it. The specific reason is kept in `chatNotice`.
        setChatLoading(false);
        setChatUnreadable(true);
        setChatRoomId(null);
        setMessages([]);
        setChatNotice("تعذّر تحميل المحادثة: لم يتم التعرف على الحساب.");
        return;
      }
      setChatLoading(true);
      setChatNotice(null);
      setChatUnreadable(false);
      try {
        const rooms = await getChatRooms();
        if (cancelled) return;
        // getChatRooms() NO LONGER REJECTS on failure — it answers `ok: false`,
        // so the catch below can no longer see this. Two things hang on it:
        //
        //  1. `rooms.items` would be [] on a failure, so `existing` would be
        //     undefined and the branch after it would CREATE A SECOND ROOM for
        //     a consultation that already has one — a write performed on the
        //     strength of a read that never happened.
        //  2. The screen would fall to the «لا توجد محادثة مباشرة لهذا الطلب»
        //     card, which is a claim about this request, not about the network.
        if (!rooms.ok) {
          setChatUnreadable(true);
          setChatRoomId(null);
          setMessages([]);
          return;
        }
        const existing = rooms.items.find(r => r.related_id === consultation.id);
        let roomId = existing?.id ?? null;
        if (!roomId && lawyerUserId) {
          try {
            // createChatRoom now returns the ACTUAL room. It previously handed
            // back the `{ data: room }` envelope, so `created.id` was undefined
            // and `roomId` fell to null on EVERY successful creation — the room
            // was made server-side and this screen then said it could not open
            // it. Read `.id` directly now that there is one.
            const created = await createChatRoom({
              participant_ids: [user.userId as string, lawyerUserId],
              type: "direct",
              related_id: consultation.id,
              name: `استشارة ${consultation.id}`,
            });
            roomId = created.id;
          } catch {
            roomId = null;
          }
        }
        if (cancelled) return;
        setChatRoomId(roomId);
        if (roomId) {
          const history = await getChatMessages(roomId);
          if (cancelled) return;
          // Same trap one level down: an unreadable history would render as an
          // empty thread, and an empty thread in a room that HAS messages tells
          // the client their lawyer never wrote back.
          if (!history.ok) {
            setMessages([]);
            // Held in its own flag, NOT in `chatNotice`: sendMessage() writes
            // that same field, so the next failed send would quietly replace
            // «the history could not be read» with a sentence about one message
            // — and the thread would go back to looking merely empty.
            setChatUnreadable(true);
          } else {
            setMessages(history.items.map(cm => mapChatMessage(cm, user.userId)));
          }
        } else {
          setMessages([]);
          // No «قريباً»: nothing here schedules the room, so a promised date
          // would be one more thing this screen cannot keep.
          setChatNotice(
            lawyerUserId
              ? "تعذّر فتح غرفة المحادثة الآن."
              : "لا توجد محادثة مباشرة لهذا الطلب: لم يُعيَّن محامٍ بعد."
          );
        }
      } catch {
        if (!cancelled) {
          setChatUnreadable(true);
          setChatRoomId(null);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [consultation, lawyerUserId, user.userId, user.loading, chatReloadKey]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    // No room, no send. This branch used to append the client's message to the
    // thread, clear the box and answer «تم تسجيل رسالتك» — nothing was written
    // anywhere, because with no chat room there is no endpoint to write to.
    // The composer is not rendered without a room (see the lawyer branch), so
    // this is the backstop: keep the text in the box, claim nothing.
    if (!chatRoomId) {
      setChatNotice("لم تُرسل الرسالة: لا توجد غرفة محادثة لهذا الطلب.");
      return;
    }
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const localId = `local-${Date.now()}`;
    // Append only the client's own message (optimistic). No fabricated reply.
    setMessages(prev => [...prev, {
      id: localId,
      sender: "client",
      text,
      time: timeStr,
      isRead: false,
    }]);
    setInput("");
    try {
      const saved = await sendChatMessage(chatRoomId, text);
      setMessages(prev => prev.map(m =>
        m.id === localId ? mapChatMessage(saved, user.userId) : m
      ));
    } catch {
      // A rejected POST must not leave the optimistic bubble sitting in the
      // thread: it is pixel-identical to a delivered message. Drop it and hand
      // the text back so the send can be retried — unless the client has
      // already started typing something else.
      setMessages(prev => prev.filter(m => m.id !== localId));
      setInput(prev => (prev.trim() ? prev : text));
      setChatNotice("تعذّر إرسال الرسالة ولم تُحفظ. أُعيد النص إلى مربع الكتابة.");
    }
  }

  // ─── Native Copy & Branded PDF Creators ─────────────────────────────────────

  // WhatsApp is the one support channel this codebase actually ships
  // (buildWhatsAppHref → NZAMY_WHATSAPP_NUMBER, the same href /ai/orders/[id]
  // offers). Never point the client at a route or number that has not been
  // verified to exist.
  const supportHref = consultation
    ? buildWhatsAppHref(`مرحباً فريق نظامي، بخصوص طلب الاستشارة رقم ${consultation.id}.`)
    : buildWhatsAppHref("مرحباً فريق نظامي، لدي استفسار بخصوص طلب استشارة.");

  const handleCopyReport = () => {
    if (!consultation) return;

    // Same three rows the screen gained, in the same order. A client who copies
    // this to send it on must not end up with a shorter record than the one
    // they were looking at. Every one is conditional: a row with no stored
    // lawyer, mode or specialty loses the whole line rather than printing a
    // label with nothing after it.
    const channelLabel = channelLabelOf(consultation);
    const lines = [
      "نسخة من طلب استشارة قانونية — منصة نظامي",
      `رقم الطلب: ${consultation.id}`,
      ...(consultation.title ? [`عنوان الطلب: ${consultation.title}`] : []),
      ...(channelLabel ? [`نوع الجلسة: ${channelLabel}`] : []),
      ...(consultation.specialty ? [`التخصص: ${consultation.specialty}`] : []),
      ...(consultation.lawyerName ? [`المحامي: ${consultation.lawyerName}`] : []),
      ...(consultation.date ? [`تاريخ الإرسال: ${consultation.date}`] : []),
      ...(consultation.requestStatusLabel ? [`حالة الطلب: ${consultation.requestStatusLabel}`] : []),
      "=========================================",
      "",
      "نص الطلب كما أرسله العميل:",
      consultation.topic.trim() || NO_REQUEST_TEXT_AR,
      "",
      "الرأي القانوني:",
      // A real `consultations.opinion_text`, when the lawyer has actually
      // delivered one (`opinion_delivered_at` set) — never NO_OPINION_AR
      // beside it, which would deny what the line above it just said.
      ...(consultationStatusRow?.opinion_delivered_at
        ? [
            consultationStatusRow.opinion_text?.trim() || "سُلِّم رأي قانوني على هذه الاستشارة.",
            ...(isoDatePartAr(consultationStatusRow.opinion_delivered_at)
              ? [`(تاريخ التسليم: ${isoDatePartAr(consultationStatusRow.opinion_delivered_at)})`]
              : []),
          ]
        : [NO_OPINION_AR]),
      "",
      "-----------------------------------------",
      "هذه نسخة من طلب مقدَّم عبر منصة نظامي، وليست رأياً قانونياً ولا تقريراً صادراً عن محامٍ.",
    ];

    setCopyError(null);
    // `navigator.clipboard` is undefined outside a secure context, where the
    // unguarded call threw inside the click handler and the button did nothing
    // at all — no copy, no message.
    if (!navigator.clipboard?.writeText) {
      setCopyError("تعذّر النسخ تلقائياً — حدّد النص وانسخه يدوياً.");
      return;
    }
    navigator.clipboard.writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Announcing «تم النسخ» after a rejected clipboard write is the same
        // lie in miniature: the client walks away with an empty clipboard.
        setCopyError("تعذّر النسخ تلقائياً — حدّد النص وانسخه يدوياً.");
      });
  };

  const handleDownloadPDF = () => {
    if (!consultation) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      // A blocked popup used to return silently, so the button looked broken —
      // or worse, looked like it had produced a file somewhere.
      setPrintError("تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      return;
    }
    setPrintError(null);

    // WHAT IS NOT IN THIS DOCUMENT, AND MUST NOT COME BACK:
    //
    //  - A «التشخيص والإجابة القانونية المباشرة» section. It printed
    //    `consultation.topic` — the client's own description column — under a
    //    heading announcing it as the legal answer. There is no answer stored
    //    anywhere on this row.
    //  - A «السند القانوني والمواد النظامية المعول عليها» section. Two
    //    keyword regexes (/عمال|موظف|راتب|فصل/, /عقار|أرض|شقة|إيجار/) picked
    //    between three hardcoded arrays of statute articles, so a criminal,
    //    family or inheritance matter was handed civil-contract articles and
    //    told they were the authorities relied upon for it.
    //  - A «خريطة الطريق والخطوات التنفيذية» section: three fixed litigation
    //    steps, identical for every client, printed as this matter's plan.
    //
    // What remains is what the row actually contains: the request, and a
    // statement that no opinion has been issued on it.
    const dateLine = consultation.date ? ` | تاريخ الإرسال: ${escapeHtml(consultation.date)}` : "";
    const titleRow = consultation.title
      ? `<tr><th>عنوان الطلب</th><td>${escapeHtml(consultation.title)}</td></tr>`
      : "";
    // The session type, the branch of law and the named lawyer — the three
    // facts a client hands this document to someone else in order to state.
    // escapeHtml on all three: the specialty and the lawyer name are stored
    // values, and a stored value goes through the escape on the way into
    // document.write like every other one on this page.
    const channelLabel = channelLabelOf(consultation);
    const channelRow = channelLabel
      ? `<tr><th>نوع الجلسة</th><td>${escapeHtml(channelLabel)}</td></tr>`
      : "";
    const specialtyRow = consultation.specialty
      ? `<tr><th>التخصص</th><td>${escapeHtml(consultation.specialty)}</td></tr>`
      : "";
    const lawyerRow = consultation.lawyerName
      ? `<tr><th>المحامي</th><td>${escapeHtml(consultation.lawyerName)}</td></tr>`
      : "";
    const statusRow = consultation.requestStatusLabel
      ? `<tr><th>حالة الطلب</th><td>${escapeHtml(consultation.requestStatusLabel)}</td></tr>`
      : "";
    // Only when there is a figure. A printed «٠ ر.س» reads as a priced service
    // that came to nothing, and free bookings are the common case.
    const priceRow = consultation.price > 0
      ? `<tr><th>المبلغ المسجّل على الطلب</th><td>${escapeHtml(consultation.price.toLocaleString("ar-SA"))} ر.س</td></tr>`
      : "";
    const requestText = consultation.topic.trim();
    // A real delivered opinion, when the «حالة الاستشارة» card found one on
    // the consultations row — never NO_OPINION_AR printed under the same
    // «الرأي القانوني» heading as the actual text, which would hand the
    // client a document contradicting itself.
    const opinionDeliveredDate = isoDatePartAr(consultationStatusRow?.opinion_delivered_at);
    const opinionNoticeHtml = consultationStatusRow?.opinion_delivered_at
      ? `${escapeHtml(consultationStatusRow.opinion_text?.trim() || "سُلِّم رأي قانوني على هذه الاستشارة.")}` +
        (opinionDeliveredDate ? `<br/><br/><strong>تاريخ التسليم:</strong> ${escapeHtml(opinionDeliveredDate)}` : "")
      : escapeHtml(NO_OPINION_AR);

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
      <head>
        <title>نسخة من طلب استشارة قانونية — منصة نظامي</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
        <style>
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Tajawal', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #ffffff;
            color: #1f2937;
            margin: 40px;
            line-height: 1.6;
            direction: rtl;
          }
          .header {
            border-bottom: 3px solid #0B3D2E;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .logo-title {
            font-size: 22px;
            font-weight: 900;
            color: #0B3D2E;
          }
          .date {
            font-size: 12px;
            color: #6b7280;
          }
          .title {
            font-size: 20px;
            font-weight: 900;
            color: #111827;
            margin-bottom: 8px;
            text-align: center;
          }
          .subtitle {
            font-size: 12px;
            color: #6b7280;
            text-align: center;
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 15px;
            font-weight: 700;
            color: #0B3D2E;
            border-right: 4px solid #C8A762;
            padding-right: 10px;
            margin-bottom: 15px;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .table th, .table td {
            border: 1px solid #e5e7eb;
            padding: 12px;
            text-align: right;
            font-size: 13px;
          }
          .table th {
            background-color: #f9fafb !important;
            width: 30%;
            font-weight: 700;
          }
          .quote {
            background-color: #f9fafb !important;
            border: 1px solid #e5e7eb;
            border-right: 4px solid #9ca3af;
            padding: 20px;
            border-radius: 12px;
            white-space: pre-wrap;
            font-size: 13.5px;
            line-height: 1.7;
          }
          .notice {
            background-color: #fffbeb !important;
            border: 1px solid #fde68a;
            border-right: 4px solid #d97706;
            padding: 20px;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.8;
            color: #78350f;
          }
          .footer {
            border-top: 1px solid #e5e7eb;
            padding-top: 15px;
            margin-top: 50px;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-title">منصة نظامي</div>
          <div class="date">رقم الطلب: ${escapeHtml(consultation.id)}${dateLine}</div>
        </div>

        <div class="title">نسخة من طلب استشارة قانونية</div>
        <div class="subtitle">وثيقة تعرض الطلب كما أرسله العميل — وليست رأياً قانونياً</div>

        <div class="section">
          <div class="section-title">بيانات الطلب</div>
          <table class="table">
            <tr>
              <th>رقم الطلب</th>
              <td>${escapeHtml(consultation.id)}</td>
            </tr>
            ${titleRow}
            ${channelRow}
            ${specialtyRow}
            ${lawyerRow}
            ${statusRow}
            ${priceRow}
          </table>
        </div>

        <div class="section">
          <div class="section-title">نص الطلب كما أرسله العميل</div>
          <div class="quote">${requestText ? escapeHtml(requestText) : escapeHtml(NO_REQUEST_TEXT_AR)}</div>
        </div>

        <div class="section">
          <div class="section-title">الرأي القانوني</div>
          <div class="notice">${opinionNoticeHtml}</div>
        </div>

        <div class="footer">
          هذه الوثيقة نسخة من طلب مقدَّم عبر منصة نظامي. ليست رأياً قانونياً ولا تقريراً صادراً عن محامٍ، ولا يصح الاستناد إليها أمام أي جهة.
        </div>

        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ─── Loading or Error State ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
          <p className="text-sm font-semibold">جارٍ تحميل بيانات الاستشارة...</p>
        </div>
      </div>
    );
  }

  // ── Unreadable: we asked and got no answer ──
  //
  // This branch comes BEFORE the not-found one on purpose. They are two
  // different statements and the wrong one is the damaging one: telling a
  // client that a consultation they booked does not exist, because a request
  // timed out, is precisely the defect this contract exists to end.
  if (readFailed) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 gap-4 px-6 text-center" dir="rtl">
        <Warning size={40} className="text-rose-500" />
        <h3 className="text-lg font-black">تعذّرت قراءة بيانات الاستشارة</h3>
        <p className="max-w-sm text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          لم تصل بيانات استشاراتك من الخادم. هذا لا يعني أن الاستشارة غير موجودة — لم نتمكن من قراءتها.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            className="px-5 py-2.5 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl"
          >
            إعادة المحاولة
          </button>
          <Link href="/dashboard/client/consultation">
            <button className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-200">
              الرجوع لاستشاراتي
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 gap-4" dir="rtl">
        <Warning size={40} className="text-amber-500" />
        <h3 className="text-lg font-black">الاستشارة غير موجودة</h3>
        <p className="text-xs text-zinc-500">لم نتمكن من العثور على سجل هذه الاستشارة في حسابك.</p>
        <Link href="/dashboard/client/consultation">
          <button className="px-5 py-2.5 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl">
            الرجوع لاستشاراتي
          </button>
        </Link>
      </div>
    );
  }

  // ─── 1. REQUEST RECORD RENDER ───────────────────────────────────────────────
  //
  // Reached by every `ai_workspace` row — which is EVERY consultation booked
  // today, AI path and lawyer path alike, plus the bookings made at
  // /book/consultation (useConsultationForm posts them with
  // `receiver: "ai_workspace"` and no `metadata.mode`). That is why nothing on
  // this screen may present itself as an AI assistant's work: for most of these
  // rows there is no AI in the picture at all, and for the rest there is still
  // no stored output.
  //
  // It is also why the lawyer, the session type and the specialty belong HERE.
  // This is the render a client actually gets; a fix that put them anywhere
  // else put them on a screen nobody reaches.

  if (!consultation.hasChatThread) {
    const bg = isDark ? "bg-[#111418]" : "bg-zinc-50/50";
    const cardBg = isDark ? "bg-zinc-900/60 backdrop-blur-md border-white/10" : "bg-white border-zinc-200/60";
    const requestText = consultation.topic.trim();
    const channelLabel = channelLabelOf(consultation);

    const infoRows: Array<{ k: string; v: string }> = [
      { k: "رقم الطلب", v: consultation.id },
      ...(consultation.title ? [{ k: "عنوان الطلب", v: consultation.title }] : []),
      // The three facts that used to reach no render at all. Each one is
      // present only when the row stores it: an AI question carries a channel
      // and no lawyer, a beta booking carries a mode and a specialty but no
      // lawyer until one is assigned, and a /book/consultation row carries none
      // of the three. A missing value takes its label with it — «المحامي» with
      // nothing after it would be the assertion this pass exists to remove.
      ...(channelLabel ? [{ k: "نوع الجلسة", v: channelLabel }] : []),
      ...(consultation.specialty ? [{ k: "التخصص", v: consultation.specialty }] : []),
      ...(consultation.lawyerName ? [{ k: "المحامي", v: consultation.lawyerName }] : []),
      ...(consultation.date ? [{ k: "تاريخ الإرسال", v: consultation.date }] : []),
      ...(consultation.requestStatusLabel ? [{ k: "حالة الطلب", v: consultation.requestStatusLabel }] : []),
      ...(consultation.price > 0
        ? [{ k: "المبلغ المسجّل على الطلب", v: `${consultation.price.toLocaleString("ar-SA")} ر.س` }]
        : []),
    ];

    return (
      <div className={`flex flex-col h-[100dvh] overflow-hidden ${bg}`} dir="rtl">
        {/* Header */}
        <header className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b backdrop-blur-md ${
          isDark ? "bg-zinc-900/50 border-white/10" : "bg-white border-zinc-200 shadow-sm"
        }`}>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/client/consultation">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.06] hover:bg-white/[0.1] text-zinc-400" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
                <ArrowRight size={17} />
              </motion.button>
            </Link>
            <div>
              <h1 className={`text-[16px] font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
                تفاصيل طلب الاستشارة
              </h1>
              <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                رقم الطلب: {consultation.id}{consultation.date ? ` · أُرسل في ${consultation.date}` : ""}
              </p>
            </div>
          </div>
          {consultation.requestStatusLabel && (
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1 rounded-full border ${STATUS_BADGE[consultation.status]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              {consultation.requestStatusLabel}
            </span>
          )}
        </header>

        {/* Content Workspace */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Request facts — every value below is a stored column, never a derived guess */}
            <div className={`p-6 rounded-[2rem] border relative space-y-4 ${cardBg}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#0B3D2E] flex items-center justify-center shadow-md">
                  <FileText size={26} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-white" style={{ fontFamily: 'var(--font-brand)' }}>
                    بيانات الطلب
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">ما هو مسجَّل في هذا الطلب لدى المنصة</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold pt-2 border-t border-zinc-200/5">
                {infoRows.map(({ k, v }) => (
                  <div key={k} className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.01] border-white/5" : "bg-zinc-50 border-zinc-100"}`}>
                    <span className="opacity-50 block">{k}</span>
                    <span className="opacity-95 mt-1 block text-[13px] leading-relaxed break-words">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* «حالة الاستشارة» — additive: a real consultations row, when one
                matches this request. Unreadable → a one-line notice + retry.
                No match (never asked, or asked and found none) → nothing;
                the request card above already stands on its own. */}
            {consultView === "unreadable" && (
              <div className={`flex items-center justify-between gap-3 px-5 py-3 rounded-2xl border text-[12px] font-bold ${
                isDark ? "bg-amber-900/15 border-amber-700/25 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                <span>تعذّرت قراءة حالة الاستشارة</span>
                <button
                  type="button"
                  onClick={() => setConsultReloadKey((k) => k + 1)}
                  className="flex items-center gap-1 underline underline-offset-2"
                >
                  <ArrowClockwise size={12} /> إعادة المحاولة
                </button>
              </div>
            )}
            {consultationStatusRow && (
              <div className={`p-6 rounded-[2rem] border relative space-y-4 ${cardBg}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#0B3D2E] flex items-center justify-center shadow-md">
                    <CalendarBlank size={24} weight="duotone" className="text-[#C8A762]" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-zinc-900 dark:text-white" style={{ fontFamily: 'var(--font-brand)' }}>
                      حالة الاستشارة
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">آخر ما هو مسجَّل على استشارتك لدى المحامي</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200/5">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full border ${CONSULT_ROW_STATUS_BADGE[consultationStatusRow.status]}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {CONSULTATION_STATUS_AR[consultationStatusRow.status]}
                  </span>
                  {consultationStatusRow.mode && (
                    <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      {CONSULTATION_MODE_AR[consultationStatusRow.mode]}
                    </span>
                  )}
                </div>

                {isoDatePartAr(consultationStatusRow.scheduled_at) && (
                  <div className="flex items-center justify-between text-[12.5px] font-bold py-2 border-t border-zinc-200/5">
                    <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                      <CalendarBlank size={14} /> الموعد
                    </span>
                    <span className="text-zinc-900 dark:text-white">
                      {isoDatePartAr(consultationStatusRow.scheduled_at)}
                      {isoTimePartAr(consultationStatusRow.scheduled_at) ? ` — ${isoTimePartAr(consultationStatusRow.scheduled_at)}` : ""}
                    </span>
                  </div>
                )}

                {typeof consultationStatusRow.duration_minutes === "number" && (
                  <div className="flex items-center justify-between text-[12.5px] font-bold py-2 border-t border-zinc-200/5">
                    <span className="text-zinc-500 dark:text-zinc-400">مدة الجلسة</span>
                    <span className="text-zinc-900 dark:text-white">
                      {countPhraseAr(consultationStatusRow.duration_minutes, DURATION_FORMS) ?? `${toArabicDigits(consultationStatusRow.duration_minutes)} دقيقة`}
                    </span>
                  </div>
                )}

                {/* The delivered legal opinion — a real column, distinct from
                    the honest «no opinion issued» panel below (which speaks
                    only about the request record and is unaware of this
                    table). Rendered only when the lawyer has actually
                    delivered one. */}
                {consultationStatusRow.opinion_delivered_at && (
                  <div className={`p-5 rounded-2xl border space-y-2 ${isDark ? "bg-emerald-900/10 border-emerald-700/25" : "bg-emerald-50 border-emerald-200"}`}>
                    <div className="flex items-center gap-2">
                      <SealCheck size={18} weight="fill" className="text-emerald-500" />
                      <span className={`text-[12.5px] font-black ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>الرأي القانوني</span>
                    </div>
                    {consultationStatusRow.opinion_text && (
                      <p className={`text-[12.5px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-emerald-100/90" : "text-emerald-900"}`}>
                        {consultationStatusRow.opinion_text}
                      </p>
                    )}
                    {isoDatePartAr(consultationStatusRow.opinion_delivered_at) && (
                      <p className={`text-[11px] font-bold ${isDark ? "text-emerald-300/70" : "text-emerald-700/70"}`}>
                        سُلِّم في {isoDatePartAr(consultationStatusRow.opinion_delivered_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* The client's own submitted text — labelled as exactly that */}
            <div className={`p-6 rounded-[2rem] border relative space-y-4 ${cardBg}`}>
              <div className="flex items-center justify-between border-b border-zinc-200/5 pb-3 gap-3">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <FileText size={20} weight="duotone" className="text-[#C8A762]" />
                  <span className="text-[13px] font-black tracking-wider">نص الطلب كما أرسلته</span>
                </div>

                <button
                  onClick={handleCopyReport}
                  className={`p-2 rounded-xl border text-[11px] font-black transition-all flex items-center gap-1.5 ${
                    copied
                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                      : isDark
                        ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                        : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <Copy size={14} />
                  <span>{copied ? "تم نسخ نص الطلب ✓" : "نسخ نص الطلب"}</span>
                </button>
              </div>

              {requestText ? (
                <div className={`p-5 rounded-2xl border leading-relaxed text-[13.5px] font-medium whitespace-pre-wrap break-words ${
                  isDark ? "bg-white/[0.01] border-white/5 text-zinc-200" : "bg-zinc-50 border-zinc-200/60 text-zinc-800"
                }`}>
                  {requestText}
                </div>
              ) : (
                <div className={`p-5 rounded-2xl border text-[13px] font-bold ${
                  isDark ? "bg-white/[0.01] border-white/5 text-zinc-400" : "bg-zinc-50 border-zinc-200/60 text-zinc-500"
                }`}>
                  {NO_REQUEST_TEXT_AR}
                </div>
              )}

              {copyError && (
                <p className="text-[11px] font-bold text-rose-500">{copyError}</p>
              )}
            </div>

            {/* The honest empty state that replaced the fabricated opinion.
                The claim itself — icon, heading and NO_OPINION_AR — is
                rendered ONLY when the «حالة الاستشارة» card above did NOT
                already find a delivered opinion on the real consultations
                row: that card's own claim («لم يصدر رأي قانوني») is a
                statement about that same fact, and showing it beside the
                real opinion above would contradict what the page just
                displayed. The support actions below stay unconditional —
                they are not part of that claim. */}
            <div className={`p-6 rounded-[2rem] border relative space-y-4 ${
              isDark ? "bg-amber-900/10 border-amber-700/25" : "bg-amber-50 border-amber-200"
            }`}>
              {!consultationStatusRow?.opinion_delivered_at && (<>
                <div className="flex items-center gap-2">
                  <Warning size={20} weight="fill" className="text-amber-500" />
                  <span className={`text-[13px] font-black tracking-wider ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                    الرأي القانوني
                  </span>
                </div>
                <p className={`text-[13px] font-semibold leading-relaxed ${isDark ? "text-amber-200/90" : "text-amber-900"}`}>
                  {NO_OPINION_AR}
                </p>
              </>)}
              {consultation.orderHref && (
                <p className={`text-[12px] font-bold leading-relaxed ${isDark ? "text-amber-200/70" : "text-amber-800"}`}>
                  عند إصدار الفريق للمستند يظهر للتحميل في صفحة الطلب.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {consultation.orderHref && (
                  <Link href={consultation.orderHref}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-black border border-[#C8A762]/20"
                    >
                      فتح صفحة الطلب
                    </motion.button>
                  </Link>
                )}
                <a href={supportHref} target="_blank" rel="noopener noreferrer">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`px-4 py-2.5 rounded-xl text-[11px] font-black border flex items-center gap-1.5 ${
                      isDark ? "bg-white/5 border-white/10 text-zinc-200" : "bg-white border-zinc-200 text-zinc-700"
                    }`}
                  >
                    <WhatsappLogo size={14} weight="fill" />
                    مراسلة الفريق عبر واتساب
                  </motion.button>
                </a>
              </div>
            </div>

            {/* Actions */}
            <div className={`p-6 rounded-[2rem] border relative space-y-3 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed">
                  {consultationStatusRow?.opinion_delivered_at
                    ? "يمكنك تنزيل نسخة مطبوعة من هذا الطلب. النسخة تتضمن نص طلبك وبياناته والرأي القانوني المسلَّم عليه."
                    : "يمكنك تنزيل نسخة مطبوعة من هذا الطلب. النسخة تتضمن نص طلبك وبياناته فقط، ولا تتضمن رأياً قانونياً."}
                </p>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDownloadPDF}
                    className="px-5 py-2.5 rounded-xl bg-[#0B3D2E] hover:bg-[#0a3328] text-white text-[11px] font-black shadow-md flex items-center gap-2 border border-[#C8A762]/20"
                  >
                    <FileArrowUp size={14} weight="bold" />
                    <span>تنزيل نسخة من الطلب PDF</span>
                  </motion.button>
                  {/* Plain booking link: the wizard never read the `escalate`
                      query parameter this button used to send, so the label now
                      says what actually happens — it opens a new booking. */}
                  <Link href="/dashboard/client/consultation/new">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2.5 rounded-xl bg-[#C8A762]/10 hover:bg-[#C8A762]/20 text-[#C8A762] text-[11px] font-black border border-[#C8A762]/20"
                    >
                      حجز استشارة مع محامٍ
                    </motion.button>
                  </Link>
                </div>
              </div>
              {printError && (
                <p className="text-[11px] font-bold text-rose-500">{printError}</p>
              )}
            </div>

          </div>
        </div>

        {/* Branded Footer disclaimer */}
        <footer className={`flex-shrink-0 flex items-center justify-center gap-2 py-3 text-[11px] font-bold border-t text-center px-4 ${
          isDark ? "text-zinc-500 border-white/5 bg-zinc-900/30" : "text-zinc-500 border-zinc-200 bg-zinc-50/30"
        }`}>
          <Warning size={14} weight="fill" className="flex-shrink-0" />
          <span>لا يصدر عن هذه الصفحة رأي قانوني؛ الرأي يصدر من محامٍ معتمد بعد مراجعة الطلب.</span>
        </footer>
      </div>
    );
  }

  // ─── 2. LAWYER INTERACTIVE CHAT PANEL RENDER ────────────────────────────────
  //
  // Rows written with a receiver other than "ai_workspace" — in practice, rows
  // created before the receiver fix. There is no AI counterpart down here: the
  // AI path has always been written to `ai_workspace`, so it takes the record
  // render above.

  const bg = isDark ? "bg-zinc-950" : "bg-zinc-50";
  const chatChannelLabel = channelLabelOf(consultation);
  // The one place a name has to be non-empty: this header prints it as the
  // person the client is talking to. Everywhere else the row is omitted
  // instead. «بانتظار تعيين المحامي» states the absence rather than filling it.
  const lawyerDisplayName = consultation.lawyerName ?? "بانتظار تعيين المحامي";

  return (
    <div className={`flex h-[100dvh] flex-col ${bg}`} dir="rtl">

      {/* Header */}
      <header className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-[20px] ${isDark ? "bg-zinc-950/90 border-white/[0.06]" : "bg-white/90 border-zinc-200"}`}>
        <Link href="/dashboard/client/consultation">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.06] hover:bg-white/[0.1] text-zinc-400" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
            <ArrowRight size={17} />
          </motion.button>
        </Link>

        {/* Lawyer Info details */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            {/* Fixed mark, not a receiver-derived one: this render is only
                reached by non-`ai_workspace` rows, so the counterpart is
                always a lawyer. The old code chose between an «AI» avatar and
                this one on `receiver`, which meant every row got the AI mark. */}
            <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center shadow-md">
              {consultation.lawyerName?.trim()
                ? <span className="text-white font-extrabold text-sm">{consultation.lawyerName.trim().charAt(0)}</span>
                : <User size={20} weight="bold" className="text-white" />}
            </div>
          </div>
          <div className="min-w-0">
            <p className={`text-[14px] font-bold truncate ${isDark ? "text-white" : "text-zinc-900"}`}>
              {lawyerDisplayName}
            </p>
            {/* The client's chosen branch of law, when the row records one. It
                used to fall back to «استشارة قانونية» — a specialisation
                asserted under a verification seal for a row that names none. */}
            {consultation.specialty && (
              <div className="flex items-center gap-1.5">
                <SealCheck size={11} weight="fill" className="text-[#C8A762]" />
                <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{consultation.specialty}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions.
            The call and video buttons that stood here had no onClick and no
            call feature behind them — two live-looking controls that did
            nothing when pressed. The AI toggle is rendered only when there is a
            chat pane for it to open, because its panel lives inside
            SessionChatPane. */}
        {chatRoomId && (
          <div className="flex items-center gap-1.5">
            <motion.button
              whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }}
              onClick={() => setShowAIPanel(!showAIPanel)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${showAIPanel
                ? "bg-[#0B3D2E] text-[#C8A762]"
                : isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
              }`}>
              <Robot size={16} />
            </motion.button>
          </div>
        )}
      </header>

      {/* Body */}
      {chatLoading ? (
        <div className={`flex-1 flex items-center justify-center text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          جارٍ تحميل المحادثة...
        </div>
      ) : chatRoomId ? (
        <>
          {/* The room opened but its history did not. Its own banner, above the
              transient one: what is on screen below is NOT the whole thread,
              and an empty-looking thread says the lawyer never replied. */}
          {chatUnreadable && (
            <div className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-bold border-b ${
              isDark
                ? "bg-rose-900/20 border-rose-700/20 text-rose-300"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}>
              <span>تعذّرت قراءة الرسائل السابقة — ما يظهر أدناه ليس كامل المحادثة.</span>
              <button
                type="button"
                onClick={() => setChatReloadKey(k => k + 1)}
                className="underline underline-offset-2"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {chatNotice && (
            <div className={`flex-shrink-0 px-4 py-2 text-center text-[11px] font-bold border-b ${
              isDark
                ? "bg-amber-900/20 border-amber-700/20 text-amber-300"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              {chatNotice}
            </div>
          )}
          <SessionChatPane
            // Built explicitly rather than spread. The pane's own Consultation
            // shape is not this page's — it asks for four lawyer fields, a
            // `time` and a `duration` — and spreading hid which of its labels
            // each value ends up under. Every line below names where the value
            // is going.
            consultation={{
              id: consultation.id,
              // The pane's union is "in-person" | "video" | "ai"; the four
              // LawyerMode values do not fit it and nothing in
              // SessionChatPane.tsx reads this field. Never "ai": an AI row is
              // written to `ai_workspace` and takes the record render above.
              type: consultation.channel === "in-person" ? "in-person" : "video",
              status: consultation.status,
              lawyerName: lawyerDisplayName,
              // The pane prints this under «النوع» (SessionChatPane.tsx:413),
              // not as a specialisation — so it gets the session type, which is
              // what that label asks for. Never "": an empty value under a
              // label is a field claiming to exist with nothing behind it.
              lawyerSpecialty: chatChannelLabel ?? "غير محددة",
              lawyerInitial: "ن",
              lawyerColor: "bg-emerald-600",
              topic: consultation.topic,
              date: consultation.date,
              // NEITHER FIELD HAS A SOURCE, and both are required by the pane.
              // No creator of these rows writes `metadata.time`, and the
              // hardcoded "60 دق" that used to sit in `duration` was wrong for
              // every 30-minute booking (`video-short`) — the pane prints it
              // verbatim under «المدة» in its session panel, so it was a
              // duration the client never bought. The request carries no
              // recorded duration, and saying so is the only honest value
              // available; deriving one needs a real minutes field on the
              // service catalogue.
              time: "",
              duration: "غير محددة",
              price: consultation.price,
            }}
            messages={messages}
            input={input}
            setInput={setInput}
            showAIPanel={showAIPanel}
            setShowAIPanel={setShowAIPanel}
            sessionTimeLeft={sessionTimeLeft}
            isDark={isDark}
            sendMessage={sendMessage}
          />
        </>
      ) : (
        /* No room means no endpoint that could store a message. Rendering the
           chat pane here would put a composer on screen whose text goes
           nowhere — which is exactly what «تم تسجيل رسالتك» used to cover up.
           Show the reason and a channel that actually reaches the team. */
        <div className="flex-1 overflow-y-auto px-4 py-10">
          <div className={`max-w-md mx-auto rounded-3xl border p-7 text-center space-y-4 ${
            isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70"
          }`}>
            <div className="flex justify-center">
              <Warning size={30} weight="fill" className={chatUnreadable ? "text-rose-500" : "text-amber-500"} />
            </div>
            {/* THE HEADING VARIES, not just the sentence under it. «لا توجد
                محادثة مباشرة لهذا الطلب» is a verdict on the request; after a
                failed room read it is a verdict we are not entitled to. */}
            <h3 className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>
              {chatUnreadable ? "تعذّرت قراءة المحادثة" : "لا توجد محادثة مباشرة لهذا الطلب"}
            </h3>
            <p className={`text-[12px] font-semibold leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {/* A specific reason when there is one (no session, for
                  instance); otherwise the general one. Either way the heading
                  above already says this is a failed read, not an absence. */}
              {chatUnreadable
                ? chatNotice ?? "لم تصل قائمة المحادثات من الخادم، فلا يمكننا تأكيد وجود محادثة لهذا الطلب من عدمه. لم يُنشأ شيء ولم يُفقد شيء."
                : chatNotice ?? "تعذّر تحميل المحادثة الآن."}
            </p>
            <p className={`text-[11px] font-bold leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              لمتابعة طلبك رقم {consultation.id}، راسل فريق نظامي مباشرة.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {/* `user.userId` is part of the condition because without a
                  session the effect returns at its first line: the retry would
                  re-run the lookup, land in the identical state, and present as
                  a button that does nothing when pressed. */}
              {chatUnreadable && user.userId && (
                <button
                  type="button"
                  onClick={() => setChatReloadKey(k => k + 1)}
                  className="px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-black border border-[#C8A762]/20"
                >
                  إعادة المحاولة
                </button>
              )}
              <a href={supportHref} target="_blank" rel="noopener noreferrer">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-black flex items-center gap-1.5 border border-[#C8A762]/20"
                >
                  <WhatsappLogo size={14} weight="fill" />
                  مراسلة الفريق عبر واتساب
                </motion.button>
              </a>
              <Link href="/dashboard/client/consultation">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`px-4 py-2.5 rounded-xl text-[11px] font-black border ${
                    isDark ? "bg-white/5 border-white/10 text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                  }`}
                >
                  الرجوع لاستشاراتي
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
