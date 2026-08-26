/**
 * «تعديل الطلب قبل بدء التنفيذ» — owner item ٥.
 *
 * The client submits an order, immediately spots a wrong date or a missing
 * detail, and today has exactly two options: cancel and start over, or message
 * support and hope. This decides when they may simply fix it.
 *
 * The gate lives here — a pure function with no Supabase in sight — for one
 * reason: it must be enforced on the SERVER. A component that hides the button
 * is a courtesy; the request handler is the only thing standing between a
 * client and rewriting an order the team has already started reading. Any UI
 * that shows the button asks this same function, so the two can never disagree
 * about what is editable.
 */

export type OrderEditRefusal =
  | "not_owner"
  | "not_pending"
  | "already_assigned"
  | "already_delivered";

export interface OrderEditability {
  editable: boolean;
  reason: OrderEditRefusal | null;
  /** Arabic, ready to render or return — never a raw reason token. */
  message: string;
}

const MESSAGES: Record<OrderEditRefusal, string> = {
  not_owner: "لا يمكن تعديل طلب لم تقدّمه بنفسك.",
  // The three below are worded as facts about the order rather than as
  // refusals, because that is what they are: the client did nothing wrong,
  // the work simply moved on.
  not_pending: "بدأ العمل على هذا الطلب — لم يعد التعديل متاحاً. تواصل مع الفريق لأي إضافة.",
  already_assigned: "استلم الفريق هذا الطلب — لم يعد التعديل متاحاً. تواصل مع الفريق لأي إضافة.",
  already_delivered: "تم تسليم هذا الطلب. استخدم «طلب تعديل» على المستند المسلَّم.",
};

export function evaluateOrderEditability(input: {
  requesterUserId: string | null | undefined;
  callerUserId: string;
  status: string | null | undefined;
  assignedTo: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
}): OrderEditability {
  const refuse = (reason: OrderEditRefusal): OrderEditability => ({
    editable: false,
    reason,
    message: MESSAGES[reason],
  });

  if (!input.requesterUserId || input.requesterUserId !== input.callerUserId) {
    return refuse("not_owner");
  }

  // `pending_assignment` is the ONLY editable status. `in_review` means
  // somebody is reading it right now; `draft` and `pending_payment` are
  // reachable states but they are pre-submission and have their own forms;
  // `completed`/`cancelled` are decided.
  if (input.status !== "pending_assignment") {
    // A delivered order gets the more specific message — it has a real
    // alternative (the revisions policy), and telling that client «بدأ العمل»
    // would be both wrong and useless.
    const md = input.metadata ?? {};
    if (input.status === "completed" || md.deliverable) return refuse("already_delivered");
    return refuse("not_pending");
  }

  // Belt and braces with the status check: an order routed to a named member
  // («توجيه», owner item ١٣) deliberately STAYS at `pending_assignment`, so
  // status alone would let a client edit work already sitting on someone's
  // desk. This is the check that catches it.
  if (input.assignedTo) return refuse("already_assigned");

  // Cannot normally coexist with `pending_assignment`, and checked anyway:
  // metadata is written by several handlers and a delivered order that was
  // somehow re-opened must never become editable.
  if ((input.metadata ?? {}).deliverable) return refuse("already_delivered");

  return { editable: true, reason: null, message: "" };
}

/** The most a client may put in one edit. Long enough for a real correction,
 *  short enough that the column is not an attack surface. */
export const MAX_EDIT_LENGTH = 5000;

export function validateEditedDescription(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "تفاصيل الطلب مطلوبة." };
  const value = raw.trim();
  if (!value) return { ok: false, error: "تفاصيل الطلب مطلوبة." };
  if (value.length > MAX_EDIT_LENGTH) {
    return { ok: false, error: `تفاصيل الطلب أطول من الحد المسموح (${MAX_EDIT_LENGTH} حرف).` };
  }
  return { ok: true, value };
}

export interface OrderEdit { at: string; previous: string }

/**
 * Append-only. The previous text is KEPT rather than overwritten: this is a
 * law office, and «العميل قال كذا» has to remain answerable after the client
 * has changed what he said. The admin card renders the count so the fulfiller
 * knows the brief moved under them.
 *
 * Capped so a client cannot grow one row without bound; the OLDEST entries are
 * the ones dropped, since the most recent corrections are the ones anyone
 * needs.
 */
export const MAX_EDIT_HISTORY = 20;

export function appendEditHistory(
  metadata: Record<string, unknown> | null | undefined,
  previousDescription: string,
  nowIso: string,
): OrderEdit[] {
  const existing = (metadata ?? {}).editHistory;
  const list: OrderEdit[] = Array.isArray(existing)
    ? existing.filter(
        (e): e is OrderEdit =>
          !!e && typeof e === "object" &&
          typeof (e as OrderEdit).at === "string" &&
          typeof (e as OrderEdit).previous === "string",
      )
    : [];
  const next = [...list, { at: nowIso, previous: previousDescription }];
  return next.slice(-MAX_EDIT_HISTORY);
}
