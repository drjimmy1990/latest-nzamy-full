"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowClockwise, CalendarBlank, ChatCircle, SealCheck,
  Plus, Robot, MagnifyingGlass, Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { listClientWorkflowRequests } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest, WorkflowRequestStatus } from "@/lib/workflowStore";
import { getConsultations } from "@/lib/services";
import type { ConsultationStatus } from "@/lib/services/consultationVocabulary";
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";
import { SkeletonList } from "../_components/DashboardSkeleton";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import {
  MODE_COPY,
  CHANNEL_LABEL,
  readConsultChannel,
  type ConsultChannel,
} from "@/constants/clientConsultationData";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The three session states this list is able to distinguish.
 *
 * There is NO "active". The union used to carry one, and it drove a pulsing
 * «جلسة نشطة الآن!» banner plus a countdown ring — but nothing in this codebase
 * reports that a consultation session is running, so no row could ever reach it
 * and the whole apparatus was unreachable fabrication waiting to be "fixed" by
 * pointing `assigned` at it. Same ruling as the detail page's
 * CONSULT_STATUS_BY_REQUEST_STATUS comment ([id]/page.tsx): a queue state is not
 * a live session.
 */
type ConsultStatus = "upcoming" | "completed" | "cancelled";

// ConsultChannel — how the consultation is delivered — is now declared beside
// MODE_COPY in src/constants/clientConsultationData.ts, because the detail page
// needs the same union and the same Arabic wording. It was declared locally
// here and a third copy of «نظامي AI» was about to be typed into
// [id]/page.tsx; two screens naming the same stored `metadata.mode`
// differently is the drift this codebase keeps closing.

interface Consultation {
  id: string;
  /**
   * null when the row does not record how the consultation is delivered — in
   * either of the two keys readConsultChannel() understands. A null channel
   * renders NO type badge rather than a guessed one; see the note on
   * toConsultation below.
   */
  channel: ConsultChannel | null;
  status: ConsultStatus;
  /** The request's own status wording — see REQUEST_STATUS_AR. */
  requestStatusLabel: string;
  /** The stored request title, as the booking wizard wrote it. */
  title: string;
  /** Who delivers it, when the row says. null while no lawyer is named. */
  provider: string | null;
  /** `metadata.specialty`, or null — never a generic stand-in. */
  specialty: string | null;
  /** The client's own submitted text. Never an answer. */
  topic: string;
  /** Formatted submission date, or "" when the row carries no usable timestamp. */
  date: string;
  /** Formatted appointment date — service rows only, "" when none is set. */
  scheduledDate: string;
  /** The figure recorded on the row. null when there is none to show. */
  price: number | null;
  /** Real stored notes (service rows). Never a synthesised sentence. */
  notes?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Channel badges. The wording comes from CHANNEL_LABEL and the icons from
 * MODE_COPY rather than being retyped here, on the same rule the rest of this
 * codebase follows for intake labels: the badge a client reads here, the badge
 * on the detail record, and the button they pressed in the wizard must never
 * drift apart. Only the colours belong to this file.
 */
const CHANNEL_CONFIG: Record<ConsultChannel, { icon: React.ElementType; label: string; color: string }> = {
  "in-person": { icon: MODE_COPY["in-person"].Icon, label: CHANNEL_LABEL["in-person"], color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  video:       { icon: MODE_COPY.video.Icon,        label: CHANNEL_LABEL.video,        color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400" },
  voice:       { icon: MODE_COPY.voice.Icon,        label: CHANNEL_LABEL.voice,        color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400" },
  text:        { icon: MODE_COPY.text.Icon,         label: CHANNEL_LABEL.text,         color: "text-zinc-600 bg-zinc-100 dark:bg-white/5 dark:text-zinc-300" },
  ai:          { icon: Robot,                        label: CHANNEL_LABEL.ai,           color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" },
};

const STATUS_CONFIG: Record<ConsultStatus, { label: string; dot: string; badge: string }> = {
  upcoming:  { label: "قيد المتابعة", dot: "bg-blue-500",  badge: "text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-700/30" },
  completed: { label: "مكتملة",       dot: "bg-zinc-400",  badge: "text-zinc-600 bg-zinc-500/10 dark:text-zinc-300 border-zinc-200 dark:border-white/10" },
  cancelled: { label: "ملغية",        dot: "bg-rose-400",  badge: "text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 border-rose-200 dark:border-rose-700/30" },
};

/**
 * Request status → the coarse state this list filters on.
 *
 * WHY a total map instead of the ternary chain that stood here: that chain read
 * `completed ? "completed" : pending_payment ? "upcoming" : "upcoming"`, so a
 * CANCELLED request was filed and painted «قادمة» — the same defect the detail
 * page fixed for itself, still live on the list that links to it.
 *
 * DUPLICATED, deliberately: this map and REQUEST_STATUS_AR below are copies of
 * the two in [id]/page.tsx. Extracting them into src/lib is the right home, but
 * that file is not mine this pass; the extraction is reported as a follow-up.
 * Both copies are `Record<WorkflowRequestStatus, …>`, so a new request status is
 * a compile error in both places rather than another silent «قادمة».
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
 * The request's own status in Arabic — copied from [id]/page.tsx, which copied
 * it from ORDER_STATUS_AR (src/lib/services/serviceOrders.ts). Three coarse
 * states cannot say «بانتظار الدفع» apart from «قيد التنفيذ», and a client
 * whose request nobody has picked up yet must not be told a session is coming.
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
 * The status union of a `getConsultations()` row — consultationVocabulary.ts's
 * `ConsultationStatus` (5 values; 20260905_phase3 added `no_show` and put a
 * real CHECK behind the column, which is why this is imported rather than
 * re-typed — house rule: vocabularies come from consultationVocabulary.ts /
 * contractVocabulary.ts, never a second hand-typed list).
 */
type ServiceConsultStatus = ConsultationStatus;

// This page's ConsultStatus has no fourth bucket for a no-show — it is not
// "upcoming" (nothing is coming) and not really "completed" either, so it
// joins "cancelled": the same "session did not happen" shelf a client reads
// as ملغية. Widening ConsultStatus itself is the real fix but redesigns this
// page's filter chips/counts, which is out of scope here.
const CONSULT_STATUS_BY_SERVICE_STATUS: Record<ServiceConsultStatus, ConsultStatus> = {
  requested: "upcoming",
  scheduled: "upcoming",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "cancelled",
};

const SERVICE_STATUS_AR: Record<ServiceConsultStatus, string> = {
  requested: "بانتظار الاستلام",
  scheduled: "موعد مجدول",
  completed: "مكتمل",
  cancelled: "ملغى",
  no_show: "لم يحضر",
};

/**
 * The real date, or "" when there is none to show.
 *
 * Same rule as formatRequestDate() in [id]/page.tsx: this field used to read
 * `metadata.day ?? "محفوظ الآن"` and `metadata.time ?? "قيد الجدولة"` — two keys
 * that NO creator of these rows writes (neither this wizard nor
 * useConsultationForm), so both fallbacks were printed on every card. «قيد
 * الجدولة» in particular told the client scheduling was under way when nothing
 * had been scheduled at all.
 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

/** `metadata.x` as a non-empty string, or null. Never "null"/"undefined". */
function metaString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Consultation Card ─────────────────────────────────────────────────────────

function ConsultCard({ c, isDark }: { c: Consultation; isDark: boolean }) {
  const status = STATUS_CONFIG[c.status];
  const channel = c.channel ? CHANNEL_CONFIG[c.channel] : null;
  const ChannelIcon = channel?.icon;

  return (
    <motion.div
      layoutId={`consult-${c.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={`relative rounded-[2rem] border overflow-hidden transition-all duration-300 ${
        isDark
          ? "bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 hover:border-[#C8A762]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "bg-white border-zinc-200 hover:border-[#0B3D2E]/20 hover:shadow-lg hover:shadow-[#0B3D2E]/5"
      }`}
    >
      <Link href={`/dashboard/client/consultation/${c.id}`} className="block p-6">
        <div className="flex items-start gap-4">
          {/* Avatar. The robot mark is for the AI path ONLY — it used to be
              driven by `receiver === "ai_workspace"`, which is now the receiver
              of EVERY consultation booking (the fulfilment queue filters on it),
              so a ٧٠٠ ر.س in-person session with a lawyer was drawn as a robot
              and named «نظامي AI». */}
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md ${
            c.channel === "ai" ? "bg-[#0B3D2E]" : "bg-emerald-600"
          }`}>
            {c.channel === "ai"
              ? <Robot size={24} weight="duotone" className="text-[#C8A762]" />
              : <span className="text-white font-extrabold text-sm">ن</span>}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header: title & status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm text-gray-900 dark:text-white" style={{ fontFamily: 'var(--font-brand)' }}>
                    {c.title}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-0.5 rounded-full border ${status.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {c.requestStatusLabel}
                  </span>
                </div>
                {/* Provider and specialty are each dropped when the row does not
                    carry them — no «استشارة قانونية» filler under a booking
                    whose specialisation was never recorded. */}
                {(c.provider || c.specialty) && (
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 font-medium flex items-center gap-1.5 flex-wrap">
                    {c.provider && (
                      <span className="flex items-center gap-1">
                        {c.channel !== "ai" && <SealCheck size={12} weight="fill" className="text-[#C8A762]" />}
                        {c.provider}
                      </span>
                    )}
                    {c.provider && c.specialty && <span className="opacity-40">·</span>}
                    {c.specialty && <span>{c.specialty}</span>}
                  </p>
                )}
              </div>

              {/* Channel badge — omitted entirely when the row does not record
                  the delivery channel, rather than defaulting to «مرئية». */}
              {channel && ChannelIcon && (
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-xl w-max ${channel.color}`}>
                  <ChannelIcon size={12} weight="fill" />
                  {channel.label}
                </span>
              )}
            </div>

            {/* The client's own text */}
            {c.topic && (
              <p className="text-[13px] text-gray-700 dark:text-zinc-300 leading-relaxed font-medium mb-3 line-clamp-2">
                {c.topic}
              </p>
            )}

            {/* Meta row. Every item here is a stored value; anything the row
                does not carry is absent, not zero-filled. There is no «المدة»
                item: the minutes a client bought live only inside the Arabic
                label in src/constants/clientServiceCatalog.ts and are not
                recoverable from the request, and the hardcoded «٦٠ دق» that
                used to sit here was simply wrong for every ٣٠-minute booking. */}
            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-zinc-500 flex-wrap font-semibold">
              <span className="font-mono text-[11px] tracking-tight">{c.id}</span>
              {c.date && (
                <span className="flex items-center gap-1.5">
                  <CalendarBlank size={14} />
                  أُرسل في {c.date}
                </span>
              )}
              {c.scheduledDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarBlank size={14} />
                  الموعد: {c.scheduledDate}
                </span>
              )}
              {/* Only above zero. A «٠ ر.س» chip reads as a priced service that
                  came to nothing, and a free booking is the common case — the
                  same rule the printable copy applies at [id]/page.tsx. */}
              {c.price !== null && c.price > 0 && (
                <span className="text-gray-800 dark:text-zinc-200 font-bold bg-[#C8A762]/10 px-2 py-0.5 rounded-lg border border-[#C8A762]/10">
                  المبلغ المسجّل: {c.price.toLocaleString("ar-SA")} ر.س
                </span>
              )}
            </div>

            {c.notes && (
              <div className={`text-xs rounded-xl px-4 py-2.5 mt-3 border leading-relaxed font-medium ${
                isDark ? "bg-white/[0.03] border-white/10 text-zinc-300" : "bg-zinc-50 border-zinc-200 text-zinc-600"
              }`}>
                <span className="font-bold">ملاحظات: </span>{c.notes}
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterStatus = "all" | ConsultStatus;

/**
 * One `service_requests` row of type `consultation` → the card this page draws.
 *
 * Hoisted out of the effect it used to live in so the loader below can be a
 * plain `useCallback`; it closes over nothing but module constants.
 */
const toConsultation = (request: WorkflowRequest): Consultation => {
  // The channel comes from `metadata.mode`, NOT from `receiver`. Every
  // consultation booking is written with `receiver: "ai_workspace"` because
  // that literal is the whole of "the fulfilment queue can see this row"
  // (api/v1/admin/service-orders/route.ts:54) — it says nothing about who
  // does the work. Keying the AI badge off it labelled every human booking
  // «نظامي AI». `metadata.mode` is "ai" exactly on the AI path and one of
  // the four LawyerMode values otherwise.
  //
  // readConsultChannel() is the shared reader — the detail page needs the
  // identical decision on the identical keys. It also reads
  // /book/consultation's `consultTypeId`, whose three HUMAN values are the
  // same vocabulary: those rows used to get no badge at all, and the
  // comment that stood here said so, but the fact was recorded on them the
  // whole time under the other name.
  //
  // That reader deliberately refuses "ai" from `consultTypeId` — read its
  // comment before widening it. This card is why: the avatar below draws a
  // robot and `provider` reads «نظامي AI» for an "ai" channel, and a
  // /book/consultation «نظامي AI» booking opens no assistant — its own
  // form says the نظامي team executes it. That would be this page's old
  // receiver-keyed defect walked back in through a different key.
  const channel = readConsultChannel(request.metadata);
  return {
    id: request.id,
    channel,
    status: CONSULT_STATUS_BY_REQUEST_STATUS[request.status] ?? "upcoming",
    requestStatusLabel: REQUEST_STATUS_AR[request.status] ?? "حالة غير معروفة",
    title: metaString(request.title) ?? "طلب استشارة",
    // `metadata.lawyerName` — the key the booking wizard actually writes.
    // Both consultation pages used to read `metadata.lawyer`, which nothing
    // writes, so a client who picked a specific lawyer never saw that choice
    // reflected anywhere.
    provider: channel === "ai"
      ? "نظامي AI"
      : metaString(request.metadata?.lawyerName) ?? "بانتظار تعيين المحامي",
    specialty: metaString(request.metadata?.specialty),
    topic: request.description ?? "",
    date: formatDate(request.createdAt),
    scheduledDate: "",
    price: request.payment.amount,
  };
};

export default function ConsultationListPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [filter, setFilter]     = useState<FilterStatus>("all");
  const [search, setSearch]     = useState("");
  /**
   * ONE `ListRead` PER SOURCE, NOT ONE FOR THE MERGE.
   *
   * This page reads two independent lists — the `consultations` table and this
   * client's `service_requests` rows — and it has always been able to say that
   * one of them failed while the other answered. A single merged read cannot
   * express that: «تعذّر تحميل بعض مصادر الاستشارات» needs to know WHICH half
   * is missing, and a merge that succeeded once and failed once is neither
   * `ok: true` nor `ok: false`.
   *
   * ── THE BUG THIS REPLACES ───────────────────────────────────────────────
   * `serviceFailed` and `workflowFailed` were set inside `.catch()` blocks
   * attached to `getConsultations()` and `listClientWorkflowRequests()`. Both
   * now return `ok: false` instead of rejecting (see listRead.ts — a value
   * that carries its own failure survives a Promise.all, which is the whole
   * reason it is a value), and neither can reject on the paths these two
   * calls take: `getConsultations` ends in `catch { return listFailed() }`
   * (casesService.ts), and `listClientWorkflowRequests` reads `page.degraded`
   * off `fetchWorkflowRequests`, whose own catch returns
   * `{ requests: [], degraded: true }` rather than throwing
   * (clientWorkflowRepository.ts). So those two catches could no longer fire,
   * and the amber banner they drive would have died silently: the page would
   * have gone back to answering an unreadable source with «لا توجد استشارات».
   * Satisfying the compiler alone — casting `[]` to a `ListRead` — would have
   * shipped exactly that. The check moved to `.ok`, which is a property of the
   * value rather than of either module's internals; the `.catch()` on the
   * effect below is what still covers a reader that starts throwing again.
   */
  const [serviceRead, setServiceRead] = useState<ListRead<Consultation> | null>(null);
  const [workflowRead, setWorkflowRead] = useState<ListRead<Consultation> | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped by «إعادة المحاولة»; the effect below refetches when it changes. */
  const [attempt, setAttempt] = useState(0);

  /**
   * Both sources, mapped to this page's card shape, RETURNED rather than
   * written to state: the effect below owns the write, so a reply that arrives
   * after a retry (or after unmount) cannot overwrite a newer one.
   */
  const load = useCallback(async (): Promise<{
    service: ListRead<Consultation>;
    workflow: ListRead<Consultation>;
  }> => {
    const [serviceRes, workflowRes] = await Promise.all([
      getConsultations(),
      listClientWorkflowRequests({ requesterUserId: user.userId }),
    ]);

    return {
      service: serviceRes.ok
        ? listOk(
            // `sc` is a raw `consultations` row (casesService.ts), not this
            // page's card shape — the mapping is inline so its type stays
            // inferred rather than re-declared under a name that collides
            // with the local `Consultation` interface.
            serviceRes.items.map((sc): Consultation => {
              const scStatus = sc.status as ServiceConsultStatus;
              return {
                id: sc.id,
                // `sc.type` is a free-text column, so it is only trusted when
                // it is one of the five channels this page can name.
                channel: sc.type in CHANNEL_CONFIG ? (sc.type as ConsultChannel) : null,
                status: CONSULT_STATUS_BY_SERVICE_STATUS[scStatus] ?? "upcoming",
                requestStatusLabel: SERVICE_STATUS_AR[scStatus] ?? "حالة غير معروفة",
                title: sc.topic || sc.description || "طلب استشارة",
                // `sc.lawyer_id` is a uuid. It was rendered straight into the
                // lawyer-name slot, so the card showed the client a raw
                // identifier and called it their lawyer. We know one is
                // assigned; we do not know the name, and this says exactly
                // that much.
                provider: sc.lawyer_id ? "محامٍ معيَّن" : "بانتظار تعيين المحامي",
                specialty: null,
                topic: sc.description || "",
                date: formatDate(sc.created_at),
                scheduledDate: formatDate(sc.scheduled_at),
                // These rows carry no amount column at all. It used to be
                // filled in as 0, which rendered «٠ ر.س» — a stated price,
                // invented.
                price: null,
                // `notes` was dropped from casesService.ts's `Consultation`
                // (2026-09-05, phase 3): it was never a real column on this
                // row — the lawyer's private notes live in
                // `consultation_notes`, which this client-facing read never
                // sees (DECISION 3). This card's own `notes` field stays
                // optional and simply goes unset for service-sourced rows,
                // same as it already does for workflow-sourced ones
                // (toConsultation below never sets it either).
              };
            }),
          )
        : listFailed<Consultation>(),

      workflow: workflowRes.ok
        ? listOk(workflowRes.items.filter((r) => r.type === "consultation").map(toConsultation))
        : listFailed<Consultation>(),
    };
  }, [user.userId]);

  useEffect(() => {
    // Wait for the session. Querying with an unresolved userId returns nothing,
    // and this page answers "nothing" with «لا توجد استشارات» — a statement
    // about the client's own records, made before we know whose they are.
    // `loading` is deliberately NOT cleared here: while the session is
    // resolving the page is still waiting, and listViewState(false, null)
    // would call that 'unreadable' and flash a failure at every visitor.
    if (user.loading) return;
    let cancelled = false;
    // Every setState below runs after an await, so nothing here is synchronous
    // with the effect body — which is also why no eslint-disable is needed for
    // react-hooks/set-state-in-effect on this one.
    load()
      .then(({ service, workflow }) => {
        if (cancelled) return;
        setServiceRead(service);
        setWorkflowRead(workflow);
      })
      .catch((err) => {
        // Neither reader rejects any more — they return `ok: false`. This is
        // for a fault in the mapping above, which would otherwise leave the
        // page spinning for ever.
        console.error("[consultation list] load failed:", err);
        if (cancelled) return;
        setServiceRead(listFailed<Consultation>());
        setWorkflowRead(listFailed<Consultation>());
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, user.loading, attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setServiceRead(null);
    setWorkflowRead(null);
    setAttempt((n) => n + 1);
  }, []);

  const serviceView = listViewState(loading, serviceRead);
  const workflowView = listViewState(loading, workflowRead);
  const bothUnreadable = serviceView === "unreadable" && workflowView === "unreadable";
  const anyUnreadable = serviceView === "unreadable" || workflowView === "unreadable";

  // Workflow requests first, then the consultations table, deduplicated by id —
  // unchanged. itemsOf() answers [] for a source that failed, so a half-broken
  // read shows the half that answered instead of nothing.
  const consultations = useMemo(() => {
    const seen = new Set<string>();
    return [...itemsOf(workflowRead), ...itemsOf(serviceRead)].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [workflowRead, serviceRead]);

  const filtered = consultations.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search) {
      const haystack = `${c.title} ${c.topic} ${c.provider ?? ""} ${c.specialty ?? ""} ${c.id}`;
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const counts = {
    all:       consultations.length,
    upcoming:  consultations.filter(c => c.status === "upcoming").length,
    completed: consultations.filter(c => c.status === "completed").length,
    cancelled: consultations.filter(c => c.status === "cancelled").length,
  };

  /**
   * True only when BOTH sources answered. A count over a half-read merge is
   * not this client's consultation count, and «الكل ٣» printed under a banner
   * admitting a source could not be read is the same figure-beside-an-
   * admission this sweep removed from «طلباتي» and «قضاياي». Withheld rather
   * than zeroed — «٠» is a claim.
   */
  const countsKnown = !anyUnreadable && !loading;

  const FILTERS: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all",       label: "الكل",         count: counts.all },
    { key: "upcoming",  label: "قيد المتابعة", count: counts.upcoming },
    { key: "completed", label: "مكتملة",       count: counts.completed },
    { key: "cancelled", label: "ملغية",        count: counts.cancelled },
  ];

  return (
    <div className={`p-6 md:p-8 max-w-[1000px] mx-auto ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl" suppressHydrationWarning>

      {loading ? (
        <div className="mt-8"><SkeletonList count={4} /></div>
      ) : (
      <>
      {/* Error banner. Two sentences, because two facts: everything is missing,
          or half of it is. Both carry a retry that refetches both sources —
          re-reading the one that answered costs a request and keeps the merge
          consistent. */}
      {anyUnreadable && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={`mb-6 rounded-2xl border p-4 flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Warning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>تعذّرت قراءة الاستشارات</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-red-600/70"}`}>
              {bothUnreadable
                ? "لم نتمكن من قراءة سجل استشاراتك، ولا يمكننا تأكيد ما إذا كانت لديك استشارات."
                : "تعذّرت قراءة أحد مصدري الاستشارات — القائمة أدناه غير مكتملة."}
            </p>
          </div>
          <button
            onClick={retry}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
              isDark ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-300 text-red-700 hover:bg-red-100"
            }`}
          >
            <ArrowClockwise size={13} weight="bold" />
            إعادة المحاولة
          </button>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>استشاراتي</h1>
          <p className={`text-sm mt-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            متابعة جميع استشاراتك القانونية في مكان واحد
          </p>
        </div>
        <Link href="/dashboard/client/consultation/new">
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
          >
            <Plus size={16} weight="bold" />
            استشارة جديدة
          </motion.button>
        </Link>
      </div>

      {/* NOTE: the «جلسة نشطة الآن!» banner that stood here is gone with the
          "active" state it depended on. It named a lawyer and offered a «دخول
          الجلسة» button on the strength of a status no row can hold. */}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث برقم الطلب أو موضوع الاستشارة..."
            className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
              isDark
                ? "bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E] focus:bg-zinc-900"
                : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5"
            }`}
          />
        </div>

        <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl overflow-x-auto ${isDark ? "bg-white/5" : "bg-zinc-100"}`}>
          {FILTERS.map(f => {
            const isActive = filter === f.key;
            return (
              <button key={f.key}
                onClick={() => setFilter(f.key)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm"
                    : isDark ? "text-zinc-400 hover:text-white hover:bg-white/5" : "text-zinc-500 hover:text-zinc-900 hover:bg-white/50"
                }`}
              >
                {isActive && <motion.div layoutId="consultTabActive" className={`absolute inset-0 rounded-xl ${isDark ? "bg-zinc-800" : "bg-white"} shadow-sm -z-10`} />}
                {f.label}
                {/* Withheld, not zeroed, whenever either source failed — see
                    `countsKnown`. The tab still filters what is on screen and
                    claims nothing about what is not. */}
                {countsKnown && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive ? "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-emerald-500/20 dark:text-emerald-400" : isDark ? "bg-white/10 text-zinc-400" : "bg-zinc-200 text-zinc-500"
                  }`}>
                    {f.count.toLocaleString("ar-SA")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className={`text-center py-24 rounded-[2.5rem] border border-dashed ${isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"}`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner ${isDark ? "bg-white/5 text-zinc-600" : "bg-white border border-zinc-100 text-zinc-300"}`}>
                <ChatCircle size={36} weight="duotone" />
              </div>
              {/*
                FOUR DIFFERENT EMPTY SCREENS, because they are four different
                facts, and only the last is allowed to say the client has no
                consultations.

                What stood here was one screen for all four: «لا توجد استشارات»
                over «لا توجد استشارات تطابق بحثك المحدّد أو هذا الفلتر», with
                «احجز استشارتك الأولى» underneath — printed unchanged when BOTH
                sources had failed, directly below the red banner saying so. A
                client whose read broke was told, in the page's largest type,
                that they have never booked a consultation, and invited to book
                their first one.
              */}
              {bothUnreadable ? (
                <>
                  <p className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تعذّر عرض استشاراتك</p>
                  <p className={`text-sm mb-6 max-w-sm mx-auto ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    لم نتمكن من قراءة سجلّك من الخادم، ولا يمكننا تأكيد ما إذا كانت لديك استشارات.
                  </p>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={retry}
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors ${
                      isDark ? "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    <ArrowClockwise size={16} weight="bold" /> إعادة المحاولة
                  </motion.button>
                </>
              ) : anyUnreadable ? (
                <>
                  {/* One source answered and had nothing; the other could not
                      be read. That is not «لا توجد استشارات» — the missing half
                      may well hold some. The banner above carries the retry. */}
                  <p className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد استشارات لعرضها</p>
                  <p className={`text-sm max-w-sm mx-auto ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    تعذّرت قراءة أحد المصدرين، والمصدر الآخر لم يُرجع أي استشارة — لذلك لا يمكننا تأكيد أنه ليست لديك استشارات.
                  </p>
                </>
              ) : consultations.length > 0 ? (
                <>
                  <p className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد استشارات مطابقة</p>
                  <p className={`text-sm mb-6 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>لا تطابق أي من استشاراتك هذا البحث أو هذا الفلتر.</p>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setSearch(""); setFilter("all"); }}
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors ${
                      isDark ? "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    إعادة ضبط البحث
                  </motion.button>
                </>
              ) : (
                <>
                  <p className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد استشارات بعد</p>
                  <p className={`text-sm mb-6 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>لم تحجز أي استشارة حتى الآن — ستظهر هنا فور إرسالها.</p>
                  <Link href="/dashboard/client/consultation/new">
                    <motion.button whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors"
                    >
                      <Plus size={16} weight="bold" /> احجز استشارتك الأولى
                    </motion.button>
                  </Link>
                </>
              )}
            </motion.div>
          ) : (
            filtered.map(c => <ConsultCard key={c.id} c={c} isDark={isDark} />)
          )}
        </AnimatePresence>
      </div>

      </>
      )}
    </div>
  );
}
