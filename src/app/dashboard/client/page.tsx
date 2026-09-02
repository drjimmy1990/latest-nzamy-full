"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Gavel, CalendarBlank, FolderOpen, Coins, Robot, Sparkle,
  ArrowClockwise, ArrowLeft, Clock, ChatCircle,
  FileText, Wallet, Shield,
  Headset, Users, PencilSimple,
  Package, Lightning, WarningCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { CaseCard } from "./_components/CaseCard";
import { DashboardPageSkeleton } from "./_components/DashboardSkeleton";
import { getDashboardSummary, getDocuments } from "@/lib/services";
import type { DashboardSummary, Document as ApiDocument } from "@/lib/services";
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";
import {
  toClientCases,
  toClientDocumentRows,
  activeCasesPhraseAr,
  toArabicDigits,
  formatArabicDate,
} from "@/lib/services/clientDashboardCards";
import { MODE_COPY } from "@/constants/clientConsultationData";
import { fadeUp } from "./_data";

// ─── Row readers ──────────────────────────────────────────────────────────────
//
// /api/v1/dashboard/summary hands this page raw database rows, so every field
// below is read defensively — the same discipline clientDashboardCards.ts
// applies to the case and document rows.
//
// WHY THEY LIVE IN THE PAGE — pure helpers in this codebase belong in
// src/lib/services/ beside a colocated `node --test` file, and that is where
// these should end up. This change is scoped to two files and may not create a
// third; extracting them with tests is the follow-up. readNextAppointment()
// below is the one that most wants it — it is the only helper here with real
// branching.

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A plain JSON object — not null, not an array. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Next appointment ─────────────────────────────────────────────────────────

/**
 * The Arabic name of a `consultations.mode` value.
 *
 * The keys are the column's own CHECK list
 * (20260518_client_workflow_backend_ready.sql:57), and the four lawyer labels
 * are read off MODE_COPY rather than retyped, so the channel a client sees on
 * this card and the button they pressed in the booking wizard cannot drift
 * apart — the same rule /dashboard/client/consultation follows at
 * page.tsx:79-82. «بالذكاء الاصطناعي» is the wizard's own wording for the AI
 * path (consultation/new/page.tsx:371).
 *
 * A value outside the list gets no channel at all rather than a heading
 * printing the raw English token at an Arabic reader.
 */
const CONSULT_MODE_AR: Record<string, string> = {
  "in-person": MODE_COPY["in-person"].label,
  video: MODE_COPY.video.label,
  voice: MODE_COPY.voice.label,
  text: MODE_COPY.text.label,
  ai: "بالذكاء الاصطناعي",
};

/**
 * Statuses that mean this row is NOT an appointment the client is still
 * waiting for.
 *
 * The summary route filters only on `scheduled_at > now()`, so a consultation
 * that was cancelled last week but was booked for next Tuesday still comes
 * back as the client's "next appointment". A deny-list rather than an
 * allow-list because two status vocabularies reach this column: the DDL
 * defaults it to `pending_assignment` (the service_requests words) while
 * casesService.ts:32 types these rows as requested/scheduled/completed/
 * cancelled. An unrecognised status therefore keeps the card — the row really
 * is a future booking — and only a word that positively means "closed" drops
 * it. The route is where this filter belongs; see the follow-up.
 */
const CLOSED_CONSULT_STATUSES = new Set([
  "cancelled", "canceled", "completed", "rejected", "refunded",
]);

/**
 * «اليوم» / «غداً», or null.
 *
 * Deliberately only these two. They are the one thing a client cannot read off
 * the date line beside them, and neither needs Arabic number agreement — «بعد
 * ٣ أيام» would, and that is plural logic with no test behind it in a page
 * file. Anything further out gets no pill, which is why the pill's whole
 * element is conditional below.
 *
 * Compared at local midnight, not by elapsed hours: an appointment at 09:00
 * tomorrow is «غداً» whether it is 22:00 or 02:00 now. Saudi keeps no DST, and
 * Math.round absorbs a ±1h offset anywhere else.
 */
function appointmentDayPillAr(value: unknown): string | null {
  const ms = Date.parse(readText(value));
  if (!Number.isFinite(ms)) return null;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(new Date(ms)) - startOfDay(new Date())) / 86_400_000,
  );
  if (days === 0) return "اليوم";
  if (days === 1) return "غداً";
  return null;
}

/**
 * One raw `consultations` row → the appointment card, or null when there is no
 * honest card to draw.
 *
 * WHAT THE ROUTE SENDS. /api/v1/dashboard/summary query #2 (route.ts:63-73) is
 *   .from("consultations").select("*")
 *     .eq("requester_user_id", uid).gt("scheduled_at", now())
 *     .order("scheduled_at").limit(1).single()
 * so this receives a RAW row: id, request_id, requester_user_id,
 * lawyer_user_id, mode, specialty, scheduled_at, status, metadata, created_at,
 * updated_at (20260518_client_workflow_backend_ready.sql:52-64 — the only later
 * migration adds two reminder flags, 20260706_reminder_flags.sql).
 *
 * THE CAST THIS REPLACES claimed `title`, `lawyer`, `lawyerPhone`, `date`,
 * `time`, `type` and `countdown`. Not one of the seven is a column on that
 * table, so the card rendered an empty amber urgency pill, a blank heading, a
 * «مع » with nothing after it, a bare em dash where the appointment time was
 * promised — and `href="tel:undefined"`, a call button that looked live and
 * dialled nothing. It never white-paged, which is how it shipped, and
 * DEMO_SUMMARY.nextAppointment is null (dashboardService.ts:52), so it fired
 * only for a client who really had a consultation booked.
 *
 * NO TIME OF DAY IS PRINTED, and that is the deliberate half of this. It would
 * have been one line beside the date, and the date line is exactly where the em
 * dash used to be — but nothing in this repository writes a clock time into
 * `scheduled_at`. Its two writers are POST /api/v1/consultations:87
 * (`body.preferred_date ?? null` — a field named for a day, whose only caller,
 * casesService.createConsultation:200, is itself called from nowhere) and the
 * PATCH allow-list at consultations/[id]/route.ts:79. A date-only ISO string is
 * parsed as UTC midnight by the language spec, so rendering its clock in Riyadh
 * would have printed «٣:٠٠ ص» — a 3 AM appointment, invented from a value that
 * was never a time. The date is stated; the hour is omitted with its label.
 *
 * NO LAWYER NAME AND NO PHONE NUMBER, for the same reason as before: the row
 * carries `lawyer_user_id`, a uuid, and the route joins no profile. Whether one
 * is assigned is a fact the row does state, and that is all this says.
 */
function readNextAppointment(value: unknown): {
  heading: string;
  dateLabel: string;
  dayPill: string | null;
  assignedLabel: string | null;
} | null {
  if (!isPlainRecord(value)) return null;

  if (CLOSED_CONSULT_STATUSES.has(readText(value.status).toLowerCase())) return null;

  // The date IS the card. Without a readable `scheduled_at` there is no
  // appointment to announce, so the whole card goes rather than a heading over
  // a missing date.
  const dateLabel = formatArabicDate(value.scheduled_at);
  if (!dateLabel) return null;

  const modeAr = CONSULT_MODE_AR[readText(value.mode)];
  return {
    // «استشارة» alone when the channel is unrecognised: the row is a
    // consultation whatever its mode column says, so the bare word stays true.
    heading: modeAr ? `استشارة ${modeAr}` : "استشارة",
    dateLabel,
    dayPill: appointmentDayPillAr(value.scheduled_at),
    // Omitted, not inverted. A null `lawyer_user_id` means nobody is recorded
    // against the row; «بانتظار تعيين المحامي» would assert an assignment
    // process is under way, which no column here states.
    //
    // EXPECT THIS LINE NEVER TO APPEAR TODAY, and do not go hunting for a bug
    // when it doesn't. Nothing in this repository sets `lawyer_user_id` after
    // the row exists — the PATCH allow-list is ["status", "scheduled_at",
    // "notes"] (consultations/[id]/route.ts:79) — and the booking wizard does
    // not set it at creation either (IS_BETA is true in
    // clientConsultationData.ts, so the system assigns and the client never
    // picks). The branch is kept because the column is real and the day
    // something writes it this card is already correct; it is not kept to
    // display anything now.
    assignedLabel: readText(value.lawyer_user_id) ? "تم تعيين محامٍ" : null,
  };
}

/**
 * The Arabic label for a `community_posts.category` value.
 *
 * The keys are the table's own CHECK list
 * (supabase/migrations/20260603_phase1_004_community_features.sql:39) — this
 * translates a known enum, it does not invent a taxonomy. A value outside the
 * list gets NO pill rather than a pill printing the raw English token.
 *
 * CATEGORIES in src/constants/communityData.ts is not reused: it spells the
 * real-estate key with a hyphen where the column uses an underscore, it is
 * missing four of the column's values, and each of its entries carries a
 * hardcoded `count` this page must not repeat.
 */
const COMMUNITY_CATEGORY_AR: Record<string, string> = {
  general: "عام",
  labor: "عمالي",
  commercial: "تجاري",
  criminal: "جنائي",
  family: "أحوال شخصية",
  real_estate: "عقاري",
  administrative: "إداري",
  intellectual_property: "ملكية فكرية",
  international: "دولي",
  other: "أخرى",
};

export default function ClientDashboard() {
  const { isDark } = useTheme();
  const user = useUser();
  const [aiInput, setAiInput] = useState("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The documents card's read, in the shared three-state shape
   * (`ListRead` + `listViewState()`, src/lib/services/listRead.ts). It was a
   * `documents: ApiDocument[] | null` plus a `documentsFailed` boolean, which
   * said the same thing correctly and said it in a spelling only this file
   * used.
   */
  const [docsRead, setDocsRead] = useState<ListRead<ApiDocument> | null>(null);
  const [docsLoading, setDocsLoading] = useState(true);
  /** Bumped by the card's retry; the documents effect refetches when it moves. */
  const [docsAttempt, setDocsAttempt] = useState(0);

  useEffect(() => {
    // `.catch(console.error)` IS DEAD CODE AND IS LEFT AS A BACKSTOP, not
    // because it does anything. getDashboardSummary() cannot reject: its own
    // body ends in `catch { return { ...DEMO_SUMMARY } }`
    // (src/lib/services/dashboardService.ts:71).
    //
    // THAT FALLBACK IS A DEFECT THIS PAGE CANNOT FIX FROM HERE, and it is worth
    // naming precisely. A failed summary request arrives at this component as a
    // fully-formed object with `activeCases: []`, `communityPreview: []`,
    // `nextAppointment: null` and a `subscription` reading «مجانية» — so the
    // «قضاياي» section silently disappears for a client who has cases, and the
    // welcome line stops mentioning them. It is not a false sentence on screen
    // (the plan card below already refuses to name a plan for exactly this
    // reason, and «قضاياي» hides rather than printing «٠»), but it is an
    // absence asserted where an unreadable state is the truth, and no signal
    // reaches this file to tell the two apart. Sniffing for the fixture — the
    // missing `activeCasesTotal`, say — would be inventing an oracle out of an
    // optional field. dashboardService.ts is not this change's file; making
    // getDashboardSummary() throw, or return a read that carries its failure,
    // is reported as a follow-up.
    getDashboardSummary()
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // The documents card reads the same source the /dashboard/client/documents
  // page reads. getDocuments() THROWS on failure rather than returning [] (see
  // documentService.ts), which is what lets the card tell "you have no files"
  // apart from "we could not read your files" — the two must never render the
  // same sentence.
  useEffect(() => {
    let cancelled = false;
    getDocuments()
      .then((docs) => { if (!cancelled) setDocsRead(listOk(docs)); })
      .catch((e) => {
        if (cancelled) return;
        console.error("[client dashboard] documents fetch failed:", e);
        setDocsRead(listFailed<ApiDocument>());
      })
      .finally(() => { if (!cancelled) setDocsLoading(false); });
    return () => { cancelled = true; };
  }, [docsAttempt]);

  const retryDocuments = useCallback(() => {
    setDocsLoading(true);
    setDocsRead(null);
    setDocsAttempt((n) => n + 1);
  }, []);

  // ── Derived data from summary ──────────────────────────────────────────
  // toClientCases(), not `as ClientCase[]`. The cast this replaces claimed the
  // raw `service_requests` rows already had a `statusColor` — a column that
  // does not exist — and CaseCard then read `.bg` off `undefined`, crashing the
  // whole page for every client who had ever placed an order.
  const MY_CASES = toClientCases(summary?.activeCases);

  // readNextAppointment(), not `as {…}`. DashboardSummary already types this
  // field `unknown` (dashboardService.ts:40) — the cast that stood here was the
  // page asserting seven columns onto a row that has none of them. See the
  // function for what the row really carries.
  const NEXT_APPOINTMENT = useMemo(
    () => readNextAppointment(summary?.nextAppointment),
    [summary?.nextAppointment],
  );

  // `summary.recentMessages` is READ NOWHERE ON THIS PAGE ANY MORE — see the
  // note where the «رسائل المحامين» card used to be, above the documents card.

  // Only the four fields the summary route actually selects
  // (route.ts query #5: `id, title, category, created_at`). The cast this
  // replaces also claimed `tag`, `answers`, `votes`, `isAnswered` and `ago`;
  // not one of them was in the payload, so the card below rendered an empty
  // vote number, an empty category pill, a bare « إجابة» and a «محامٍ»
  // verified badge over a question no lawyer had answered.
  const COMMUNITY_PREVIEW = (summary?.communityPreview ?? []) as {
    id: string;
    title: string;
    category: string;
    created_at: string;
  }[];

  // How many open orders the client really has. The route caps `activeCases`
  // at three rows and returns the exact filtered count beside them, so
  // MY_CASES.length would tell a client with seven that they have three.
  // Read through a local intersection because the DashboardSummary interface
  // (dashboardService.ts) is outside this change; Math.max keeps the printed
  // number from ever being smaller than the number of cards below it.
  const summaryWithTotal = summary as (DashboardSummary & { activeCasesTotal?: number }) | null;
  const rawActiveTotal = summaryWithTotal?.activeCasesTotal;
  const ACTIVE_TOTAL = typeof rawActiveTotal === "number" && Number.isFinite(rawActiveTotal)
    ? Math.max(rawActiveTotal, MY_CASES.length)
    : MY_CASES.length;
  // null at zero, and the welcome sentence disappears with it — «لديك ٠ قضايا»
  // is worse than silence.
  const ACTIVE_PHRASE = activeCasesPhraseAr(ACTIVE_TOTAL);

  /**
   * The account's first name, or empty — never a substitute.
   *
   * `.trim()` before the split so a name that is only whitespace does not
   * produce an empty first token that still reads as truthy downstream.
   */
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Three real files at most. itemsOf() answers [] on every branch but
  // 'ready', so the card cannot list rows it did not read.
  const docsView = listViewState(docsLoading, docsRead);
  const DOC_ROWS = toClientDocumentRows(itemsOf(docsRead), 3);

  // ── Subscription / Plan ───────────────────────────────────────────────
  //
  // WHAT THE ROUTE ACTUALLY SENDS. /api/v1/dashboard/summary query #4 is
  //   .from("subscriptions").select("*, subscription_plans(*)")
  // so `summary.subscription` is a RAW `subscriptions` row — plan_id, tier,
  // billing_cycle, current_period_end, auto_renew — with the catalogue row
  // embedded under `subscription_plans` (name_ar, price_monthly, price_yearly).
  //
  // The block this replaces read `sub.plan`, `sub.name`, `sub.limits` and
  // `sub.used`. NOT ONE of those four is a column on `subscriptions`
  // (supabase/migrations/20260603_phase1_003_subscriptions_billing.sql:29).
  // `sub.plan` was therefore undefined on every account in production, the
  // `?? "free"` turned that into a fact, and the banner told paying
  // subscribers — and companies under contract — «أنت على الباقة المجانية»
  // over a button reading «اشترك الآن».
  //
  // THE THREE USAGE BARS ARE GONE RATHER THAN REPAIRED. `used` has no source
  // anywhere in this codebase: no table, no route, no counter. Every bar drew
  // 0/limit for every client. A measured-looking zero for consumption nobody
  // measures is the same lie as a measured-looking 42.
  //
  // The pay-per-use prices went with them. They were hardcoded here and wrong:
  // «٧٠٠ ر.س» for an AI contract draft that CLIENT_SERVICE_CATALOG prices at
  // 99, «٥ ر.س» for an extra AI question the catalogue prices at 49.
  //
  // NOT useUser().tier either — that is `meta.tier ?? "free"` and cannot tell
  // "never granted" from "granted free", so a corporate account under contract
  // would render «مجاني».
  //
  // DashboardSummary types this field as SubscriptionSummary, which is the
  // shape the demo fixture has and the route does not. It is read through a
  // local narrowing for the same reason ACTIVE_TOTAL is: the interface lives
  // in dashboardService.ts, outside this change.
  const subRow = summary?.subscription as unknown as Record<string, unknown> | null | undefined;

  const PLAN = useMemo(() => {
    if (!subRow) return null;

    // PostgREST returns a to-one embed as an object, and as a one-element
    // array when it cannot prove the cardinality. Accepting only one of the
    // two silently drops the plan's Arabic name on the other.
    const rawEmbed = subRow.subscription_plans;
    const embedded = Array.isArray(rawEmbed) ? rawEmbed[0] : rawEmbed;
    const planRow = embedded && typeof embedded === "object"
      ? (embedded as Record<string, unknown>)
      : null;

    const nameAr = planRow ? readText(planRow.name_ar) : "";
    const planId = readText(subRow.plan_id);
    // Neither field means this is not a subscriptions row at all. In
    // production that is the DEMO_SUMMARY fallback dashboardService.ts returns
    // when the request fails, whose `subscription` is the literal
    // `{ plan: "free", name: "مجانية", … }`. A failed read must never become a
    // statement that the client is on the free plan — it becomes silence.
    if (!nameAr && !planId) return null;

    // NO PRICE IS PRINTED, and this is the deliberate half of the fix.
    // `subscription_plans.price_monthly` is a real column and it would have
    // been easy to render — but nothing in this platform charges it. There is
    // no payment provider (access-control.ts:314, `payments_gateway` is
    // admin-held at "disabled" until one is chosen), and every writer of the
    // `subscriptions` table is an admin route: a plan here is GRANTED, not
    // bought. «٤٩ ر.س/شهر» on a client's dashboard asserts a recurring charge
    // that nothing collects. /pricing sells a different catalogue again —
    // «نظامي AI ٩٩», «التأمين القانوني ٣٩» — with none of the names or figures
    // the subscription_plans seed carries, so a price here would also have
    // contradicted the page the button beside it opens.

    // The validity window, on the other hand, is a plain fact about the row.
    // «سارية حتى» rather than «يتجدد»: renewal implies a charge for the same
    // reason the price does, while «سارية حتى X» stays true whether or not the
    // grant is extended. auto_renew === false adds the one extra thing the row
    // really does say — that it stops there.
    const endsAt = formatArabicDate(subRow.current_period_end);
    const periodLabel = !endsAt
      ? null
      : subRow.auto_renew === false
        ? `تنتهي في ${endsAt}`
        : `سارية حتى ${endsAt}`;

    return {
      // The plan's own Arabic name («الذكية», «الاحترافية»). When the embed
      // came back empty — the catalogue row was deactivated, so the
      // "active plans are public" RLS policy hid it — the plan id is shown
      // rather than a guessed name.
      name: nameAr || planId,
      periodLabel,
    };
  }, [subRow]);

  // ── Quick Services ─────────────────────────────────────────────────────
  //
  // THREE CARDS, NOT FOUR. The fourth was «ابحث عن محامٍ» →
  // /dashboard/client/find-lawyer, badged «مجاني دائماً».
  //
  // THE REASON THAT STANDS ON ITS OWN is a fact about this code:
  // BETA_MONOPOLY_MODE (src/lib/betaConfig.ts) is true, نظامي is the sole
  // provider for the whole beta, and there is therefore no second lawyer to go
  // and find. «احجز استشارة» beside it books the office directly.
  //
  // THE SUPPORTING FACT IS ABOUT DATA, ON A DATE, AND WAS NOT CHECKED FROM
  // HERE. GET /api/v1/lawyers filters on verification_status = 'verified' AND
  // marketplace_visible = true. On 2026-08-27 the controller of this work read
  // lawyer_profiles directly — a REST call with the service key, not an
  // inference drawn from this file — and reported all five rows still
  // `pending` / `false`, so the directory returned zero rows that day and the
  // page could only render empty. That is a snapshot, not an invariant: one
  // admin verifying a lawyer and flipping marketplace_visible ends it, and the
  // emptiness argument goes with it. The line above is what still holds after
  // that.
  //
  // The sidebar entry went the same way; see
  // src/constants/navigation.sidebars.primary.ts for what replaced it there
  // and for what flipping the flag back should restore.
  //
  // NO `planBadge` ON ANY CARD. Those badges were the plan fiction above,
  // rendered four times: «مشمولة ٠/٠», «١/يوم فقط», and two invented prices.
  // Nothing here can price a consultation honestly in any case — the
  // consultation category alone runs from 250 to 700 ر.س across four
  // sub-services in CLIENT_SERVICE_CATALOG, so no single badge is true for
  // the card. /dashboard/client/services prices each one where it is ordered.
  //
  // Constant, so no useMemo: it closes over nothing.
  const QUICK_SERVICES = [
    {
      // The booking wizard itself, not the catalogue — «كل الخدمات» in the
      // section header is the catalogue.
      label: "احجز استشارة",
      href: "/dashboard/client/consultation/new",
      icon: ChatCircle,
      color: "from-[#b5883a] to-[#C8A762]",
      desc: "مع محامي المكتب",
    },
    {
      label: "اسأل نظامي AI",
      href: "/ai/consult",
      icon: Robot,
      color: "from-[#0B3D2E] to-[#1a6b50]",
      desc: "إجابات فورية",
    },
    {
      label: "صياغة عقد",
      href: "/ai/contract-drafter",
      icon: FileText,
      color: "from-[#155c40] to-[#1e7a55]",
      desc: "AI يصيغ لك العقد",
    },
  ];

  if (loading || !summary) return <DashboardPageSkeleton />;

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  return (
    <div
      className={`p-5 md:p-8 space-y-6 max-w-[1200px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
      dir="rtl"
      suppressHydrationWarning
    >

      {/* ── Onboarding Welcome (first-visit only) ── */}
      <OnboardingBanner role="client" name={user.name} isDark={isDark} />

      {/* ══ Section 1 – Welcome Hero ═══════════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Welcome left */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0B3D2E] to-[#0d5238] p-7 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]">
          <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.05]">
            <Shield size={160} weight="fill" />
          </div>
          <div className="relative">
            <div className="flex items-start gap-3 mb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                  {/* «خالد» used to be the fallback here — a literal, so every
                      client whose name had not loaded was greeted by SOMEBODY
                      ELSE'S first name. That is what shot 18 caught: the auditor
                      read «خالد» as the account's name and noted that the
                      sidebar disagreed with it. The sidebar was right; the
                      greeting was inventing a person.
                      A name we do not have is not a name to guess. */}
                  {firstName ? `أهلاً، ${firstName}` : "أهلاً بك"}
                  <Sparkle size={26} weight="fill" className="text-[#C8A762]" />
                </h1>
                {/* Derived, and absent when there is nothing to say. This line
                    was the literal string «لديك قضيتان نشطتان يتابعهما محاموك
                    الآن», printed to every client — including one with no
                    orders at all. The «يتابعهما محاموك» half is gone for a
                    second reason: `service_requests.assigned_to` is routinely
                    null, so nothing in the row supports a claim that a lawyer
                    is acting on it. */}
                {ACTIVE_PHRASE && (
                  <p className="text-emerald-300/70 text-sm mt-1">
                    لديك <strong className="text-white">{ACTIVE_PHRASE}</strong>
                  </p>
                )}
              </div>
              {/* The «تنبيه عاجل» badge that stood here was driven by
                  `ClientCase.urgent`, and no column on service_requests marks a
                  row urgent — it could only ever have been a value someone
                  invented. Removed rather than left permanently dark. */}
            </div>

            {/* HALF-FIX REPAIRED. Ten lines above, the note on ACTIVE_PHRASE
                explains that «يتابعهما محاموك» was deleted because
                `service_requests.assigned_to` is routinely null, so nothing in
                the row supports a claim that a lawyer is acting on it — and
                then this paragraph went on saying «التواصل مع محاميك» anyway,
                plus «قضيتك في أيدٍ أمينة», which assumes a case exists at all.
                Printed to every client, including one who has just registered
                and ordered nothing.
                It now describes what the dashboard offers rather than what the
                account supposedly has, and the case half appears only when
                ACTIVE_PHRASE proves there is a case to talk about. */}
            <p className="text-emerald-100/60 text-sm mb-5 max-w-md leading-relaxed">
              {/* This line must not repeat the buttons under it. Finding 144
                  counts «احجز استشارة» THREE times on this screen, and the
                  greeting copy written in an earlier batch was one of the
                  three — a quick-action button by that exact name sits a few
                  rows below. The sentence now says what the dashboard is for
                  and lets the buttons name the actions. */}
              {ACTIVE_PHRASE
                ? "كل طلباتك ومراحلها في مكان واحد."
                : "ابدأ من الإجراءات أدناه، وتابع كل ما تطلبه من هنا."}
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/client/services">
                <motion.div
                  whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-[#C8A762] text-[#0B3D2E] font-bold px-5 py-2.5 rounded-xl text-sm shadow-md cursor-pointer"
                >
                  <Headset size={16} weight="bold" />
                  احجز استشارة
                  <ArrowLeft size={14} />
                </motion.div>
              </Link>
              <Link href="/ai/consult">
                <motion.div
                  whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-5 py-2.5 rounded-xl text-sm backdrop-blur-sm cursor-pointer"
                >
                  <Robot size={16} weight="fill" />
                  اسأل نظامي AI
                </motion.div>
              </Link>
            </div>
          </div>
        </div>

        {/* Next appointment card */}
        {NEXT_APPOINTMENT && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
          className={`${card} p-5 flex flex-col gap-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <CalendarBlank size={17} weight="fill" className="text-amber-500" />
              </div>
              <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>موعدك القادم</p>
            </div>
            {/* THE WHOLE PILL IS CONDITIONAL, not just the word inside it.
                This was an unconditional amber chip — padding, border and all —
                wrapped around `{countdown}`, a field with no column behind it,
                so every client with a booking got a small empty badge where an
                urgency signal was promised. An empty chip is the same defect as
                a wrong one. */}
            {NEXT_APPOINTMENT.dayPill && (
              <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/30">
                {NEXT_APPOINTMENT.dayPill}
              </span>
            )}
          </div>

          <div className={`rounded-2xl p-4 ${isDark ? "bg-zinc-800" : "bg-amber-50/60 border border-amber-100"}`}>
            {/* The channel, which the row states, in place of a `title` the
                table has no column for. */}
            <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
              {NEXT_APPOINTMENT.heading}
            </p>
            {/* Replaces «مع {lawyer}», which printed «مع » and stopped. */}
            {NEXT_APPOINTMENT.assignedLabel && (
              <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {NEXT_APPOINTMENT.assignedLabel}
              </p>
            )}
            {/* The date alone. The line it replaces read «{date} — {time}» off
                two fields that do not exist, so it rendered as a bare em dash —
                which the comment at the plan card below already condemns in so
                many words: an em dash is not a date. */}
            <div className="mt-3 flex items-center gap-2 text-[12px] font-medium">
              <Clock size={13} className="text-amber-500" />
              <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>
                {NEXT_APPOINTMENT.dateLabel}
              </span>
            </div>
          </div>

          {/* ONE BUTTON. The `tel:` call button beside it resolved to
              `tel:undefined` on every render — a live-looking control that
              dialled nothing — and it cannot be repaired here: the row carries
              `lawyer_user_id`, a uuid, and no route on this page joins a phone
              number to it. Removed rather than left dark.

              /dashboard/client/consultation is the destination because it reads
              the same `consultations` table this card was drawn from: it calls
              getConsultations() alongside listClientWorkflowRequests() and
              merges both results (consultation/page.tsx:356-406).

              NOT because it is guaranteed to contain this row, and the
              difference is worth writing down. getConsultations() is called
              with no arguments (casesService.ts:189), so the route applies its
              default `limit=20` ordered by created_at DESC
              (api/v1/consultations/route.ts:25-33) — while this card picks the
              soonest scheduled_at. An appointment booked long ago for next week
              can sit outside the twenty most recently created, and the list
              would not show it.

              A DEEP LINK WOULD NOT ESCAPE THAT, which is why it was rejected
              rather than preferred. The row's `request_id` is a service_requests
              id, and that IS the id /dashboard/client/consultation/[id]
              resolves — but it resolves it by scanning the client's hundred
              most recent requests (CLIENT_REQUESTS_FETCH_LIMIT,
              clientWorkflowRepository.ts:36) and answers a miss with
              «الاستشارة غير موجودة». Both routes have a ceiling; only one of
              them, on hitting it, tells the client that a real appointment does
              not exist. A list that may be short is the lesser failure. */}
          <Link href="/dashboard/client/consultation" className="block">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-1.5 bg-royal/10 text-royal text-[12px] font-bold py-2.5 rounded-xl transition-colors hover:bg-royal/20 cursor-pointer"
            >
              <CalendarBlank size={13} /> كل المواعيد
            </motion.div>
          </Link>
        </motion.div>
        )}
      </motion.div>

      {/* ══ Section 2 — My Cases ═══════════════════════════════════════════════════ */}
      {MY_CASES.length > 0 && (
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gavel size={17} weight="fill" className="text-royal" />
            <h2 className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-800"}`}>قضاياي</h2>
            {/* The total, not the length of the capped list rendered below it.
                «عرض الكل» is how the client reaches the rest. */}
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
              {toArabicDigits(ACTIVE_TOTAL)} نشطة
            </span>
          </div>
          <Link href="/dashboard/client/cases" className="flex items-center gap-1 text-royal text-[12px] font-medium hover:underline">
            عرض الكل <ArrowLeft size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {MY_CASES.map(cs => (
            <CaseCard key={cs.id} cs={cs} isDark={isDark} />
          ))}
        </div>
      </motion.div>
      )}

      {/* ══ Section 2.5 — الباقة ════════════════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <div className={`relative overflow-hidden rounded-3xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isDark
            ? "bg-gradient-to-l from-[#0B3D2E]/20 to-[#161b22] border-white/[0.07]"
            : "bg-gradient-to-l from-emerald-50 to-white border-emerald-100/80 shadow-sm"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Package size={19} weight="duotone" className="text-emerald-500" />
            </div>
            <div>
              {PLAN ? (
                <>
                  <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>
                    باقتك: {PLAN.name}
                  </p>
                  {/* Dropped entirely when current_period_end is null or
                      unreadable. The line it replaces read
                      «الاشتراك نشط · يتجدد —»: an em dash is not a date, and
                      «يتجدد» was asserted whatever auto_renew said. */}
                  {PLAN.periodLabel && (
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      {PLAN.periodLabel}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* NO CLAIM ABOUT WHICH PLAN THIS CLIENT IS ON. We arrive here
                      when there is no active subscription row, when the plan
                      cannot be identified from the row, and — indistinguishably
                      from either — when the summary request failed and
                      dashboardService.ts handed back its demo fixture. Those
                      three cannot be told apart from the browser, so the card
                      names none of them and states only what is true of the
                      link beside it. */}
                  <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>
                    الباقات والأسعار
                  </p>
                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    اطّلع على باقات نظامي وما تشمله كل باقة.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* /pricing, NOT /dashboard/client/wallet.
              All four buttons this banner used to carry — «اشترك الآن»،
              «ترقية الباقة» and «ارقِّ الباقة» twice — pointed at the wallet
              page, and src/app/dashboard/client/wallet/page.tsx holds a
              balance, coupons, referral rewards and a transaction log: no
              plan, no subscription, no upgrade flow. The word «باقة» does not
              occur anywhere in that file. They were four buttons that looked
              alive and arrived nowhere.
              /pricing is the page that really lists the plans, and the label
              promises exactly that and nothing further — there is no payment
              gateway here to promise a subscription with. */}
          <Link href="/pricing" className="flex-shrink-0">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                isDark
                  ? "text-emerald-300 border border-emerald-400/20 bg-emerald-400/10 hover:bg-emerald-400/15"
                  : "text-[#0B3D2E] border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 hover:bg-[#0B3D2E]/10"
              }`}
            >
              <Lightning size={12} weight="fill" /> عرض الباقات
            </motion.div>
          </Link>
        </div>
      </motion.div>

      {/* ══ Section 3 — اطلب خدمة (Primary Services CTA) ══════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="fill" className="text-[#C8A762]" />
            <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-800"}`}>اطلب خدمة</p>
          </div>
          <Link href="/dashboard/client/services" className={`text-[11px] font-medium hover:underline flex items-center gap-0.5 ${
            isDark ? "text-zinc-500" : "text-zinc-400"
          }`}>
            كل الخدمات <ArrowLeft size={10} />
          </Link>
        </div>
        {/* lg:grid-cols-3, matching the three cards. It was grid-cols-4 for a
            fourth card — «ابحث عن محامٍ» — that has been removed; see the
            QUICK_SERVICES comment above. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_SERVICES.map((svc) => {
            const Icon = svc.icon;
            return (
              <Link key={svc.href} href={svc.href}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.02, boxShadow: "0 16px 40px -8px rgba(11,61,46,0.2)" }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative overflow-hidden rounded-2xl p-4 text-white cursor-pointer bg-gradient-to-br ${svc.color} shadow-md`}
                >
                  <Icon size={22} weight="duotone" className="mb-2 opacity-90" />
                  <p className="text-[13px] font-bold leading-tight">{svc.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{svc.desc}</p>
                  {/* The price/quota pill that sat here is gone with the plan
                      fiction that fed it — «مشمولة ٠/٠» over a quota nothing
                      counts, and two prices that contradicted
                      CLIENT_SERVICE_CATALOG. Each service is priced where it is
                      ordered, on /dashboard/client/services. */}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* ══ Section 4 — مستنداتي ════════════════════════════════════════════════ */}
      {/*
        THE «رسائل المحامين» CARD THAT STOOD BESIDE THIS ONE IS GONE.

        It read `summary.recentMessages` as `{ from, msg, time, unread }`. The
        summary route's query #3 is `.from("chat_messages").select("*")`, and
        `chat_messages` has none of those four columns — it has sender_id,
        body, created_at (migration 20260603_phase1_004_community_features.sql:349).
        The cast was fiction top to bottom, and the first line of the card,
        `msg.from.charAt(0)`, threw a TypeError on undefined: the whole client
        landing page went white for any client who had ever exchanged a chat
        message. That is the same crash toClientCases() was written to stop, in
        the card next door.

        WHY IT WAS NOT REPAIRED INSTEAD. A card needs a sender, and the route
        returns `sender_id` — a uuid — without joining profiles, so there is no
        name to print and no initial for the avatar. `unread` needs
        chat_participants.last_read_at, which the route does not return either.
        And the header «رسائل المحامين» was wrong on its own terms: the query
        takes the three most recent messages in the client's rooms, which
        includes the messages the CLIENT sent. What was left after removing
        every unsupported field was an empty box.

        The unread badge went with it: a hardcoded «ظ،» — a mis-encoded ١,
        printed on every visit, for a count nothing in the app computes.

        /dashboard/client/messages, reachable from «رسائلي» in the sidebar, is
        the real page and reads the rooms properly. Restoring a preview here
        needs the summary route to return a sender name and an unread flag;
        until it does there is nothing honest to preview.
      */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}>
        {/* Documents */}
        <div className={card}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <div className="flex items-center gap-2">
              <FolderOpen size={16} weight="fill" className="text-blue-500" />
              <h3 className={`font-bold text-[14px] ${isDark ? "text-white" : "text-zinc-800"}`}>مستنداتي</h3>
            </div>
            <Link href="/dashboard/client/documents" className="text-xs text-royal hover:underline flex items-center gap-0.5">
              الكل <ArrowLeft size={11} />
            </Link>
          </div>
          {/* Real files only.
              This card used to render three hardcoded names — «عقد التوظيف.pdf»,
              «إشعار قانوني.docx», «محضر الجلسة.pdf» — each captioned with an
              invented case number and each linking to a documents page where
              none of them existed. A hearing transcript attributed to a case
              number is a statement about the client's own legal file, so the
              list now comes from getDocuments(), the same source
              /dashboard/client/documents reads, and shows nothing when there is
              nothing. */}
          <div className="p-4 space-y-2">
            {docsView === "loading" ? (
              <p className={`text-[12px] py-6 text-center ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                جارٍ تحميل المستندات…
              </p>
            ) : docsView === "unreadable" ? (
              // NOT «لا توجد مستندات» — the files may well be there and only the
              // request failed. Saying they are absent would be a false
              // statement about the client's own library.
              <div className={`flex items-start gap-2 rounded-xl p-3 text-[12px] ${
                isDark
                  ? "bg-amber-900/20 border border-amber-700/30 text-amber-300"
                  : "bg-amber-50 border border-amber-200 text-amber-700"
              }`}>
                <WarningCircle size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
                <span className="flex-1">تعذّرت قراءة المستندات.</span>
                {/* A retry that refetches, in place of «حدّث الصفحة»: this card
                    is one of six on the page, and reloading the whole dashboard
                    to re-ask one question throws away five answers that
                    arrived. */}
                <button
                  type="button"
                  onClick={retryDocuments}
                  className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-bold ${
                    isDark ? "border-amber-700/40 hover:bg-amber-900/30" : "border-amber-300 hover:bg-amber-100"
                  }`}
                >
                  <ArrowClockwise size={11} weight="bold" />
                  إعادة المحاولة
                </button>
              </div>
            ) : DOC_ROWS.length === 0 ? (
              <div className="py-6 text-center">
                <p className={`text-[13px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  لا توجد مستندات بعد
                </p>
                <Link href="/dashboard/client/documents" className="mt-1 inline-block text-[11px] text-royal hover:underline">
                  ارفع أول مستند
                </Link>
              </div>
            ) : (
              DOC_ROWS.map((doc) => (
                <Link key={doc.id} href="/dashboard/client/documents">
                  <motion.div whileHover={{ x: -2 }}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      isDark ? "hover:bg-white/[0.05]" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-[10px] ${
                      doc.format === "pdf"
                        ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        : doc.format === "word"
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                          : doc.format === "image"
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300"
                    }`}>
                      {doc.formatLabel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{doc.name}</p>
                      {/* Only what the row carries: a file with no request_id
                          gets no reference, and one with an unreadable
                          created_at gets no date — never a placeholder for
                          either. */}
                      {(doc.orderRef || doc.dateLabel) && (
                        <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                          {[doc.orderRef, doc.dateLabel].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <ArrowLeft size={12} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
                  </motion.div>
                </Link>
              ))
            )}
          </div>
        </div>
      </motion.div>

      {/* ══ Section 5 — المحفظة ═════════════════════════════════════════════════ */}
      {/*
        FOUR CLAIMS CAME OFF THIS BANNER, AND THE BALANCE FIGURE WITH THEM.

        1. «لديك أيضاً ٣ كوبونات خصم نشطة» was a hardcoded literal, printed to
           every client on every visit. Nothing counted coupons; the `coupons`
           table is read by /api/v1/wallet, not by the summary route, and this
           page never asked.

        2. «كسبتها من إحالة أصدقائك» invented where the money came from.
           `walletBalance` is the sum of every wallet_transactions row for the
           user — admin grants included — and says nothing about referrals. On
           a zero balance the sentence was not even grammatical about anything.

        3. «تُخصم تلقائياً عند دفع أي خدمة قانونية» promised a mechanism that
           does not exist. Nothing in src/ writes a wallet debit: entitlements.ts
           is the only writer and it writes credits.

        4. THE NUMBER ITSELF, which is the reason no figure is printed here
           any more. The summary route sums `amount` across every
           wallet_transactions row and ignores `kind`. /api/v1/wallet — the
           authority, the one the wallet page renders — adds credits,
           SUBTRACTS debits and reversals, and holds `pending` rewards out of
           the spendable balance entirely. Today the two agree only by luck:
           entitlements.ts is the sole writer and it only ever inserts
           `kind: "credit"`. The first debit, reversal or pending reward makes
           them diverge silently, and this page would be the one telling the
           client the wrong number about their own money. The arithmetic lives
           in src/app/api/v1/dashboard/summary/route.ts, which this change does
           not own, so the balance is not shown here rather than shown from a
           second, weaker sum. The wallet page states it correctly.
      */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}>
        <div className={`relative overflow-hidden flex flex-col md:flex-row items-start md:items-center gap-5 rounded-3xl border p-6 ${
          isDark
            ? "bg-gradient-to-l from-amber-950/40 to-[#0B3D2E]/40 border-amber-700/20"
            : "bg-gradient-to-l from-amber-50 to-emerald-50 border-amber-200"
        }`}>
          <div className="absolute start-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-400 to-emerald-500 rounded-e-full" />

          <div className="ms-2 w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Wallet size={26} weight="fill" className="text-white" />
          </div>

          <div className="flex-1">
            <p className={`text-[15px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>
              محفظتي
            </p>
            {/* A description of the page behind the button, not a statement
                about this client's balance or coupons. */}
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              الرصيد والكوبونات وسجل المعاملات — في صفحة المحفظة.
            </p>
          </div>

          <Link href="/dashboard/client/wallet">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-[#0B3D2E] text-white text-[12px] font-bold px-4 py-2.5 rounded-xl flex-shrink-0 cursor-pointer shadow-md"
            >
              <Coins size={14} /> إدارة المحفظة <ArrowLeft size={12} />
            </motion.div>
          </Link>
        </div>
      </motion.div>

      {/* ══ Section 5.5 — المجتمع القانوني ══════════════════════════════════════ */}
      {/*
        WHAT THIS PREVIEW MAY SAY ABOUT A QUESTION.

        The summary route selects exactly four columns from `community_posts`
        (route.ts query #5: `id, title, category, created_at`), so exactly four
        things can be shown. The rows this card used to draw claimed five more
        — `votes`, `answers`, `isAnswered`, `tag`, `ago` — and not one of them
        was in the payload: the vote counter rendered blank, the pill rendered
        blank, and «{q.answers} إجابة» rendered as a bare « إجابة».

        The «محامٍ» SealCheck badge was the worst of them. It was unconditional
        markup, attached to every row, telling the client a licensed lawyer had
        answered a question that in general nobody had answered. `vote_count`,
        `answer_count` and `accepted_answer_id` are real columns — the route
        just does not select them. Restoring the counts means widening that
        select, in a file this change does not own; the «محامٍ» badge needs more
        than that, because nothing on a post says who answered it.

        `category` and `created_at` were already in the payload and were simply
        being read under the wrong names. They are now shown for real.
      */}
      {COMMUNITY_PREVIEW.length > 0 && (
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}>
        <div className={`overflow-hidden rounded-3xl border ${
          isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-100 shadow-sm"
        }`}>
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${
            isDark ? "border-white/[0.06]" : "border-zinc-100"
          }`}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0B3D2E]/10 flex items-center justify-center">
                <Users size={16} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
              </div>
              <div>
                <h3 className={`font-bold text-[14px] ${isDark ? "text-white" : "text-zinc-800"}`}>المجتمع القانوني</h3>
                {/* «أسئلة يُجيب عليها محامون معتمدون» stood here and was a
                    promise about who answers: community_answers is open to any
                    member and carries no verification of the author. */}
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>أحدث الأسئلة المطروحة</p>
              </div>
            </div>
            <Link href="/community" className="text-xs text-royal hover:underline flex items-center gap-0.5">
              الكل <ArrowLeft size={11} />
            </Link>
          </div>

          {/* Questions Preview */}
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
            {COMMUNITY_PREVIEW.map((q) => {
              // Unknown category → no pill, rather than a pill printing the raw
              // English token at an Arabic reader.
              const categoryAr = COMMUNITY_CATEGORY_AR[readText(q.category)] ?? null;
              const askedAt = formatArabicDate(q.created_at);
              return (
                <Link key={q.id} href={`/community/${q.id}`}>
                  <motion.div
                    whileHover={{ x: -2 }}
                    className={`flex items-start gap-3 px-5 py-3.5 transition-colors group ${
                      isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium leading-snug mb-1.5 group-hover:text-royal transition-colors ${
                        isDark ? "text-zinc-200" : "text-zinc-700"
                      }`}>
                        {q.title}
                      </p>
                      {(categoryAr || askedAt) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {categoryAr && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              isDark ? "bg-[#0B3D2E]/20 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                            }`}>{categoryAr}</span>
                          )}
                          {askedAt && (
                            <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{askedAt}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <ArrowLeft size={12} className={`flex-shrink-0 self-center ${isDark ? "text-zinc-600" : "text-zinc-300"}`} />
                  </motion.div>
                </Link>
              );
            })}
          </div>

          {/* Footer CTA */}
          <div className={`flex items-center justify-between px-5 py-3 border-t ${
            isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-zinc-100 bg-zinc-50"
          }`}>
            {/* «الأسئلة + الإجابات مُفهرسة على Google — تساعد نظامي في السيو»
                was here. It is a note to the marketing team, shown to a client
                who came for legal help, and it asserted an indexing outcome
                nothing on this page can verify. */}
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              شارك سؤالك مع أعضاء المجتمع
            </p>
            <Link href="/community/ask">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white cursor-pointer"
              >
                <PencilSimple size={11} weight="bold" /> اطرح سؤالاً
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.div>
      )}

      {/* ══ Section 6 — AI Quick Question ═══════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}>
        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C8A762] to-[#b8974f] flex items-center justify-center">
              <Robot size={20} weight="fill" className="text-[#0B3D2E]" />
            </div>
            <div>
              <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>لديك سؤال قانوني؟</p>
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                اسأل بالكلام العادي — نظامي AI يجيبك فوراً
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              placeholder="مثال: ما حقوقي لو الموظف شتمني؟"
              className={`flex-1 rounded-xl border px-4 py-3 text-[13px] outline-none transition-colors ${
                isDark
                  ? "bg-zinc-800 border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 focus:border-royal/40"
                  : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-royal/40"
              }`}
            />
            <Link href={`/ai/consult${aiInput ? `?q=${encodeURIComponent(aiInput)}` : ""}`}>
              <motion.div
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="h-full px-4 flex items-center gap-2 bg-[#0B3D2E] hover:bg-[#1a6b4e] text-white text-[13px] font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkle size={14} weight="fill" /> اسأل
              </motion.div>
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {["ما حقوقي عند الفصل؟", "كيف أرفع دعوى؟", "هل عقدي صحيح؟"].map(q => (
              <button
                key={q}
                onClick={() => setAiInput(q)}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                  isDark
                    ? "border-white/[0.08] text-zinc-500 hover:border-royal/40 hover:text-royal"
                    : "border-zinc-200 text-zinc-400 hover:border-royal/40 hover:text-royal"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

    </div>
  );
}
