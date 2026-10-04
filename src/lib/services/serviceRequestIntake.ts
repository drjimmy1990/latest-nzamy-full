/**
 * serviceRequestIntake.ts — the shape contract for POST /api/v1/service-requests,
 * enforced on the server (UAT-LIVE-CASE-001).
 * ─────────────────────────────────────────────────────────
 * The route used to take `requestData.title` verbatim into an insert whose
 * column is `text not null` with no length or emptiness check
 * (20260518_client_workflow_backend_ready.sql:8), so `""` persisted happily —
 * and the one form that could produce it, AddCaseModal, invented a title
 * rather than refusing («قضية — عميل نظامي»). A case whose title nobody typed
 * is a case nobody can find again.
 *
 * `checkOrderIntake` (intakeGuard.ts) is NOT this: it validates
 * `metadata.intake` for the four AI services and passes everything else
 * through untouched. This validates the row's own columns, for every caller.
 *
 * Pure: no I/O, no clock, no Supabase, no framework imports — `node --test`
 * runs it directly, same house style as intakeGuard.ts and orderIntake.ts.
 *
 * The `type` and `receiver` vocabularies are the DB CHECK lists, copied from
 * the migrations rather than invented here, so a value this accepts can never
 * be one Postgres rejects with a 23514 the caller cannot read:
 *   type     — supabase/migrations/20260814_service_orders_types.sql:22-25
 *              (the latest redefinition; it superseded the five-value list in
 *              20260518:7 by adding the three non-draft AI services).
 *   receiver — supabase/migrations/20260518_client_workflow_backend_ready.sql:11
 *              (never redefined; 20260815 only references it in a comment).
 * Same lockstep rule the WorkflowRequest union in src/lib/workflowStore.ts:50-74
 * follows. If a migration ever extends either CHECK, extend the matching array
 * here in the same commit.
 */

export const SERVICE_REQUEST_TYPES = [
  "service",
  "consultation",
  "business_case",
  "ngo_volunteer",
  "ai_draft",
  "ai_contracts",
  "ai_wargaming",
  "ai_legal_opinion",
] as const;
export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];

export const SERVICE_REQUEST_RECEIVERS = [
  "lawyer",
  "firm",
  "provider",
  "business_legal",
  "ngo_admin",
  "government_reviewer",
  "ai_workspace",
] as const;
export type ServiceRequestReceiver = (typeof SERVICE_REQUEST_RECEIVERS)[number];

/** `service_requests.title` has no DB length limit; 200 is the product one. */
export const MAX_TITLE_LENGTH = 200;
/** Likewise `description` — the column is `text not null default ''`. */
export const MAX_DESCRIPTION_LENGTH = 5000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The validated, normalised values the route should insert. */
export interface ServiceRequestCreateValue {
  /** Trimmed, non-empty. */
  title: string;
  /** Trimmed; `""` when absent, matching the column default. */
  description: string;
  type: ServiceRequestType;
  receiver: ServiceRequestReceiver;
  /** The caller's `requester` jsonb, or `{}` when absent (the column default). */
  requester: Record<string, unknown>;
  /** Trimmed uuid, or null when the caller linked no client card. */
  lawyerClientId: string | null;
}

export type ServiceRequestCreateCheck =
  | { ok: true; value: ServiceRequestCreateValue }
  | { ok: false; status: 400; error: string };

/** Arabic, because every refusal here reaches a screen. */
const AR = {
  body: "تعذّرت قراءة بيانات الطلب.",
  titleRequired: "عنوان الطلب مطلوب.",
  titleLong: `عنوان الطلب طويل جداً — الحد ${MAX_TITLE_LENGTH} حرفاً.`,
  descriptionType: "وصف الطلب يجب أن يكون نصاً.",
  descriptionLong: `وصف الطلب طويل جداً — الحد ${MAX_DESCRIPTION_LENGTH} حرفاً.`,
  requesterShape: "بيانات مُقدّم الطلب غير صالحة.",
  lawyerClientId: "معرّف الموكّل غير صالح.",
  type: "نوع الطلب غير معروف.",
  receiver: "جهة استقبال الطلب غير معروفة.",
} as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const fail = (error: string): ServiceRequestCreateCheck => ({ ok: false, status: 400, error });

/**
 * Validates the flat request payload (the route unwraps `{ request: … }` for
 * us) and returns the normalised values to insert.
 *
 * Absent `type` / `receiver` / `description` / `requester` are accepted and
 * defaulted exactly as the route defaulted them before this existed, so no
 * current caller changes behaviour; a PRESENT value of the wrong shape is
 * refused rather than silently replaced — that substitution is the defect.
 */
export function validateServiceRequestCreate(body: unknown): ServiceRequestCreateCheck {
  if (!isPlainObject(body)) return fail(AR.body);

  // ── title: required, non-empty after trim, bounded ──────────────────────
  if (typeof body.title !== "string") return fail(AR.titleRequired);
  const title = body.title.trim();
  if (title.length === 0) return fail(AR.titleRequired);
  if (title.length > MAX_TITLE_LENGTH) return fail(AR.titleLong);

  // ── description: optional, string, bounded ──────────────────────────────
  let description = "";
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") return fail(AR.descriptionType);
    if (body.description.length > MAX_DESCRIPTION_LENGTH) return fail(AR.descriptionLong);
    description = body.description.trim();
  }

  // ── requester: optional, but a plain object when present ────────────────
  // It lands in a jsonb column and every reader treats it as a record
  // (`requester.name`, `requester.phone`); an array or a bare string there
  // reads back as an object with numeric keys, or throws at the first `.name`.
  let requester: Record<string, unknown> = {};
  if (body.requester !== undefined && body.requester !== null) {
    if (!isPlainObject(body.requester)) return fail(AR.requesterShape);
    requester = body.requester;
  }

  // ── lawyerClientId: optional, uuid when present ─────────────────────────
  // `public.lawyer_clients.id` is `uuid primary key`
  // (20260903_phase2…:135), so a non-uuid can only ever produce a 22P02 the
  // caller cannot read. The ownership check stays in the route — it needs the
  // database.
  let lawyerClientId: string | null = null;
  if (body.lawyerClientId !== undefined && body.lawyerClientId !== null && body.lawyerClientId !== "") {
    if (typeof body.lawyerClientId !== "string") return fail(AR.lawyerClientId);
    const candidate = body.lawyerClientId.trim();
    if (!UUID_RE.test(candidate)) return fail(AR.lawyerClientId);
    lawyerClientId = candidate;
  }

  // ── type / receiver: the DB CHECK lists ─────────────────────────────────
  let type: ServiceRequestType = "service";
  if (body.type !== undefined && body.type !== null) {
    if (typeof body.type !== "string" || !(SERVICE_REQUEST_TYPES as readonly string[]).includes(body.type)) {
      return fail(AR.type);
    }
    type = body.type as ServiceRequestType;
  }

  let receiver: ServiceRequestReceiver = "lawyer";
  if (body.receiver !== undefined && body.receiver !== null) {
    if (typeof body.receiver !== "string" || !(SERVICE_REQUEST_RECEIVERS as readonly string[]).includes(body.receiver)) {
      return fail(AR.receiver);
    }
    receiver = body.receiver as ServiceRequestReceiver;
  }

  return { ok: true, value: { title, description, type, receiver, requester, lawyerClientId } };
}
