"use client";

/**
 * OrderSummary.tsx — Task 6, Step 3.
 *
 * Shows the client a record of what they actually sent: their intake
 * answers and their own uploaded attachments. `metadata.intake` has a
 * different shape per service (DraftIntakeV1 / ContractsIntakeV1 /
 * WargamingIntakeV1 / LegalOpinionIntakeV1 — see
 * src/lib/services/orderIntake*.ts), so this renders it generically —
 * iterate the object, skip empty values, label each key from a lookup with
 * a fallback to the raw key — rather than four bespoke layouts.
 *
 * Deliberately does NOT import buildOrderPrompt (the admin-facing prompt
 * builder, Task 4): that output is written to brief an admin on how to
 * fulfil the order, phrased and shaped for that audience. A client re-reading
 * their own submission needs a receipt, not an internal work ticket.
 */

import { useState, type ReactNode } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import type { ServiceOrder } from "@/lib/services/serviceOrders";
import type { OrderAttachment } from "@/lib/services/orderIntake";

// Keys that either duplicate the attachment list (rendered separately,
// below, with download links) or are bookkeeping the client has no use for
// — every service's *IntakeV1 shape carries `attachments`/`schemaVersion`/
// `service` inline (see collectAttachments() call sites), so this list is
// shared across all four rather than hidden per-service.
const HIDDEN_INTAKE_KEYS = new Set(["attachments", "schemaVersion", "service"]);

// Arabic label per intake field, pooled across every field name that
// appears in any of the four services' intake schemas (orderIntake.ts /
// .contracts.ts / .wargaming.ts / .legalOpinion.ts), including the nested
// judgment/parties/letter/settings sub-objects. A field not listed here
// still renders — under its raw key — rather than silently vanishing, so a
// schema change never produces a quietly-incomplete summary.
const INTAKE_LABELS: Record<string, string> = {
  // draft (الصائغ القانوني)
  clientRole: "صفة الموكل",
  memoType: "نوع المذكرة",
  memoSubType: "نوع المذكرة الفرعي",
  legalBranch: "الفرع القانوني",
  caseText: "وقائع القضية",
  judgment: "الحكم القضائي المرفق",
  lawyerNotes: "ملاحظات إضافية",
  // contracts (محترف العقود)
  mode: "نوع الطلب",
  complexity: "مستوى التفصيل",
  contractType: "نوع العقد",
  language: "لغة العقد",
  customLanguageName: "اسم اللغة المخصصة",
  customLanguageLayout: "تنسيق اللغة المخصصة",
  customLanguageBase: "اللغة الأساس",
  contractDesc: "وصف العقد",
  courtType: "نوع المحكمة / الجهة",
  selectedClauses: "البنود المختارة",
  additionalClauses: "بنود إضافية",
  representing: "الطرف الذي تمثله",
  concerns: "نقاط القلق",
  otherParty: "الطرف الآخر",
  // shared: parties (draft + contracts)
  parties: "الأطراف",
  one: "الطرف الأول",
  two: "الطرف الثاني",
  // wargaming (المحاكي الشامل)
  role: "الصفة في القضية",
  area: "التخصص القانوني",
  caseSummary: "ملخص القضية",
  targets: "أهداف المحاكاة",
  memoText: "نص المذكرة",
  // legal_opinion (الرأي الفصل)
  outputType: "نوع الطلب",
  topicArea: "مجال الموضوع",
  description: "الوصف",
  question: "السؤال",
  settings: "إعدادات إضافية",
  letter: "بيانات الخطاب",
  // judgment sub-fields
  number: "الرقم",
  court: "المحكمة",
  date: "التاريخ",
  text: "النص",
  reasons: "الأسباب",
  // PartyData sub-fields (parties.one / parties.two — draft + contracts).
  // Sourced from the PartyData type itself (src/components/draft/
  // draftConstants.ts:124-131), not guessed: type, companyName,
  // commercialReg, unifiedNum, representative, representativeRole, address,
  // fullName, idNumber, nationality, entityName, unifiedNumGov,
  // contactPerson, taxOrCustomsNum — every field the wizard can collect for
  // a party, company or government entity.
  type: "نوع الطرف",
  companyName: "اسم الشركة",
  commercialReg: "السجل التجاري",
  unifiedNum: "الرقم الموحّد",
  representative: "الممثل",
  representativeRole: "صفة الممثل",
  address: "العنوان",
  fullName: "الاسم الكامل",
  idNumber: "رقم الهوية",
  entityName: "اسم الجهة",
  unifiedNumGov: "الرقم الموحّد للجهة",
  contactPerson: "مسؤول التواصل",
  taxOrCustomsNum: "الرقم الضريبي / الجمركي",
  nationality: "الجنسية",
  // legal_opinion `letter` sub-fields (outputType: "letter"). Sourced from
  // the object literal LetterWorkflow.tsx's submitLetterOrder() actually
  // sends (src/app/ai/legal-opinion/_components/LetterWorkflow.tsx
  // ~line 150-168), read rather than guessed — that file is owned by
  // another agent this wave, read-only here.
  letterType: "نوع الخطاب",
  letterTypeCustom: "نوع الخطاب (مخصص)",
  letterTypeLabel: "نوع الخطاب",
  senderName: "اسم المرسل",
  senderRole: "صفة المرسل",
  recipientName: "اسم المستلم",
  recipientType: "صفة المستلم",
  govEntity: "الجهة الحكومية",
  responseDeadline: "مهلة الرد مطلوبة",
  deadlineDays: "عدد أيام المهلة",
  letterSubject: "موضوع الخطاب",
  letterLegalRef: "السند النظامي",
  attachmentLabels: "المرفقات المذكورة (غير مرفوعة)",
  fullLetterText: "نص الخطاب",
  // legal_opinion `settings` sub-fields — the six non-letter sub-flows
  // (consult/study/legal-memo/research/due-diligence/cross-exam). Sourced
  // from buildSettings() in src/app/ai/legal-opinion/page.tsx (~line
  // 271-303), read rather than guessed. Some keys (side, entityName,
  // entityType, goal) are reused across more than one sub-flow with a
  // shared, still-accurate Arabic label.
  searchDepth: "عمق البحث",
  studyGoal: "هدف الدراسة",
  litigationStage: "مرحلة التقاضي",
  memoStructure: "هيكل المذكرة",
  memoDetailLevel: "مستوى التفصيل",
  audience: "الجهة المخاطَبة",
  side: "الجهة الممثَّلة",
  researchType: "نوع البحث",
  compareWith: "المقارنة مع",
  keywords: "الكلمات المفتاحية",
  researchSources: "مصادر البحث",
  researchLimit: "حد نتائج البحث",
  entityType: "نوع الجهة",
  extraField: "بيانات إضافية",
  goal: "الهدف",
  scope: "نطاق الفحص",
  witnessRole: "صفة الشاهد",
  destroyGoal: "الهدف من الاستجواب",
};

function labelFor(key: string): string {
  return INTAKE_LABELS[key] ?? key;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    // An object counts as empty when none of its fields — other than a
    // bare "type" discriminant — carry a real value. Plain
    // `Object.keys(...).length === 0` is never true for an untouched party:
    // EMPTY_PARTY (src/components/draft/draftConstants.ts) always sets
    // `type: "individual"` even when the client never touched that party at
    // all, so a shallow key-count check would keep rendering its heading
    // with nothing meaningful underneath it — just "نوع الطرف: فرد". Any
    // other structural field that always carries a non-empty default would
    // hit the same trap; "type" is the one that actually occurs in today's
    // intake shapes.
    return !Object.entries(v as Record<string, unknown>).some(
      ([k, val]) => k !== "type" && !isEmptyValue(val),
    );
  }
  return false;
}

function renderValue(value: unknown, isDark: boolean): ReactNode {
  if (typeof value === "boolean") return value ? "نعم" : "لا";

  if (Array.isArray(value)) {
    const items = value.filter((v) => !isEmptyValue(v));
    if (items.length === 0) return null;
    return (
      <ul className="list-disc pr-4 space-y-0.5">
        {items.map((v, i) => (
          <li key={i}>{typeof v === "object" && v !== null ? renderValue(v, isDark) : String(v)}</li>
        ))}
      </ul>
    );
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => !isEmptyValue(v));
    if (entries.length === 0) return null;
    return (
      <div className={`space-y-1 pe-3 border-e-2 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <span className={`text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {labelFor(k)}:{" "}
            </span>
            <span>{renderValue(v, isDark)}</span>
          </div>
        ))}
      </div>
    );
  }

  return String(value);
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  return `(${Math.max(1, Math.round(bytes / 1024))} كيلوبايت)`;
}

export function OrderSummary({ order, isDark }: { order: ServiceOrder; isDark: boolean }) {
  const [downloadErr, setDownloadErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";
  const mutedText = isDark ? "text-zinc-400" : "text-zinc-600";

  const intake = order.metadata?.intake ?? {};
  const rows = Object.entries(intake).filter(
    ([k, v]) => !HIDDEN_INTAKE_KEYS.has(k) && !isEmptyValue(v),
  );

  // documentId is typed `string` on OrderAttachment, but that's a TS-level
  // promise only: attachments.id is a Postgres bigserial, and PostgREST
  // serialises int8 as a JSON number — POST /api/v1/documents returns it
  // uncast — so it can arrive here as a runtime `number` despite its
  // declared type (same gotcha documented in orderIntake.ts's
  // documentIdStr() and the admin service-orders page's attachment list).
  // Coerce with String(...) rather than type-guarding on "string" alone, or
  // a numeric id silently drops that attachment's row.
  const attachments = (order.metadata?.attachments ?? []).filter(
    (a): a is OrderAttachment =>
      !!a && (typeof a.documentId === "string" || typeof a.documentId === "number"),
  );

  // GET /api/v1/service-requests/[id]/attachments/[attachmentId] authorises
  // the requester explicitly (`order.requester_user_id === user.id`,
  // verified by reading that route before wiring this) — a client
  // downloading their own attachment is a legitimate use of it, the same
  // route the admin queue already uses for the same file.
  async function downloadAttachment(attachmentId: string) {
    setDownloadErr("");
    setBusyId(attachmentId);
    try {
      const res = await fetch(
        `/api/v1/service-requests/${order.id}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDownloadErr(body.error ?? "تعذّر التحميل");
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      setDownloadErr("تعذّر التحميل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0 && attachments.length === 0) return null;

  return (
    <div className={`${card} p-5 space-y-4`} dir="rtl">
      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
        ما أرسلته
      </p>

      {rows.length > 0 && (
        <div className="space-y-2.5">
          {rows.map(([key, value]) => (
            <div key={key} className="text-[12px] leading-[1.9]">
              <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                {labelFor(key)}:{" "}
              </span>
              <span className={mutedText}>{renderValue(value, isDark)}</span>
            </div>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1.5 border-t pt-3 border-white/[0.06]">
          <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            مرفقاتك
          </p>
          <div className="flex flex-col gap-1">
            {attachments.map((a) => {
              const documentId = String(a.documentId);
              return (
                <button
                  key={documentId}
                  disabled={busyId === documentId}
                  onClick={() => downloadAttachment(documentId)}
                  className={`flex items-center gap-2 text-[12px] font-semibold disabled:opacity-40 ${
                    isDark ? "text-emerald-400" : "text-emerald-700"}`}
                >
                  <DownloadSimple size={13} />
                  {a.name || "مرفق"} {formatSize(a.size)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {downloadErr && <p className="text-[11px] text-red-500">{downloadErr}</p>}
    </div>
  );
}
