/**
 * buildConsultationIntake.ts — turns the /book/consultation wizard's answers
 * into the three fields the created `service_requests` row actually carries:
 * `title`, `description`, and `metadata.intake`.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * The booking wizard used to submit nothing at all: the only async work in the
 * whole flow was a 2200 ms sleep, and the success screen printed a constant
 * reference number (#CL-20260330). Now that it creates a real order, the thing
 * the نظامي team reads off that order is built here — and it is built by a
 * function with no React, no clock and no network in it, so its output can be
 * asserted directly (see buildConsultationIntake.test.ts, `node --test`).
 *
 * DELIBERATELY NO IMPORT FROM ./constants
 * That module pulls in @phosphor-icons/react at the top level, which would drag
 * a whole React icon package into `node --test`. The two unions below are
 * therefore declared locally and matched structurally against
 * constants.ts's `ScheduleMode` / `ConsultationType` at the call site — the
 * compiler still catches a drift, because the caller passes the real ones in.
 *
 * WHY `service: "consultation"` IS SAFE
 * checkOrderIntake (src/lib/services/intakeGuard.ts) dispatches on
 * `intake.service` and only recognises the four AI services
 * (draft / contracts / wargaming / legal_opinion). Anything else returns
 * `{ kind: "pass" }` and reaches the insert untouched — which is exactly what
 * a consultation booking wants, since none of those four validators describes
 * it. The key is still written so the row says what it is rather than being an
 * anonymous blob.
 */

/** Mirrors `ScheduleMode` in ./constants (structurally, not by import). */
export type ConsultationTimingMode = "instant" | "asap" | "calendar" | null;

export interface ConsultationIntakeInput {
  /** The Arabic label the client saw in the picker, never the machine id. */
  specialtyLabel: string;
  /** The machine id, kept alongside the label so the team can filter later. */
  specialtyId: string | null;
  /** The client's own words, verbatim. */
  description: string;
  /** Arabic label of the chosen consultation channel. */
  consultTypeLabel: string;
  /** Machine id of that channel ("ai" | "voice" | "video" | "in-person"). */
  consultTypeId: string | null;
  /** Catalogue price as shown — an ESTIMATE, never a charge. See below. */
  estimatedPrice: string;
  scheduleMode: ConsultationTimingMode;
  calDay: string | null;
  calTime: string | null;
}

export interface ConsultationSubmission {
  title: string;
  description: string;
  /**
   * `metadata.intake` — and ONLY things a human should read.
   *
   * Everything here is walked by buildSummaryRows() (src/lib/services/
   * intakeValues.ts) onto two Arabic screens: the client's own receipt
   * (OrderSummary.tsx) and the team's brief (buildOrderPrompt). That walk hides
   * exactly three keys — `attachments`, `schemaVersion`, `service` — and prints
   * every other one through labelFor(), which falls back to the RAW KEY when it
   * has no Arabic for it. So a machine id parked in here does not sit quietly
   * in the jsonb: it renders as «specialtyId: labor» on د. محمد's screen. That
   * is the «**contractDesc:**» defect intakeValues.ts was written to end, which
   * is why the ids live in `ids` below instead.
   */
  intake: Record<string, unknown>;
  /**
   * Machine ids for the ROW's `metadata` top level, never inside `intake`.
   * buildSummaryRows() never walks up here, so these are stored for grouping
   * and reporting without ever reaching a screen.
   */
  ids: Record<string, unknown>;
}

/**
 * One Arabic sentence for the timing the client asked for.
 *
 * Every branch describes a PREFERENCE, not a commitment. The old wizard's
 * wording ("خلال ١٥–٢٠ دقيقة", "تم العثور على محامٍ متاح") promised an
 * interval and a match that nothing in the system produces: a request is
 * fulfilled by hand from the admin queue, so no code anywhere can hold the app
 * to fifteen minutes. Saying "الأسرع الممكن" instead of "خلال ١٥–٢٠ دقيقة" is
 * not softer copy — it is the difference between a true sentence and a false
 * one on a client's screen.
 */
export function timingLabelAr(input: {
  consultTypeId: string | null;
  scheduleMode: ConsultationTimingMode;
  calDay: string | null;
  calTime: string | null;
}): string {
  if (input.consultTypeId === "ai") return "دون موعد محدد — يُنفَّذ من فريق نظامي";
  if (input.scheduleMode === "instant") return "تفضيل: الأسرع الممكن";
  if (input.scheduleMode === "asap") return "تفضيل: أول وقت يتوفر";
  if (input.scheduleMode === "calendar") {
    // Both halves, one half, or neither — the calendar step can be left
    // half-answered and a row reading «الأحد — null» would be worse than a row
    // that says the day only.
    const parts = [input.calDay, input.calTime].filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0,
    );
    if (parts.length === 0) return "تفضيل: موعد من التقويم (لم يُحدَّد)";
    return `تفضيل: ${parts.join(" — ")}`;
  }
  return "لم يُحدَّد";
}

/** Drop keys whose value is empty, so no row prints a label with a blank after it. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Build `title` / `description` / `metadata.intake` for one booking.
 *
 * THE DESCRIPTION IS DELIBERATELY REDUNDANT WITH THE INTAKE.
 * buildOrderPrompt() (src/lib/services/orderPrompt.ts) prints
 * `order.description` under «## وصف الطلب» and then walks the intake through
 * INTAKE_LABELS. That map already reads `description` as «الوصف» and
 * `legalBranch` as «الفرع القانوني», which is why those two names were reused
 * rather than invented. It has no entry yet for the remaining three —
 * `consultationType`, `preferredTiming`, `estimatedPrice` — so labelFor()
 * prints those keys raw until intakeValues.ts gains them (reported in
 * `skipped`). Repeating all five as a short Arabic header on the description
 * column means the team can fulfil the order today regardless, and costs one
 * duplicated block on a brief.
 *
 * THE INTAKE IS KEPT SMALL FOR THE SAME REASON.
 * `preferredDay` and `preferredTime` are not stored: `preferredTiming` already
 * carries both, so they would only add two more untranslated rows saying what
 * the row above them just said.
 */
export function buildConsultationIntake(input: ConsultationIntakeInput): ConsultationSubmission {
  const timing = timingLabelAr(input);
  const body = input.description.trim();

  const headerLines = [
    `التخصص: ${input.specialtyLabel}`,
    `نوع الاستشارة: ${input.consultTypeLabel}`,
    `التوقيت المطلوب: ${timing}`,
    // Named an estimate on every surface it appears, per the owner's ruling of
    // 26 August: the client submits free and the team quotes afterwards, so the
    // catalogue figure is the only thing this number can honestly be.
    `السعر التقديري (غير مُلزِم): ${input.estimatedPrice}`,
  ];

  const description = [...headerLines, "", "وصف المشكلة كما كتبها العميل:", body || "—"].join("\n");

  const intake = compact({
    service: "consultation",
    schemaVersion: 1,
    // `legalBranch` and `description` are reused from INTAKE_LABELS rather than
    // minted fresh: they already read «الفرع القانوني» and «الوصف» in Arabic on
    // both the client receipt and the team brief. Every value below is Arabic
    // display text, never an id — see the note on ConsultationSubmission.intake.
    legalBranch: input.specialtyLabel,
    description: body,
    consultationType: input.consultTypeLabel,
    preferredTiming: timing,
    estimatedPrice: input.estimatedPrice,
  });

  // Machine ids, so a later report can group bookings without re-parsing
  // display text — stored on `metadata`, above the intake, where no summary
  // walker reaches them.
  const ids = compact({
    specialtyId: input.specialtyId,
    consultTypeId: input.consultTypeId,
    scheduleMode: input.scheduleMode,
    calDay: input.scheduleMode === "calendar" ? input.calDay : null,
    calTime: input.scheduleMode === "calendar" ? input.calTime : null,
  });

  return {
    title: `حجز استشارة — ${input.specialtyLabel}`,
    description,
    intake,
    ids,
  };
}
