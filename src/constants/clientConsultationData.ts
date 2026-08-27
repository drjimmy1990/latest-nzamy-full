import { Buildings, VideoCamera, Phone, ChatsCircle } from "@phosphor-icons/react";

export type ConsultPath = "ai" | "lawyer";
export type LawyerMode = "video" | "in-person" | "text" | "voice";

export const MODE_COPY = {
  "in-person": { label: "حضورية",         Icon: Buildings,    serviceId: "in-person", desc: "في مكتب المحامي" },
  video:        { label: "مرئية (أونلاين)", Icon: VideoCamera,  serviceId: "video-full", desc: "فيديو عبر الإنترنت" },
  voice:        { label: "صوتية (أونلاين)", Icon: Phone,        serviceId: "video-full", desc: "مكالمة عبر الإنترنت" },
  text:         { label: "كتابية",          Icon: ChatsCircle,  serviceId: "written-opinion", desc: "رد خلال 48 ساعة" },
} as const;

/**
 * Modes that have NO catalogue entry of their own and borrow another mode's.
 *
 * «صوتية (أونلاين)» is the only one. There is no voice row in
 * CLIENT_SERVICE_CATALOG at all, so MODE_COPY.voice.serviceId points at
 * "video-full" — the 60-minute VIDEO session — and getConsultationModeServiceId()
 * (src/lib/pricingRepository.ts:190) falls through to the same id. A voice
 * booking is therefore priced, quoted and recorded as video-full.
 *
 * What this set exists to stop is that entry's own `priceNote`
 * («مرئية أونلاين - 60 دقيقة») being printed on the review screen one row under
 * «النوع: مع محامٍ — صوتية (أونلاين)»: a voice call described back to the client
 * as a 60-minute video call, and a duration on screen that no row records.
 *
 * NOT derived by counting the modes that share a serviceId — video and voice
 * share "video-full", but video is that entry's OWNER and the note is true of
 * it. A count cannot tell an owner from a borrower, and that asymmetry is the
 * whole fact being recorded here.
 *
 * The other honest fix is giving voice its own row in
 * src/constants/clientServiceCatalog.ts (not this pass's file). When that
 * lands, delete this set and the branch that reads it — and note it fixes the
 * price too, which suppressing a note does not: a voice booking is still
 * charged and recorded at video-full's ٥٠٠ ر.س.
 */
export const MODES_BORROWING_ANOTHER_SERVICE_ENTRY: ReadonlySet<LawyerMode> =
  new Set<LawyerMode>(["voice"]);

/**
 * How a consultation is delivered: the four lawyer modes the booking wizard
 * writes to `metadata.mode`, plus the AI path's own "ai".
 */
export type ConsultChannel = LawyerMode | "ai";

/**
 * The one Arabic wording for each channel, shared by every screen that names
 * one — the list («استشاراتي»), the detail record, and the wizard's own review
 * row. The four lawyer labels are read off MODE_COPY rather than retyped, on
 * the rule the rest of this codebase follows for intake labels: what a client
 * reads afterwards and the button they pressed must never drift apart.
 *
 * Also the membership test both consultation pages use on a stored
 * `metadata.mode`: a value that is not a key here is a mode this codebase
 * cannot name, and gets NO type row rather than a guessed one.
 */
export const CHANNEL_LABEL: Record<ConsultChannel, string> = {
  "in-person": MODE_COPY["in-person"].label,
  video: MODE_COPY.video.label,
  voice: MODE_COPY.voice.label,
  text: MODE_COPY.text.label,
  ai: "نظامي AI",
};

/** One stored value as a channel, or null. Not exported: the two keys are not interchangeable. */
function channelFromValue(raw: unknown): ConsultChannel | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed in CHANNEL_LABEL ? (trimmed as ConsultChannel) : null;
}

/**
 * The channel a stored consultation row records, or null.
 *
 * Reads TWO keys, because the two creators of a consultation row write the same
 * fact under different names:
 *
 *  - `metadata.mode` — the dashboard wizard
 *    (consultation/new/page.tsx: `mode: path === "lawyer" ? mode : "ai"`).
 *  - `metadata.consultTypeId` — /book/consultation, via
 *    buildConsultationIntake.ts:176. Its ConsultationType union
 *    ("ai" | "voice" | "video" | "in-person",
 *    src/components/consultation/constants.ts:14) uses the same vocabulary —
 *    the value was simply never read, so every booking made on the public form
 *    showed no session type at all on either consultation screen.
 *
 * WHY "ai" IS REFUSED FROM `consultTypeId` AND ACCEPTED FROM `mode`. The two
 * keys do not mean the same thing by that word:
 *
 *  - The dashboard wizard's AI path routes the client into the assistant — its
 *    confirmation screen reads «جاهز لتشغيل المساعد» and its button opens
 *    /ai/consult. An AI is what answers.
 *  - /book/consultation's «نظامي AI» option routes nowhere. Its own timing
 *    line for that id is «دون موعد محدد — يُنفَّذ من فريق نظامي»
 *    (buildConsultationIntake.ts:94) — the نظامي team executes it — and
 *    nothing on that form opens the assistant.
 *
 * Honouring it would put the robot mark and the words «نظامي AI» on the list
 * card of a request a person fulfils, which is the exact defect the list page
 * removed when it stopped keying that badge off `receiver`. The three human
 * ids carry no such ambiguity: «استشارة صوتية / مرئية / حضورية — مع محامٍ
 * معتمد» is the same fact `metadata.mode` states, so they are read. The
 * ambiguous one is dropped and its row simply does not render.
 *
 * Reconciled on the READER side rather than by writing `mode` in
 * useConsultationForm.ts, which is not this pass's file; writing it there —
 * for the three human types — is the better fix and is reported as a follow-up.
 *
 * A value that is not a key of CHANNEL_LABEL — or no value at all — yields
 * null, and a null channel renders NO session-type row anywhere. There is no
 * default: guessing «مرئية» for a row that never recorded one is the class of
 * invention this codebase is removing.
 */
export function readConsultChannel(
  metadata: Record<string, unknown> | null | undefined,
): ConsultChannel | null {
  const mode = channelFromValue(metadata?.mode);
  if (mode) return mode;
  const bookingType = channelFromValue(metadata?.consultTypeId);
  return bookingType && bookingType !== "ai" ? bookingType : null;
}

export const IS_BETA = true; // Beta flag — system assigns lawyer, client cannot choose

// Step 3 is «المراجعة والإرسال», not «التأكيد والدفع». That step takes NO
// payment: its button reads «إرسال الطلب» and its own banner says «إرسال الطلب
// مجاني — لا يُطلب منك أي دفع في هذه الخطوة» (consultation/new/page.tsx). The
// progress bar and the body of the step were contradicting each other on the
// same render, and the bar was the half making the promise — there is no
// payment gateway behind it to keep.
export const STEP_LABELS = ["نوع الاستشارة", "التفاصيل", "المراجعة والإرسال"];
