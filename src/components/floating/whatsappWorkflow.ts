"use client";

import type { UserSession } from "@/hooks/useUser";
import { createWorkflowId, createWorkflowRequest, WorkflowApiError } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest } from "@/lib/workflowStore";
import type { UserCategory, WaStep } from "./types";
import {
  CATEGORY_LABELS,
  getFloatingActorContext,
  resolveFloatingCategory,
} from "./roleContext";
import {
  buildWhatsAppHref as buildHref,
  buildWhatsAppMessage,
  buildWhatsAppRequestContent,
  resolveWhatsAppFlow,
  whatsAppRequestType,
  type WhatsAppActorSummary,
  type WhatsAppMetaValue,
  type WhatsAppOutcome,
} from "@/lib/services/whatsappRequestMessage";

export const NZAMY_WHATSAPP_NUMBER = "966560655552";

/**
 * WHAT CHANGED HERE, AND WHY
 *
 * Both creators used to end in `saveWorkflowRequest(request)` — that is
 * src/lib/workflowStore.ts:109, which calls `createWorkflowRequestLocal`:
 * browser localStorage. Nothing server-side ever saw a request placed through
 * the floating widget, on any page, for any account. The success screen still
 * printed a reference number and the WhatsApp message still said the request
 * had been "registered".
 *
 * Two changes make that sentence true or make it stop being said:
 *
 *  1. A signed-in visitor's request now goes through `createWorkflowRequest`
 *     (src/lib/clientWorkflowRepository.ts:327 → POST
 *     /api/v1/service-requests), the same path the client request form uses.
 *
 *  2. `receiver` is the LITERAL "ai_workspace" on every row, never a value
 *     derived from the visitor's category. The admin fulfilment queue hard
 *     filters `.eq("receiver","ai_workspace")`
 *     (src/app/api/v1/admin/service-orders/route.ts:54), so the old
 *     `getDefaultReceiver()` — which returned `firm` / `business_legal` /
 *     `ngo_admin` / `government_reviewer` / `lawyer` by category — wrote rows
 *     nobody in the office could open. That function is deleted rather than
 *     left unused, and `receiver` is gone from
 *     `WhatsAppQuickRequestDefinition` too: an unused knob that selects
 *     invisibility is a loaded gun, and this is the fourth intake path to fire
 *     it. Marketplace routing, if it ever exists, is a migration
 *     (20260815_marketplace_excludes_ai_workspace.sql) plus a queue change, not
 *     a per-card constant.
 *
 * WHAT IS STILL NOT PROMISED. An anonymous visitor gets no row: the POST is a
 * 401 because there is no session, and the widget is mounted for signed-out
 * visitors on every page. That outcome is reported as itself — WhatsApp-only,
 * no reference — rather than smoothed into a success screen. The wa.me link
 * opens in every case; it is the part of this widget that has always genuinely
 * worked and the office relies on it.
 */

type WhatsAppWorkflowInput = {
  history: WaStep[];
  selections: Record<string, string>;
  detailsTitle: string;
  detailsDesc: string;
  contractNotes: string;
  repDetails: string;
  calDay: string | null;
  calSlot: string | null;
  paymentMethod: string;
  user: UserSession;
  userCategory: UserCategory;
  sourcePath: string;
};

export type WhatsAppWorkflowReceipt = {
  /**
   * What actually happened. There is no `id` field any more: a reference only
   * exists inside `{ kind: "recorded" }`, so no screen can print one for a row
   * that was never created.
   */
  outcome: WhatsAppOutcome;
  href: string;
  message: string;
};

/**
 * A quick-action card's request, as declared in
 * ./constants/floatingServices.tsx.
 *
 * `receiver`, `amount`, `status` and `paymentStatus` were all removed. Every
 * widget request is now created the one way that reaches the team: receiver
 * "ai_workspace", status "pending_assignment", payment 0 / not_required. There
 * is no payment gateway, so a card that could set an amount could only produce
 * a row born «بانتظار الدفع» that the client has no way to clear — and POST
 * /api/v1/service-requests would refuse it outright with a 402 (route.ts:166,
 * fires on `Number(payment.amount) > 0`).
 */
export type WhatsAppQuickRequestDefinition = {
  title: string;
  description: string;
  requestType?: WorkflowRequest["type"];
  /** Machine ids for `metadata`'s top level. Never rendered to anyone. */
  metadata?: Record<string, WhatsAppMetaValue>;
};

export function buildWhatsAppHref(message: string, phone = NZAMY_WHATSAPP_NUMBER) {
  return buildHref(message, phone);
}

/** Who is asking, with no invented values: an unnamed visitor has no «الاسم» row. */
function actorSummary(user: UserSession, userCategory: UserCategory): WhatsAppActorSummary {
  const category = resolveFloatingCategory(user, userCategory);
  const actor = getFloatingActorContext(user, userCategory);
  return {
    name: (user.name ?? "").trim(),
    categoryLabel: CATEGORY_LABELS[String(category)] ?? String(category),
    roleLabel: actor.roleLabel,
    entityName: actor.entityName,
    scopeLabel: actor.scopeLabel,
  };
}

function requesterOf(user: UserSession, roleLabel?: string, entityName?: string, entityType?: string) {
  return {
    userId: user.userId,
    name: (user.name ?? "").trim(),
    role: user.userType,
    tier: user.tier,
    businessRole: user.businessRole,
    affiliationRole: user.affiliation?.role,
    governmentRole: user.governmentRole,
    providerRole:
      user.subRole === "notary" || user.subRole === "bailiff" || user.subRole === "arbitrator"
        ? user.subRole
        : undefined,
    roleLabel,
    entityName,
    entityType,
  };
}

/**
 * Create the row, and report what happened — never what was hoped for.
 *
 * THE TEST IS `requester_user_id`, NOT "the promise resolved".
 * `createWorkflowRequest` falls back to `createWorkflowRequestLocal` whenever
 * NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND is not "supabase"
 * (clientWorkflowRepository.ts:16 and :329). That path writes localStorage and
 * returns a perfectly normal-looking WorkflowRequest — no throw, no signal. A
 * caller that treated "it resolved" as "it was recorded" would print a
 * reference for a row nobody in the office can see, which is the exact defect
 * this change exists to end. `requester_user_id` is the server-set column
 * (workflowStore.ts documents it as the authoritative answer to "whose request
 * is this"), and locally-built rows never carry it.
 *
 * The reference comes off the RESPONSE, not off the id passed in. The local id
 * exists before the row does; reading it back makes quoting a phantom
 * reference structurally impossible rather than conditionally avoided. POST
 * /api/v1/service-requests answers `{ data: toWorkflowRequest(row) }` where the
 * row is the inserted one spread verbatim (route.ts:16-24 and :247-249), so
 * both `id` and the server-set `requester_user_id` are on it.
 *
 * WHY THERE IS NO `if (!user.isLoggedIn)` SHORT-CIRCUIT HERE.
 * There was one, and it was wrong for the one-tap cards. `useUser` starts at
 * GUEST_SESSION — `isLoggedIn: false` — and only resolves to the real session
 * after two round trips (src/hooks/useUser.ts:638-641, :698). A quick action is
 * one click after the panel opens, so a signed-in client who is quick enough
 * would have been told «لست مسجّل الدخول» and given no row, while the office
 * got nothing but a WhatsApp message. The server is the authority on whether a
 * session exists and it answers 401 when there is none; that costs one wasted
 * POST per genuinely anonymous submit, which is nothing beside lying to a
 * signed-in client about their own account.
 */
async function recordWidgetRequest(
  request: Omit<WorkflowRequest, "createdAt" | "auditTrail"> & { auditEvent: string },
): Promise<WhatsAppOutcome> {
  try {
    const created = await createWorkflowRequest(request);
    const owner = created?.requester_user_id;
    if (typeof owner === "string" && owner.length > 0 && created.id) {
      return { kind: "recorded", reference: created.id };
    }
    console.error("[whatsapp widget] request was not persisted server-side (no requester_user_id)");
    return { kind: "whatsapp_only", reason: "not_recorded" };
  } catch (err) {
    // 401 is the ONLY signal that there is no session — see the note above.
    // Every other failure is a failure, and is reported as one rather than as
    // a success screen.
    if (err instanceof WorkflowApiError && err.status === 401) {
      return { kind: "whatsapp_only", reason: "anonymous" };
    }
    console.error("[whatsapp widget] submit failed:", err);
    return { kind: "whatsapp_only", reason: "not_recorded" };
  }
}

export function buildSupportWhatsAppHref(input: {
  user: UserSession;
  userCategory: UserCategory;
  sourcePath: string;
}) {
  const actor = actorSummary(input.user, input.userCategory);
  // This one opens a conversation; it creates nothing and claims nothing. The
  // row it used to carry — «حالة التنفيذ: واجهة محلية جاهزة للربط بالباك إند»
  // — described the state of an integration to a law office.
  const message = buildWhatsAppMessage({
    intro: "مرحباً فريق نظامي، أحتاج مساعدة من زر واتساب في الموقع.",
    serviceTitle: "طلب مساعدة/دعم",
    actor,
    sourcePath: input.sourcePath,
    // No `outcome`: nothing was submitted, so there is no request status to
    // report. The row that used to stand here said «حالة التنفيذ: واجهة محلية
    // جاهزة للربط بالباك إند».
    outro: "أرجو التواصل معي عبر واتساب.",
  });

  return buildWhatsAppHref(message);
}

/**
 * The multi-step wizard's submit.
 *
 * Async now, because creating the row is a network call. StepPayment navigates
 * to the success step in the same click handler that calls this
 * (StepPayment.tsx:83-84 and :104), so the caller must render a pending state
 * — see WhatsAppWidget.tsx.
 */
export async function createWhatsAppWorkflow(
  input: WhatsAppWorkflowInput,
): Promise<WhatsAppWorkflowReceipt> {
  const category = String(resolveFloatingCategory(input.user, input.userCategory));
  const actorContext = getFloatingActorContext(input.user, input.userCategory);
  const actor = actorSummary(input.user, input.userCategory);
  const flow = resolveWhatsAppFlow(input.history);

  const content = buildWhatsAppRequestContent({
    flow,
    category,
    history: input.history,
    answers: {
      detailsTitle: input.detailsTitle,
      detailsDesc: input.detailsDesc,
      contractNotes: input.contractNotes,
      repDetails: input.repDetails,
      calDay: input.calDay,
      calSlot: input.calSlot,
      paymentMethod: input.paymentMethod,
      selections: input.selections,
    },
  });

  const outcome = await recordWidgetRequest({
    id: createWorkflowId("WA"),
    type: whatsAppRequestType(flow, category),
    title: content.title,
    description: content.description,
    requester: requesterOf(
      input.user,
      actorContext.roleLabel,
      actorContext.entityName,
      actorContext.entityType,
    ),
    receiver: "ai_workspace",
    status: "pending_assignment",
    payment: { amount: 0, status: "not_required" },
    sourcePath: input.sourcePath,
    metadata: {
      source: "floating_whatsapp",
      channel: "whatsapp_widget",
      // The admin queue filters on `metadata->>service`
      // (api/v1/admin/service-orders/route.ts:65), so this is what lets the
      // team isolate widget requests. It is safe precisely because it is NOT
      // one of the four AI service keys — see the note on `intake` below.
      service: "whatsapp_widget",
      // Read for the heading by every surface that renders an ai_workspace
      // order (/ai/orders, /ai/orders/[id], buildOrderPrompt). Without it the
      // title is blank on all three.
      serviceTitleAr: content.title,
      userCategory: category,
      roleKey: actorContext.roleKey ?? null,
      roleLabel: actorContext.roleLabel ?? null,
      entityName: actorContext.entityName ?? null,
      scopeLabel: actorContext.scopeLabel,
      ...content.ids,
      // buildOrderPrompt (src/lib/services/orderPrompt.ts) reads
      // `metadata.intake` and NOTHING ELSE when it renders the brief the
      // fulfilment officer works from. Every flat key above is invisible to
      // them, which is why the answers are duplicated in here as Arabic.
      intake: content.intake,
    },
    auditEvent: "floating_whatsapp_request_created",
  });

  const message = buildWhatsAppMessage({
    intro: "مرحباً، أرسلت طلباً عبر نظامي:",
    serviceTitle: content.title,
    actor,
    sourcePath: input.sourcePath,
    outcome,
    detailRows: content.rows,
  });

  return { outcome, href: buildWhatsAppHref(message), message };
}

/** The one-tap cards on the service list. Same rules, fewer answers. */
export async function createQuickWhatsAppWorkflow(input: {
  quickRequest: WhatsAppQuickRequestDefinition;
  user: UserSession;
  userCategory: UserCategory;
  sourcePath: string;
  serviceKey: string;
  serviceLabel: string;
}): Promise<WhatsAppWorkflowReceipt> {
  const category = String(resolveFloatingCategory(input.user, input.userCategory));
  const actorContext = getFloatingActorContext(input.user, input.userCategory);
  const actor = actorSummary(input.user, input.userCategory);

  const outcome = await recordWidgetRequest({
    id: createWorkflowId("WA"),
    type: input.quickRequest.requestType ?? "service",
    title: input.quickRequest.title,
    description: input.quickRequest.description,
    requester: requesterOf(
      input.user,
      actorContext.roleLabel,
      actorContext.entityName,
      actorContext.entityType,
    ),
    receiver: "ai_workspace",
    status: "pending_assignment",
    payment: { amount: 0, status: "not_required" },
    sourcePath: input.sourcePath,
    metadata: {
      source: "floating_whatsapp_quick_action",
      channel: "whatsapp_widget",
      // The admin queue filters on `metadata->>service`
      // (api/v1/admin/service-orders/route.ts:65), so this is what lets the
      // team isolate widget requests. It is safe precisely because it is NOT
      // one of the four AI service keys — see the note on `intake` below.
      service: "whatsapp_widget",
      serviceTitleAr: input.quickRequest.title,
      userCategory: category,
      serviceKey: input.serviceKey,
      serviceLabel: input.serviceLabel,
      roleKey: actorContext.roleKey ?? null,
      roleLabel: actorContext.roleLabel ?? null,
      entityName: actorContext.entityName ?? null,
      scopeLabel: actorContext.scopeLabel,
      // The card's own ids (businessRole, sector, persona, …) stay at the top
      // level: they are English machine values, and buildSummaryRows would
      // print them into the team's brief under their raw key.
      ...(input.quickRequest.metadata ?? {}),
      // `service: "whatsapp_widget"` is deliberately NOT one of the four AI
      // service keys — checkOrderIntake (src/lib/services/intakeGuard.ts) would
      // otherwise run an AI validator over this two-field intake and 400 the
      // request. It is a HIDDEN_INTAKE_KEY, so it never prints.
      intake: {
        service: "whatsapp_widget",
        schemaVersion: 1,
        // «الوصف» in INTAKE_LABELS — the one thing a quick action collects, and
        // without it the brief renders «—» under «بيانات العميل المُدخلة».
        description: input.quickRequest.description,
      },
    },
    auditEvent: "floating_whatsapp_quick_request_created",
  });

  const message = buildWhatsAppMessage({
    intro: "مرحباً، أرسلت طلباً سريعاً عبر زر واتساب في نظامي:",
    serviceTitle: input.quickRequest.title,
    actor,
    sourcePath: input.sourcePath,
    outcome,
    detailRows: [["الوصف", input.quickRequest.description]],
  });

  return { outcome, href: buildWhatsAppHref(message), message };
}
