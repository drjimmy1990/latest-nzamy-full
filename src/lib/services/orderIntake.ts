/**
 * orderIntake.ts — pure intake contract for AI service orders.
 *
 * service_requests.metadata is untyped jsonb, so this module is the single
 * validation boundary before a wizard payload is persisted. Pure: no I/O, no
 * clock, no Supabase — unit-testable with `node --test`.
 */

import type { PartyData } from "@/components/draft/draftConstants";

export type ServiceKey = "draft" | "contracts" | "wargaming" | "legal_opinion";

export const SERVICE_TYPE_BY_KEY: Record<ServiceKey, string> = {
  draft: "ai_draft",
  contracts: "ai_contracts",
  wargaming: "ai_wargaming",
  legal_opinion: "ai_legal_opinion",
};

export const SERVICE_TITLE_AR: Record<ServiceKey, string> = {
  draft: "الصائغ القانوني",
  contracts: "محترف العقود",
  wargaming: "المحاكي الشامل",
  legal_opinion: "الرأي الفصل",
};

export interface OrderAttachment {
  documentId: string;
  name: string;
  size: number;
}

export interface DraftIntakeV1 {
  schemaVersion: 1;
  service: "draft";
  clientRole: "plaintiff" | "defendant";
  memoType: string;
  memoSubType?: string;
  legalBranch: string;
  caseText: string;
  parties: { one: Partial<PartyData>; two: Partial<PartyData> };
  judgment?: {
    number?: string; court?: string; date?: string;
    text?: string; reasons?: string;
  };
  lawyerNotes?: string;
  attachments: OrderAttachment[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const MIN_CASE_TEXT = 30;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function validateDraftIntake(input: unknown): ValidationResult<DraftIntakeV1> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["البيانات المرسلة غير صالحة"] };
  }

  const service = str(input.service);
  if (service !== "draft") {
    errors.push("نوع الخدمة غير صحيح");
  }

  const clientRole = str(input.clientRole);
  if (clientRole !== "plaintiff" && clientRole !== "defendant") {
    errors.push("صفة الموكل غير محددة");
  }

  const memoType = str(input.memoType);
  if (!memoType) errors.push("نوع المذكرة مطلوب");

  const legalBranch = str(input.legalBranch);
  if (!legalBranch) errors.push("الفرع القانوني مطلوب");

  const caseText = str(input.caseText);
  if (caseText.length < MIN_CASE_TEXT) {
    errors.push(`الوقائع قصيرة جداً — الحد الأدنى ${MIN_CASE_TEXT} حرفاً`);
  }

  const partiesRaw = isRecord(input.parties) ? input.parties : null;
  if (!partiesRaw || !isRecord(partiesRaw.one) || !isRecord(partiesRaw.two)) {
    errors.push("بيانات الأطراف غير مكتملة");
  }

  const attachmentsRaw = Array.isArray(input.attachments) ? input.attachments : [];
  const attachments: OrderAttachment[] = [];
  attachmentsRaw.forEach((a, i) => {
    if (!isRecord(a) || !str(a.documentId)) {
      errors.push(`المرفق رقم ${i + 1} غير صالح`);
      return;
    }
    attachments.push({
      documentId: str(a.documentId),
      name: str(a.name) || "مرفق",
      size: typeof a.size === "number" && a.size >= 0 ? a.size : 0,
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  const judgmentRaw = isRecord(input.judgment) ? input.judgment : null;

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      service: "draft",
      clientRole: clientRole as "plaintiff" | "defendant",
      memoType,
      ...(str(input.memoSubType) ? { memoSubType: str(input.memoSubType) } : {}),
      legalBranch,
      caseText,
      parties: {
        one: (partiesRaw!.one as Partial<PartyData>),
        two: (partiesRaw!.two as Partial<PartyData>),
      },
      ...(judgmentRaw
        ? {
            judgment: {
              number: str(judgmentRaw.number), court: str(judgmentRaw.court),
              date: str(judgmentRaw.date), text: str(judgmentRaw.text),
              reasons: str(judgmentRaw.reasons),
            },
          }
        : {}),
      ...(str(input.lawyerNotes) ? { lawyerNotes: str(input.lawyerNotes) } : {}),
      attachments,
    },
  };
}
