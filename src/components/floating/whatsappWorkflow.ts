"use client";

import type { UserSession } from "@/hooks/useUser";
import {
  createWorkflowId,
  saveWorkflowRequest,
  type WorkflowRequest,
} from "@/lib/workflowStore";
import type { UserCategory, WaStep } from "./types";
import {
  CATEGORY_LABELS,
  getFloatingActorContext,
  resolveFloatingCategory,
} from "./roleContext";

export const NZAMY_WHATSAPP_NUMBER = "966560655552";

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
  id: string;
  href: string;
  message: string;
};

export type WhatsAppQuickRequestDefinition = {
  title: string;
  description: string;
  receiver: WorkflowRequest["receiver"];
  requestType?: WorkflowRequest["type"];
  amount?: number;
  status?: WorkflowRequest["status"];
  paymentStatus?: WorkflowRequest["payment"]["status"];
  metadata?: Record<string, string | number | boolean | null>;
};

const PAYMENT_LABELS: Record<string, string> = {
  mada: "مدى",
  visa: "Visa / Mastercard",
  stc: "STC Pay",
  apple: "Apple Pay",
  not_required: "غير مطلوب الآن",
};

function getDefaultReceiver(category: string): WorkflowRequest["receiver"] {
  if (category === "firm") return "firm";
  if (category === "corporate" || category === "business") return "business_legal";
  if (category === "ngo") return "ngo_admin";
  if (category === "government") return "government_reviewer";
  if (category === "lawyer" || category === "admin") return "ai_workspace";
  return "lawyer";
}

function getServiceKind(history: WaStep[], selections: Record<string, string>, category: string) {
  const defaultReceiver = getDefaultReceiver(category);

  if (history.some((step) => step.startsWith("consult"))) {
    return {
      title: category === "government" ? "طلب دعم قانوني حكومي" : "طلب استشارة قانونية",
      requestType: "consultation" as const,
      receiver: defaultReceiver,
      amount: selections.provider === "ai" ? 50 : selections.provider === "lawyer" ? 700 : 0,
    };
  }

  if (history.some((step) => step.startsWith("contract"))) {
    return {
      title: category === "firm" ? "طلب مراجعة عقد داخل المكتب" : "طلب مراجعة عقد",
      requestType: "service" as const,
      receiver: defaultReceiver,
      amount: selections.contractService === "ai-review" ? 150 : selections.contractService === "lawyer-review" ? 499 : 0,
    };
  }

  if (history.some((step) => step.startsWith("representation"))) {
    return {
      title: "طلب تمثيل قضائي",
      requestType: category === "corporate" || category === "business" ? "business_case" as const : "service" as const,
      receiver: defaultReceiver,
      amount: 0,
    };
  }

  if (history.some((step) => step.startsWith("notary"))) {
    return {
      title: "طلب توثيق",
      requestType: "service" as const,
      receiver: "provider" as const,
      amount: 0,
    };
  }

  return {
    title: "طلب خدمة قانونية",
    requestType: "service" as const,
    receiver: defaultReceiver,
    amount: 0,
  };
}

function compactRows(rows: Array<[string, string | null | undefined]>) {
  return rows
    .filter(([, value]) => value && String(value).trim().length > 0)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

export function buildWhatsAppHref(message: string, phone = NZAMY_WHATSAPP_NUMBER) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildSupportWhatsAppHref(input: {
  user: UserSession;
  userCategory: UserCategory;
  sourcePath: string;
}) {
  const category = resolveFloatingCategory(input.user, input.userCategory);
  const actor = getFloatingActorContext(input.user, input.userCategory);
  const message = [
    "مرحباً فريق نظامي، أحتاج مساعدة من زر واتساب العائم.",
    compactRows([
      ["الاسم", input.user.name || "زائر"],
      ["نوع المستخدم", CATEGORY_LABELS[String(category)] ?? String(category)],
      ["الدور", actor.roleLabel],
      ["الكيان", actor.entityName],
      ["النطاق", actor.scopeLabel],
      ["المسار الحالي", input.sourcePath],
      ["حالة التنفيذ", "واجهة محلية جاهزة للربط بالباك إند"],
    ]),
  ].filter(Boolean).join("\n");

  return buildWhatsAppHref(message);
}

export function createWhatsAppWorkflow(input: WhatsAppWorkflowInput): WhatsAppWorkflowReceipt {
  const id = createWorkflowId("WA");
  const category = resolveFloatingCategory(input.user, input.userCategory);
  const actor = getFloatingActorContext(input.user, input.userCategory);
  const service = getServiceKind(input.history, input.selections, String(category));
  const paymentLabel = PAYMENT_LABELS[input.paymentMethod] ?? input.paymentMethod;
  const schedule = input.calDay && input.calSlot ? `${input.calDay} - ${input.calSlot}` : "";
  const description = input.detailsDesc || input.contractNotes || input.repDetails || "طلب وارد من ويدجت واتساب";

  const rows = compactRows([
    ["رقم الطلب", id],
    ["الخدمة", service.title],
    ["الاسم", input.user.name || "زائر"],
    ["نوع المستخدم", CATEGORY_LABELS[String(category)] ?? String(category)],
    ["الدور", actor.roleLabel],
    ["الكيان", actor.entityName],
    ["النطاق", actor.scopeLabel],
    ["العنوان", input.detailsTitle],
    ["الوصف", description],
    ["طريقة الاستشارة", input.selections.modality],
    ["مزود الاستشارة", input.selections.provider === "ai" ? "نظامي AI" : input.selections.provider === "lawyer" ? "محام متخصص" : input.selections.provider],
    ["نوع العقد", input.selections.contractType],
    ["مراجعة العقد", input.selections.contractService],
    ["التخصص", input.selections.specialty],
    ["المدينة", input.selections.city],
    ["نوع الوثيقة", input.selections.notaryType],
    ["الاستعجال", input.selections.urgency],
    ["الموعد", schedule],
    ["طريقة الدفع المختارة", paymentLabel],
    ["المسار", input.sourcePath],
    ["حالة التنفيذ", "محلي وجاهز للباك إند"],
  ]);

  const message = `مرحباً، أرسلت طلباً عبر نظامي:\n${rows}\n\nأرغب في متابعة الطلب عبر واتساب.`;

  const request: Omit<WorkflowRequest, "createdAt" | "auditTrail"> & { auditEvent: string } = {
    id,
    type: service.requestType,
    title: service.title,
    description,
    requester: {
      userId: input.user.userId,
      name: input.user.name || "زائر",
      role: input.user.userType,
      tier: input.user.tier,
      businessRole: input.user.businessRole,
      affiliationRole: input.user.affiliation?.role,
      governmentRole: input.user.governmentRole,
      providerRole: input.user.subRole === "notary" || input.user.subRole === "bailiff" || input.user.subRole === "arbitrator"
        ? input.user.subRole
        : undefined,
      roleLabel: actor.roleLabel,
      entityName: actor.entityName,
      entityType: actor.entityType,
    },
    receiver: service.receiver,
    status: service.amount > 0 ? "pending_payment" : "pending_assignment",
    payment: {
      amount: service.amount,
      status: service.amount > 0 ? "pending" : "not_required",
    },
    sourcePath: input.sourcePath,
    metadata: {
      source: "floating_whatsapp",
      userCategory: category ? String(category) : "guest",
      roleKey: actor.roleKey ?? null,
      roleLabel: actor.roleLabel ?? null,
      entityName: actor.entityName ?? null,
      scopeLabel: actor.scopeLabel,
      paymentMethod: input.paymentMethod,
      modality: input.selections.modality ?? null,
      provider: input.selections.provider ?? null,
      contractType: input.selections.contractType ?? null,
      contractService: input.selections.contractService ?? null,
      specialty: input.selections.specialty ?? null,
      city: input.selections.city ?? null,
      notaryType: input.selections.notaryType ?? null,
      urgency: input.selections.urgency ?? null,
      schedule,
    },
    auditEvent: `created from floating WhatsApp widget via ${paymentLabel}`,
  };

  saveWorkflowRequest(request);

  return {
    id,
    href: buildWhatsAppHref(message),
    message,
  };
}

export function createQuickWhatsAppWorkflow(input: {
  quickRequest: WhatsAppQuickRequestDefinition;
  user: UserSession;
  userCategory: UserCategory;
  sourcePath: string;
  serviceKey: string;
  serviceLabel: string;
}): WhatsAppWorkflowReceipt {
  const id = createWorkflowId("WA");
  const category = resolveFloatingCategory(input.user, input.userCategory);
  const actor = getFloatingActorContext(input.user, input.userCategory);
  const amount = input.quickRequest.amount ?? 0;
  const paymentStatus = input.quickRequest.paymentStatus ?? (amount > 0 ? "pending" : "not_required");
  const status = input.quickRequest.status ?? (amount > 0 ? "pending_payment" : "pending_assignment");

  const rows = compactRows([
    ["رقم الطلب", id],
    ["الخدمة", input.quickRequest.title],
    ["الاسم", input.user.name || "زائر"],
    ["نوع المستخدم", CATEGORY_LABELS[String(category)] ?? String(category)],
    ["الدور", actor.roleLabel],
    ["الكيان", actor.entityName],
    ["النطاق", actor.scopeLabel],
    ["الوصف", input.quickRequest.description],
    ["المسار", input.sourcePath],
    ["حالة التنفيذ", "تم تسجيل طلب محلي وجاهز للربط بالباك إند"],
  ]);

  const message = `مرحباً، أرسلت طلباً سريعاً عبر زر واتساب في نظامي:\n${rows}\n\nأرغب في متابعة الطلب عبر واتساب.`;

  const request: Omit<WorkflowRequest, "createdAt" | "auditTrail"> & { auditEvent: string } = {
    id,
    type: input.quickRequest.requestType ?? "service",
    title: input.quickRequest.title,
    description: input.quickRequest.description,
    requester: {
      userId: input.user.userId,
      name: input.user.name || "زائر",
      role: input.user.userType,
      tier: input.user.tier,
      businessRole: input.user.businessRole,
      affiliationRole: input.user.affiliation?.role,
      governmentRole: input.user.governmentRole,
      providerRole: input.user.subRole === "notary" || input.user.subRole === "bailiff" || input.user.subRole === "arbitrator"
        ? input.user.subRole
        : undefined,
      roleLabel: actor.roleLabel,
      entityName: actor.entityName,
      entityType: actor.entityType,
    },
    receiver: input.quickRequest.receiver,
    status,
    payment: {
      amount,
      status: paymentStatus,
    },
    sourcePath: input.sourcePath,
    metadata: {
      source: "floating_whatsapp_quick_action",
      userCategory: String(category),
      serviceKey: input.serviceKey,
      serviceLabel: input.serviceLabel,
      roleKey: actor.roleKey ?? null,
      roleLabel: actor.roleLabel ?? null,
      entityName: actor.entityName ?? null,
      scopeLabel: actor.scopeLabel,
      backendReady: true,
      ...(input.quickRequest.metadata ?? {}),
    },
    auditEvent: "created from floating WhatsApp role-aware quick action",
  };

  saveWorkflowRequest(request);

  return {
    id,
    href: buildWhatsAppHref(message),
    message,
  };
}
