/**
 * whatsappRequestMessage.ts — the pure half of the floating WhatsApp widget.
 *
 * WHAT THE WIDGET USED TO DO, AND WHY THIS FILE EXISTS
 * `createWhatsAppWorkflow` / `createQuickWhatsAppWorkflow` ended in
 * `saveWorkflowRequest()` — browser localStorage — and then told the client, in
 * the WhatsApp message they forwarded to the office themselves, «حالة التنفيذ:
 * تم تسجيل طلب محلي وجاهز للربط بالباك إند». Nothing server-side ever saw the
 * request, and the sentence the CLIENT sent the office was a developer's note
 * about an unfinished integration.
 *
 * The widget now creates a real `service_requests` row when there is a session,
 * and says so — or says plainly that there is no row. Which of those two
 * sentences is true is decided at the call site, from the server's answer; this
 * module only turns that decision into Arabic. Everything here is a pure
 * function over already-resolved strings: no React, no fetch, no clock, so
 * `node --test` can assert the exact text the office and the client will read
 * (whatsappRequestMessage.test.ts).
 *
 * EXACTLY ONE IMPORT, AND IT IS A REUSE
 * `timingLabelAr` comes from src/components/consultation/buildConsultationIntake.ts
 * — the /book/consultation wizard's own module, itself import-free so
 * `node --test` can load it. The widget's «متى تريد الاستشارة؟» step asks the
 * same question that wizard asks, and both answers end up on a fulfilment
 * brief; one function means the office cannot be handed two different Arabic
 * sentences for the same request. Everything else below is copied with a
 * citation rather than imported, because:
 *
 * The four wa-steps components this file mirrors pull in
 * @phosphor-icons/react and framer-motion at the top level, and
 * ../../components/floating/types is reachable only through a tsconfig path
 * alias the `node --test` loader does not resolve. So every picker's Arabic is
 * copied in below with the file and line it came from, on the same rule
 * src/lib/services/intakeValues.ts states for itself: when a picker's wording
 * changes, that citation is where to go. The flow kinds are declared locally and
 * matched structurally against `WaStep` at the call site, exactly as
 * src/components/consultation/buildConsultationIntake.ts does with
 * `ScheduleMode` — the compiler still catches drift, because the caller passes
 * the real values in.
 *
 * WHY `service: "whatsapp_widget"` IS SAFE
 * checkOrderIntake (src/lib/services/intakeGuard.ts) resolves the service from
 * `intake.service` and falls back to `metadata.service`, then runs an AI
 * validator if either names one of draft / contracts / wargaming /
 * legal_opinion. Anything else returns `{ kind: "pass" }` and reaches the
 * insert untouched. That is why the contract-review flow is NOT called
 * "contracts": that id would hand every contract request to
 * validateContractsIntake, which wants named parties and a contract
 * description this three-tap wizard never collects, and the POST would 400.
 */

import {
  timingLabelAr,
  type ConsultationTimingMode,
} from "../../components/consultation/buildConsultationIntake.ts";

// ─── What the office is being asked for ──────────────────────────────────────

/**
 * Which branch of the wizard the visitor walked. Mirrors the `WaStep` prefixes
 * (src/components/floating/types.ts) structurally, not by import.
 */
export type WhatsAppFlowKind =
  | "consult"
  | "contract"
  | "representation"
  | "notary"
  | "generic";

/**
 * What actually happened to the request, as the CALLER observed it — never
 * guessed here.
 *
 *  - `recorded`: POST /api/v1/service-requests returned a row the server owns
 *    (it carries `requester_user_id`). `reference` is that row's id as the
 *    server returned it, not the id the client generated before the call.
 *  - `whatsapp_only` / `anonymous`: there is no session. The widget is mounted
 *    on every page for signed-out visitors too, and for them the POST is a 401.
 *    WhatsApp is the whole of what happens, and the screen says so.
 *  - `whatsapp_only` / `not_recorded`: there IS a session but no row exists —
 *    the POST failed, or the build is running with
 *    NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND unset, in which case
 *    `createWorkflowRequest` writes localStorage and returns a normal-looking
 *    object nobody in the office can see.
 *  - `pending`: the POST is still in flight. It exists because StepPayment
 *    navigates to the success step synchronously, in the same click handler
 *    that starts the request (StepPayment.tsx:83-84 and :104), so the success
 *    screen renders BEFORE the outcome is known. Showing a reference or a
 *    «تم» during that window would be a guess.
 */
export type WhatsAppOutcome =
  | { kind: "recorded"; reference: string }
  | { kind: "whatsapp_only"; reason: "anonymous" | "not_recorded" }
  | { kind: "pending" };

/** Who is asking, already resolved to Arabic by roleContext.ts. */
export interface WhatsAppActorSummary {
  /** The visitor's own name, or "" when there is none. Never "زائر" by default. */
  name: string;
  categoryLabel: string;
  roleLabel?: string;
  entityName?: string;
  scopeLabel?: string;
}

/** Everything the multi-step wizard collected, verbatim. */
export interface WhatsAppWizardAnswers {
  detailsTitle: string;
  detailsDesc: string;
  contractNotes: string;
  repDetails: string;
  calDay: string | null;
  calSlot: string | null;
  /** One of PAYMENT_METHOD_AR's keys, or "not_required". */
  paymentMethod: string;
  selections: Record<string, string>;
}

// ─── The pickers' own Arabic ─────────────────────────────────────────────────
// Half of the wizard's answers are stored as English machine ids and half as
// the Arabic label the visitor tapped. Only the ids need translating, and the
// translation must be the picker's own word — src/lib/services/intakeValues.ts
// explains at length what happens when a second, re-translated copy is minted:
// the client's receipt and the team's brief drift into two languages, and the
// Arabic one is the one nobody on the team can see.

/** src/components/floating/wa-steps/StepConsult.tsx:82-84 and :240-243. */
export const WA_MODALITY_AR: Record<string, string> = {
  voice: "صوت",
  video: "فيديو",
  text: "كتابة",
  person: "حضوري",
};

/** src/components/floating/wa-steps/StepConsult.tsx:112-121. */
export const WA_PROVIDER_AR: Record<string, string> = {
  ai: "نظامي AI",
  lawyer: "محامي متخصص",
};

/** src/components/floating/wa-steps/StepContract.tsx:52-53 (CONTRACT_SERVICES). */
export const WA_CONTRACT_SERVICE_AR: Record<string, string> = {
  "ai-review": "مراجعة AI",
  "lawyer-review": "محامي متخصص",
};

/** src/components/floating/wa-steps/StepRepresentation.tsx:60-62 (SUB_TYPES). */
export const WA_REPRESENTATION_SUB_AR: Record<string, string> = {
  litigation: "ترافع وصياغة",
  attendance: "حضور جلسة",
  memo: "صياغة مذكرة",
};

/**
 * src/components/floating/wa-steps/StepRepresentation.tsx:106-107 (ROLES).
 *
 * The English `sub` those two buttons also render ("Plaintiff" / "Defendant")
 * is dropped: it stands in for nothing the office needs, and an English word
 * must not reach an Arabic brief.
 */
export const WA_CASE_ROLE_AR: Record<string, string> = {
  plaintiff: "مدعي",
  defendant: "مدعى عليه",
};

/** src/components/floating/wa-steps/StepNotary.tsx:39-41 (NOTARY_LOCATIONS). */
export const WA_NOTARY_LOCATION_AR: Record<string, string> = {
  office: "في مكتب المحامي",
  notary: "كاتب العدل (مع مرافقة)",
  remote: "إلكتروني (عن بعد)",
};

/** src/components/floating/wa-steps/StepNotary.tsx:80-81 (URGENCY_OPTIONS). */
export const WA_URGENCY_AR: Record<string, string> = {
  normal: "عادي",
  urgent: "عاجل",
};

/**
 * src/components/floating/wa-steps/StepPayment.tsx:19-22 (PAYMENT_METHODS).
 *
 * `not_required` is deliberately absent. It is not a payment method the visitor
 * chose — it is what StepPayment writes (`:82`) when the flow carries no price
 * at all and the step is skipped, so there is nothing to tell the office and
 * the row is omitted rather than filled with «غير مطلوب».
 */
export const WA_PAYMENT_METHOD_AR: Record<string, string> = {
  mada: "مدى",
  visa: "Visa / Mastercard",
  stc: "STC Pay",
  apple: "Apple Pay",
};

/**
 * The figure the visitor was shown on «ملخص طلبك», in the same Arabic-Indic
 * digits StepPayment printed it in (StepPayment.tsx:36-42) — copied, not
 * reformatted, so the brief and the screen cannot disagree about the number.
 *
 * "" where StepPayment shows «يتم التحديد». There is no price in that case, so
 * there is no row: an invented «٠ ر.س» would read as "free" to the office.
 */
export function widgetPriceAr(selections: Record<string, string>): string {
  if (selections.provider === "ai") return "٥٠ ر.س";
  if (selections.provider === "lawyer") return "٧٠٠ ر.س";
  // contractService ("ai-review" / "lawyer-review") no longer prints a fixed
  // number here (Task B1, item 163) — StepContract.tsx dropped "١٥٠ ر.س" /
  // "٤٩٩ ر.س" for the same reason: no catalog price backed either figure.
  // "" falls through to buildWhatsAppRequestContent's existing no-price path.
  return "";
}

/**
 * The same figure as a number, for `metadata` rather than for a screen.
 *
 * `null`, never 0, when there is no price — `metadata.originalPrice: 0` on a
 * request whose price was «يتم التحديد» is a claim that the service is free.
 */
export function widgetPriceValue(selections: Record<string, string>): number | null {
  if (selections.provider === "ai") return 50;
  if (selections.provider === "lawyer") return 700;
  // See widgetPriceAr above — contractService carries no catalog price.
  return null;
}

// ─── Flow resolution and titles ──────────────────────────────────────────────

/**
 * Which branch the visitor walked, from the step history.
 *
 * Same prefix test, in the same order, as the `getServiceKind` this replaces
 * and as StepPayment's own `serviceName` (StepPayment.tsx:29-33) — the two must
 * agree or the summary screen and the created row name different services.
 */
export function resolveWhatsAppFlow(history: readonly string[]): WhatsAppFlowKind {
  if (history.some((step) => step.startsWith("consult"))) return "consult";
  if (history.some((step) => step.startsWith("contract"))) return "contract";
  if (history.some((step) => step.startsWith("representation"))) return "representation";
  if (history.some((step) => step.startsWith("notary"))) return "notary";
  return "generic";
}

/**
 * Which of the three answers to «متى تريد الاستشارة؟» the visitor gave
 * (StepConsult.tsx:48-50), read back off the step history.
 *
 * The answer used to be thrown away entirely. Only «احجز ميعاد محدد» left a
 * trace — a `calDay`/`calSlot` pair — so a visitor who tapped «استشارة فورية»,
 * the most urgent of the three, reached the office with no timing row at all.
 * The step ids are the record of the tap: each branch routes through its own
 * prefix and nothing else writes them.
 *
 * Returns null for a flow that never asked, so no row is invented for it.
 */
export function resolveConsultTiming(history: readonly string[]): ConsultationTimingMode {
  if (history.some((step) => step.startsWith("consult-instant"))) return "instant";
  if (history.some((step) => step.startsWith("consult-next"))) return "asap";
  if (history.some((step) => step.startsWith("consult-specific") || step === "consult-calendar")) {
    return "calendar";
  }
  return null;
}

/**
 * The service name that becomes the row's title and the «الخدمة» row of the
 * WhatsApp message. `category` only changes the wording where the office asked
 * for it (a firm's own contract review, a government support request).
 */
export function whatsAppServiceTitle(flow: WhatsAppFlowKind, category: string): string {
  if (flow === "consult") {
    return category === "government" ? "طلب دعم قانوني حكومي" : "طلب استشارة قانونية";
  }
  if (flow === "contract") {
    return category === "firm" ? "طلب مراجعة عقد داخل المكتب" : "طلب مراجعة عقد";
  }
  if (flow === "representation") return "طلب تمثيل قضائي";
  if (flow === "notary") return "طلب توثيق";
  return "طلب خدمة قانونية";
}

/**
 * The `service_requests.type` for one flow.
 *
 * Constrained by `service_requests_type_check` (supabase/migrations/
 * 20260814_service_orders_types.sql) — see the comment on
 * `WorkflowRequest["type"]` in src/lib/workflowStore.ts. A corporate dispute is
 * the one case that is not a plain "service": `business_case` is what the
 * corporate dashboard's own case list reads.
 */
export function whatsAppRequestType(
  flow: WhatsAppFlowKind,
  category: string,
): "service" | "consultation" | "business_case" {
  if (flow === "consult") return "consultation";
  if (flow === "representation" && (category === "corporate" || category === "business")) {
    return "business_case";
  }
  return "service";
}

// ─── Building the row ────────────────────────────────────────────────────────

/**
 * One leaf of a `service_requests.metadata` jsonb.
 *
 * Not `unknown`: `WorkflowRequest.metadata` (src/lib/workflowStore.ts) permits
 * scalars plus ONE level of nesting, and typing the two objects below as
 * scalars-only lets them be assigned into it with no cast — a cast there would
 * only hide the day someone puts an object inside `intake`, which
 * buildSummaryRows would then render as «[object Object]».
 */
export type WhatsAppMetaValue = string | number | boolean | null;

/** Drop keys with no value, so no row prints a label with a blank after it. */
function compact(
  obj: Record<string, WhatsAppMetaValue | undefined>,
): Record<string, WhatsAppMetaValue> {
  const out: Record<string, WhatsAppMetaValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Look an id up in a picker map, or pass an unknown value through unchanged. */
function pick(map: Record<string, string>, value: string | undefined): string {
  if (!value) return "";
  return map[value] ?? value;
}

export interface WhatsAppRequestContent {
  title: string;
  description: string;
  /**
   * `metadata.intake` — the ONLY thing buildOrderPrompt (src/lib/services/
   * orderPrompt.ts) reads when it renders the brief the fulfilment officer
   * works from. A flat metadata key is invisible to them.
   *
   * Every value here is Arabic display text, never a machine id: buildSummaryRows
   * prints each row through labelFor(), which falls back to the RAW KEY, so a
   * `provider: "ai"` parked in here renders as «provider: ai» on د. محمد's
   * screen. Ids go in `ids` below instead.
   */
  intake: Record<string, WhatsAppMetaValue>;
  /** Machine ids and bookkeeping for `metadata`'s top level, which no summary walker reaches. */
  ids: Record<string, WhatsAppMetaValue>;
  /**
   * The same answers as `[label, value]` pairs for the wa.me body.
   *
   * Built here rather than in the caller so the message the office reads and
   * the brief it works from are assembled from ONE resolution of the wizard's
   * answers. Two resolutions is how the WhatsApp message came to say «مزود
   * الاستشارة: محام متخصص» while the stored row said «provider: lawyer».
   */
  rows: Array<[string, string]>;
}

/**
 * Build `title` / `description` / `metadata.intake` for one wizard run.
 *
 * WHY THE DESCRIPTION REPEATS THE INTAKE
 * The same trade src/components/consultation/buildConsultationIntake.ts:124-134
 * made, for the same reason. buildOrderPrompt prints `order.description`
 * verbatim under «## وصف الطلب» and then walks the intake through
 * INTAKE_LABELS. Four of the keys below have no Arabic label yet — `city`,
 * `contractService`, `notaryType`, `notaryLocation` — and intakeValues.ts is
 * not this change's to edit, so those four print under their raw English key
 * until the labels are added (reported as a follow-up). Repeating them as a
 * short Arabic header on the description column means the team can fulfil the
 * request today regardless, at the cost of one duplicated block.
 *
 * Every other key was chosen because it ALREADY has an Arabic label:
 * `subject` («موضوع الطلب»), `description` («الوصف»), `consultationType`
 * («نوع الاستشارة»), `preferredTiming` («التوقيت المطلوب»), `estimatedPrice`
 * («السعر التقديري»), `specialty` («التخصص»), `contractType` («نوع العقد»),
 * `caseType` («نوع الطلب / القضية»), `role` («الصفة في القضية»),
 * `litigationStage` («مرحلة التقاضي»), `urgency` («مستوى الأهمية / الاستعجال»).
 */
export function buildWhatsAppRequestContent(input: {
  flow: WhatsAppFlowKind;
  category: string;
  answers: WhatsAppWizardAnswers;
  /**
   * The step history. Passed in alongside `flow` rather than re-derived from
   * it, because the timing answer lives at a finer grain than the flow does:
   * all three «متى» branches are `flow === "consult"`.
   */
  history: readonly string[];
}): WhatsAppRequestContent {
  const { flow, answers } = input;
  const s = answers.selections;
  const title = whatsAppServiceTitle(flow, input.category);

  // The free text belongs to whichever branch collected it — each of the three
  // has its own textarea and only one of them is ever filled in.
  const body = (
    flow === "contract" ? answers.contractNotes
    : flow === "representation" ? answers.repDetails
    : answers.detailsDesc
  ).trim();

  // The timing answer, in the /book/consultation wizard's own words —
  // timingLabelAr handles the half-answered calendar (the confirm button writes
  // both keys as "" when neither was picked) and the two branches that leave no
  // date at all. `consultTypeId: null` because its "ai" special case belongs to
  // that wizard's type picker, which this widget does not have: here the
  // provider is a separate answer, already carried by `consultationType`.
  //
  // Only the consult branch is asked this, so every other flow gets no row
  // rather than timingLabelAr's «لم يُحدَّد» — which would be a label over an
  // answer nobody was asked for.
  const scheduleMode = flow === "consult" ? resolveConsultTiming(input.history) : null;
  const preferredTiming = scheduleMode
    ? timingLabelAr({
        consultTypeId: null,
        scheduleMode,
        calDay: answers.calDay,
        calTime: answers.calSlot,
      })
    : "";

  // «استشارة صوت» is not Arabic. The channel and who gives it are one sentence
  // on the office's side, and the consultation wizard already sets the house
  // pattern for this exact field (src/app/dashboard/client/consultation/new/
  // page.tsx:370 — `استشارة ${MODE_COPY[mode].label}`).
  const modality = pick(WA_MODALITY_AR, s.modality);
  const provider = pick(WA_PROVIDER_AR, s.provider);
  const consultationType =
    flow === "consult" && (modality || provider)
      ? ["استشارة", modality && `عبر ${modality}`, provider && `مع ${provider}`]
          .filter(Boolean)
          .join(" ")
      : "";

  // The four answers labelFor() has no Arabic for yet, held in locals because
  // they are needed twice — once as an intake row, once on the description.
  const contractService = pick(WA_CONTRACT_SERVICE_AR, s.contractService);
  const city = (s.city ?? "").trim();
  const notaryType = (s.notaryType ?? "").trim();
  const notaryLocation = pick(WA_NOTARY_LOCATION_AR, s.notaryLocation);

  const intake = compact({
    service: "whatsapp_widget",
    schemaVersion: 1,
    subject: answers.detailsTitle.trim(),
    description: body,
    // consult
    consultationType,
    preferredTiming,
    // contract
    contractType: s.contractType ?? "",
    contractService,
    // representation
    caseType: flow === "representation" ? pick(WA_REPRESENTATION_SUB_AR, s.repSub) : "",
    specialty: s.specialty ?? "",
    city,
    role: pick(WA_CASE_ROLE_AR, s.role),
    litigationStage: s.stage ?? "",
    // notary
    notaryType,
    notaryLocation,
    // shared
    urgency: pick(WA_URGENCY_AR, s.urgency),
    estimatedPrice: widgetPriceAr(s),
  });

  // The four rows above that labelFor() cannot name yet, spelled out in Arabic
  // on the description so the brief is fulfillable regardless. Keep this list
  // in step with the follow-up label request; a key that gains a label in
  // intakeValues.ts should be dropped from here.
  const headerLines = [
    contractService && `نوع المراجعة: ${contractService}`,
    city && `المدينة: ${city}`,
    notaryType && `نوع الوثيقة: ${notaryType}`,
    notaryLocation && `طريقة التوثيق: ${notaryLocation}`,
  ].filter((line): line is string => typeof line === "string" && line.length > 0);

  const descriptionLines = [
    ...headerLines,
    ...(headerLines.length > 0 && body ? [""] : []),
    ...(body ? ["ما كتبه العميل:", body] : []),
  ];

  const description = descriptionLines.length > 0 ? descriptionLines.join("\n") : title;

  // Labels copied from INTAKE_LABELS where one exists, and from the wizard's
  // own step header where it does not (useWhatsAppFlow.ts:73-84) — so the
  // office reads the same words the visitor was asked.
  const rows: Array<[string, string]> = (
    [
      ["موضوع الطلب", intake.subject] as [string, WhatsAppMetaValue | undefined],
      ["الوصف", intake.description],
      ["نوع الاستشارة", intake.consultationType],
      ["التوقيت المطلوب", intake.preferredTiming],
      ["نوع العقد", intake.contractType],
      ["نوع المراجعة", intake.contractService],
      ["نوع الخدمة", intake.caseType],
      ["التخصص", intake.specialty],
      ["المدينة", intake.city],
      ["الصفة في القضية", intake.role],
      ["مرحلة القضية", intake.litigationStage],
      ["نوع الوثيقة", intake.notaryType],
      ["طريقة التوثيق", intake.notaryLocation],
      ["الاستعجال", intake.urgency],
      // Named an estimate wherever it appears, per the owner's ruling of 26
      // August: the client submits free and the team quotes afterwards.
      ["السعر التقديري (غير مُلزِم)", intake.estimatedPrice],
      // A preference, not a transaction. StepPayment says so on its own screen
      // («الدفع الإلكتروني غير مفعّل، ويرتّب الفريق الدفع معك مباشرة»,
      // StepPayment.tsx:98) and the office must not read this row as paid.
      [
        "طريقة الدفع المفضّلة (لم يُحصَّل أي مبلغ)",
        pick(WA_PAYMENT_METHOD_AR, answers.paymentMethod === "not_required" ? "" : answers.paymentMethod),
      ],
    ]
  ).filter((row): row is [string, string] => typeof row[1] === "string" && row[1].length > 0);

  const price = widgetPriceValue(s);
  const ids = compact({
    flow,
    scheduleMode,
    modalityId: s.modality ?? null,
    providerId: s.provider ?? null,
    contractServiceId: s.contractService ?? null,
    representationSubId: s.repSub ?? null,
    caseRoleId: s.role ?? null,
    notaryLocationId: s.notaryLocation ?? null,
    urgencyId: s.urgency ?? null,
    // The catalogue figure the visitor was shown, kept so the team can see what
    // they quoted themselves against. It is an ESTIMATE, never a charge: the
    // row is created with `payment: { amount: 0, status: "not_required" }`,
    // because there is no gateway and a row born «بانتظار الدفع» is a row the
    // client has no way to clear (the same ruling the client request form
    // records at src/app/dashboard/client/requests/new/page.tsx:30-40).
    originalPrice: price,
    paymentMethodId:
      answers.paymentMethod && answers.paymentMethod !== "not_required"
        ? answers.paymentMethod
        : null,
  });

  return { title, description, intake, ids, rows };
}

// ─── The message the CLIENT sends the office ─────────────────────────────────

/**
 * The «حالة الطلب» line of the WhatsApp message.
 *
 * This is the line that used to read «تم تسجيل طلب محلي وجاهز للربط بالباك
 * إند» — a note about an unfinished integration, written by a developer, sent
 * by the client, to a law office. Each branch below says only what happened.
 */
export function outcomeStatusLineAr(outcome: WhatsAppOutcome): string {
  if (outcome.kind === "recorded") {
    return `مسجَّل في حسابي على نظامي برقم ${outcome.reference}`;
  }
  if (outcome.kind === "pending") {
    return "قيد الإرسال إلى نظامي";
  }
  return outcome.reason === "anonymous"
    ? "عبر واتساب فقط — لست مسجّل الدخول، فلا يوجد رقم طلب"
    : "عبر واتساب فقط — لم يُسجَّل الطلب في حسابي، فلا يوجد رقم طلب";
}

/** `- label: value` for each row that has a value. */
export function compactRows(rows: Array<[string, string | null | undefined]>): string {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

/**
 * Build the wa.me body.
 *
 * The office reads this on a phone with no context, so the four things it must
 * answer are: who is writing, what they want, where they came from, and whether
 * there is a row in the queue to open — hence «حالة الطلب» last, which is the
 * only line that changes between a recorded request and a WhatsApp-only one.
 */
export function buildWhatsAppMessage(input: {
  intro: string;
  serviceTitle: string;
  actor: WhatsAppActorSummary;
  sourcePath: string;
  /**
   * Omitted where no request was attempted — the support link, which opens a
   * conversation and creates nothing. A «حالة الطلب» row on a message about no
   * request is a row with no source, so there is no row.
   */
  outcome?: WhatsAppOutcome;
  /** Flow-specific rows, already labelled and in Arabic. */
  detailRows?: Array<[string, string | null | undefined]>;
  outro?: string;
}): string {
  const rows = compactRows([
    ["الخدمة", input.serviceTitle],
    ["الاسم", input.actor.name],
    ["نوع المستخدم", input.actor.categoryLabel],
    ["الدور", input.actor.roleLabel],
    ["الكيان", input.actor.entityName],
    ["النطاق", input.actor.scopeLabel],
    ...(input.detailRows ?? []),
    ["المسار", input.sourcePath],
    ["حالة الطلب", input.outcome ? outcomeStatusLineAr(input.outcome) : null],
  ]);

  return [input.intro, rows, "", input.outro ?? "أرغب في متابعة الطلب عبر واتساب."]
    .filter((part) => part !== null && part !== undefined)
    .join("\n");
}

/**
 * wa.me link for one message.
 *
 * Exported from src/components/floating/whatsappWorkflow.ts too — two order
 * pages import it from there and that re-export keeps their import working.
 */
export function buildWhatsAppHref(message: string, phone: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// ─── The screen the CLIENT sees ──────────────────────────────────────────────

export interface WhatsAppOutcomeCopy {
  /** Panel header. Replaces the static «تم استلام طلبك». */
  header: string;
  headline: string;
  /** Body lines, in order. */
  lines: string[];
  /**
   * The reference to print, or null. NEVER a placeholder: the old success step
   * printed `workflow?.id ?? "WA-DEMO"`, so a visitor whose request was never
   * created still got a «رقم الطلب» to quote at the office.
   */
  reference: string | null;
  /** Whether the wa.me link is ready to be offered yet. */
  showWhatsAppLink: boolean;
  /** "success" | "notice" | "warning" | "pending" — chooses the icon and colour. */
  tone: "success" | "notice" | "warning" | "pending";
}

/**
 * What the success step says, per outcome.
 *
 * The header is part of this rather than left to STEP_HEADERS
 * (src/components/floating/hooks/useWhatsAppFlow.ts:87) because that map's
 * «تم استلام طلبك» is a claim the office has the request — untrue for a
 * WhatsApp-only outcome until the visitor presses send, and untrue for all of
 * them while the POST is still in flight.
 */
export function outcomeScreenCopyAr(outcome: WhatsAppOutcome): WhatsAppOutcomeCopy {
  if (outcome.kind === "pending") {
    return {
      header: "جارٍ إرسال طلبك",
      headline: "جارٍ إرسال طلبك…",
      lines: ["لحظة واحدة — نسجّل الطلب في حسابك."],
      reference: null,
      showWhatsAppLink: false,
      tone: "pending",
    };
  }

  if (outcome.kind === "recorded") {
    return {
      header: "تم تسجيل طلبك",
      headline: "تم تسجيل طلبك",
      lines: [
        "وصل الطلب إلى فريق نظامي، وتجده في «طلباتي» لمتابعة حالته.",
        "الزر أدناه يرسل نفس التفاصيل إلى واتساب المكتب إن أردت متابعة أسرع.",
      ],
      reference: outcome.reference,
      showWhatsAppLink: true,
      tone: "success",
    };
  }

  if (outcome.reason === "anonymous") {
    return {
      header: "طلبك جاهز للإرسال",
      headline: "طلبك جاهز للإرسال عبر واتساب",
      lines: [
        "لم يُسجَّل الطلب في حساب لأنك غير مسجّل الدخول، ولا يوجد رقم طلب لمتابعته.",
        "اضغط الزر أدناه لإرسال التفاصيل إلى واتساب المكتب — هذه هي الطريقة الوحيدة التي يصل بها طلبك الآن.",
        "لو سجّلت الدخول ثم أعدت الطلب، سيُحفظ في «طلباتي» بإمكانك متابعته.",
      ],
      reference: null,
      showWhatsAppLink: true,
      tone: "notice",
    };
  }

  return {
    header: "لم يُسجَّل الطلب",
    headline: "تعذّر تسجيل الطلب في حسابك",
    lines: [
      "لم يُنشأ للطلب سجل في حسابك ولا يوجد رقم طلب — قد يكون الاتصال انقطع.",
      "اضغط الزر أدناه لإرسال التفاصيل إلى واتساب المكتب حتى لا يضيع طلبك.",
    ],
    reference: null,
    showWhatsAppLink: true,
    tone: "warning",
  };
}
