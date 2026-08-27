/**
 * lead.ts — the «التقييم القانوني المجاني» lead contract.
 *
 * WHY THIS FILE EXISTS, AND WHY IT SITS NEXT TO THE ROUTE
 * /services/business is a PUBLIC page. Its primary call to action — used twice
 * on the page — is a free legal assessment that a visitor fills in while almost
 * certainly logged out. So the write behind it happens on a public endpoint
 * (./route.ts), and a public endpoint may never trust the shape it is handed:
 * every field is re-derived here, server-side, from a whitelist, and the DB row
 * is BUILT here rather than spread from the request body.
 *
 * The same module is imported by the browser form
 * (src/app/services/business/_components.tsx) so the pickers and the server
 * agree on one list of company sizes and one list of legal needs BY
 * CONSTRUCTION. Two copies of those lists would mean the day a label changes on
 * one side, every submission carrying the new label starts failing validation —
 * silently, because a rejected lead has no owner watching it.
 *
 * That is also why this file must stay pure: no Supabase, no `next/*`, no
 * `server-only`. It is bundled into the client. It is also why it is testable
 * with `node --test` (see ./lead.test.ts) — the JSX around it is not.
 *
 * Every message here is Arabic: they are rendered verbatim in the modal.
 */

/** Company-size options. `id` is what crosses the wire and what is stored. */
export const COMPANY_SIZES = [
  { id: "small", labelAr: "صغيرة", subAr: "أقل من ٢٠ موظف", labelEn: "Small", subEn: "< 20 employees" },
  { id: "medium", labelAr: "متوسطة", subAr: "٢٠–٢٠٠ موظف", labelEn: "Medium", subEn: "20–200 employees" },
  { id: "large", labelAr: "كبيرة", subAr: "أكثر من ٢٠٠ موظف", labelEn: "Large", subEn: "200+ employees" },
] as const;

export type CompanySizeId = (typeof COMPANY_SIZES)[number]["id"];

/**
 * The eight legal needs the modal offers. The Arabic strings are the ones the
 * page already showed (previously the local `LEGAL_NEEDS_AR` array) — copied
 * verbatim, so nothing a visitor reads changed.
 *
 * The wire carries `id`, never the Arabic label: an endpoint that accepted the
 * label would be accepting free text into a stored field with an
 * allowlist-shaped name.
 */
export const LEGAL_NEEDS = [
  { id: "contracts", labelAr: "عقود ومراجعة وثائق" },
  { id: "labor", labelAr: "قضايا عمالية ونزاعات" },
  { id: "compliance", labelAr: "امتثال تنظيمي وغرامات" },
  { id: "debt_collection", labelAr: "تحصيل ديون تجارية" },
  { id: "formation", labelAr: "تأسيس شركة أو هيكلة" },
  { id: "construction", labelAr: "عقود مقاولات وإنشاء" },
  { id: "ip", labelAr: "ملكية فكرية وعلامات تجارية" },
  { id: "real_estate", labelAr: "نزاعات العقارات والإيجارات" },
  // Added 2026-08-27. /services/corporate/health-check sells «الفحص القانوني
  // ٣٦٠°» and its call-to-action opens THIS modal — but the needs picker is a
  // required gate (the step-2 button is disabled until something is chosen) and
  // there was no option that meant "the audit I just read about". The page's own
  // instruction was to type it into the optional notes field, which is on the
  // next step and which the modal's own backdrop covers the instruction with.
  // So the one thing the visitor came to ask for depended on an optional field
  // and an instruction they could no longer see.
  { id: "legal_audit", labelAr: "فحص قانوني شامل للمنشأة" },
] as const;

export type LegalNeedId = (typeof LEGAL_NEEDS)[number]["id"];

/**
 * Length caps. Every string that can reach the database has one — an
 * unauthenticated caller decides how long these are, and `text` columns have no
 * length of their own.
 */
export const LIMITS = {
  companyName: 120,
  contactName: 80,
  contactEmail: 160,
  contactPhone: 20,
  notes: 1000,
} as const;

/** Largest JSON body the endpoint will read at all, in bytes. */
export const MAX_BODY_BYTES = 8 * 1024;

/**
 * The name of the honeypot input — visually hidden and never labelled, so a
 * human cannot fill it, while a bot that fills every input on the page does.
 *
 * Deliberately NOT the classic "website"/"email2"/"url": those are names a
 * browser's autofill or a password manager may recognise and fill for a REAL
 * visitor, who would then be rejected with no way to see why. A meaningless
 * name is invisible to every autofill heuristic and just as visible to a bot
 * that fills inputs indiscriminately, which is the threat this actually
 * answers.
 */
export const HONEYPOT_FIELD = "nzRef";

export type BusinessLead = {
  companyName: string;
  companySize: CompanySizeId;
  needs: LegalNeedId[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
};

/**
 * The public pages allowed to file a lead, and therefore the only values that
 * may reach `service_requests.source_path` from this endpoint.
 *
 * An ALLOWLIST rather than a passthrough, because this route is
 * UNAUTHENTICATED: anybody on the internet can POST to it, and `source_path` is
 * a stored column that an admin reads to know where an order came from.
 * Accepting whatever string arrived would let a stranger write
 * «/dashboard/admin» — or a sentence — into the provenance of a real lead.
 *
 * Anything unrecognised resolves to the default. It does NOT reject: a lead
 * from a real prospective client must never be lost over a value that only
 * affects reporting.
 */
export const LEAD_SOURCE_PATHS = [
  "/services/business",
  "/services/corporate/health-check",
] as const;

export type LeadSourcePath = (typeof LEAD_SOURCE_PATHS)[number];

export const DEFAULT_LEAD_SOURCE_PATH: LeadSourcePath = "/services/business";

/** The allowed source path `value` names, or the default for anything else. */
export function resolveLeadSourcePath(value: unknown): LeadSourcePath {
  if (typeof value !== "string") return DEFAULT_LEAD_SOURCE_PATH;
  const trimmed = value.trim();
  return (LEAD_SOURCE_PATHS as readonly string[]).includes(trimmed)
    ? (trimmed as LeadSourcePath)
    : DEFAULT_LEAD_SOURCE_PATH;
}

export type LeadValidation =
  | { ok: true; value: BusinessLead }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Trim a value to a string, or "" when it is anything other than a string.
 * Numbers and booleans are deliberately NOT coerced: a phone arriving as the
 * number 555 is a malformed payload, not a phone number.
 */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function companySizeLabelAr(id: string): string {
  const size = COMPANY_SIZES.find((s) => s.id === id);
  return size ? `${size.labelAr} (${size.subAr})` : id;
}

export function legalNeedLabelAr(id: string): string {
  return LEGAL_NEEDS.find((n) => n.id === id)?.labelAr ?? id;
}

/**
 * True when the honeypot was filled in.
 *
 * Kept out of `validateBusinessLead` on purpose: a tripped honeypot is not a
 * validation error about a field the client can fix, and the route answers it
 * differently (a generic 400, never a fabricated success — see the note at that
 * call site).
 */
export function isHoneypotTripped(input: unknown): boolean {
  return isRecord(input) && str(input[HONEYPOT_FIELD]).length > 0;
}

/**
 * Validate one submitted lead and return the ONLY fields that may be stored.
 *
 * The returned `value` is a fresh object built key-by-key — never the input
 * with extras stripped — so no field the caller invented can survive into the
 * row builder, whatever the payload contained.
 */
export function validateBusinessLead(input: unknown): LeadValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: ["تعذّر قراءة بيانات الطلب."] };
  }

  const errors: string[] = [];

  const companyName = str(input.companyName);
  if (companyName.length < 2) {
    errors.push("اسم الشركة أو المنشأة مطلوب.");
  } else if (companyName.length > LIMITS.companyName) {
    errors.push(`اسم الشركة طويل جداً (الحد ${LIMITS.companyName} حرفاً).`);
  }

  const rawSize = str(input.companySize);
  const companySize = COMPANY_SIZES.find((s) => s.id === rawSize)?.id;
  if (!companySize) {
    errors.push("حجم الشركة مطلوب.");
  }

  // Unknown ids are dropped rather than rejected on sight, but an empty result
  // is still an error — so a payload of pure junk cannot pass as "no needs
  // selected happens to be fine".
  const rawNeeds = Array.isArray(input.needs) ? input.needs : [];
  const needs = [...new Set(rawNeeds.map((n) => str(n)))]
    .filter((n): n is LegalNeedId => LEGAL_NEEDS.some((known) => known.id === n))
    .slice(0, LEGAL_NEEDS.length);
  if (needs.length === 0) {
    errors.push("اختر احتياجاً قانونياً واحداً على الأقل.");
  }

  const contactName = str(input.contactName);
  if (contactName.length < 2) {
    errors.push("اسم مسؤول التواصل مطلوب.");
  } else if (contactName.length > LIMITS.contactName) {
    errors.push(`اسم مسؤول التواصل طويل جداً (الحد ${LIMITS.contactName} حرفاً).`);
  }

  const contactEmail = str(input.contactEmail);
  if (contactEmail.length > LIMITS.contactEmail) {
    errors.push("البريد الإلكتروني طويل جداً.");
  } else if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    errors.push("البريد الإلكتروني غير صحيح.");
  }

  const contactPhone = str(input.contactPhone);
  if (contactPhone.length > LIMITS.contactPhone) {
    errors.push("رقم الجوال غير صحيح.");
  } else if (contactPhone && !/^[\d+\-\s()]+$/.test(contactPhone)) {
    errors.push("رقم الجوال غير صحيح.");
  } else if (contactPhone && contactPhone.replace(/\D/g, "").length < 7) {
    errors.push("رقم الجوال غير صحيح.");
  }

  // The whole promise of this form is «سيتواصل معك الفريق». A lead with no way
  // to reach it back cannot be fulfilled, so it is rejected at the door rather
  // than accepted and quietly dropped by whoever opens the queue.
  if (!contactEmail && !contactPhone) {
    errors.push("أدخل رقم جوال أو بريداً إلكترونياً حتى يتمكن الفريق من التواصل معك.");
  }

  const notes = str(input.notes);
  if (notes.length > LIMITS.notes) {
    errors.push(`الملاحظات طويلة جداً (الحد ${LIMITS.notes} حرفاً).`);
  }

  if (errors.length > 0 || !companySize) {
    return { ok: false, errors: errors.length > 0 ? errors : ["بيانات الطلب غير مكتملة."] };
  }

  return {
    ok: true,
    value: { companyName, companySize, needs, contactName, contactEmail, contactPhone, notes },
  };
}

/**
 * The Arabic brief the fulfilment team reads.
 *
 * WHY THE BRIEF IS BUILT HERE AND STORED IN `description` AS WELL AS IN
 * `metadata.intake`: the generic intake renderer
 * (src/lib/services/intakeValues.ts) prints each intake key through
 * `labelFor()`, which falls back to the RAW key when no Arabic label is
 * registered. `companyName`/`companySize`/`legalNeeds`/`contact*` have no
 * entries there yet — that file is outside this change and the new keys are
 * reported for it — so until they are added the summary would show English
 * keys against Arabic values. The `description` column is rendered by both the
 * admin queue and the order pages regardless, so the team gets a complete
 * Arabic brief today, and a better-looking one once the labels land.
 */
export function buildLeadDescription(lead: BusinessLead): string {
  const lines = [
    "طلب تقييم قانوني مجاني — من صفحة خدمات الشركات.",
    `اسم الشركة أو المنشأة: ${lead.companyName}`,
    `حجم الشركة: ${companySizeLabelAr(lead.companySize)}`,
    `الاحتياجات القانونية: ${lead.needs.map(legalNeedLabelAr).join("، ")}`,
    `مسؤول التواصل: ${lead.contactName}`,
  ];
  if (lead.contactPhone) lines.push(`رقم الجوال: ${lead.contactPhone}`);
  if (lead.contactEmail) lines.push(`البريد الإلكتروني: ${lead.contactEmail}`);
  if (lead.notes) lines.push(`ملاحظات العميل: ${lead.notes}`);
  lines.push("لا توجد تسعيرة على هذا الطلب — يتواصل الفريق مع العميل ويقدّم عرض السعر بعد المراجعة.");
  return lines.join("\n");
}

/**
 * Build the `service_requests` row for one validated lead.
 *
 * `receiver: "ai_workspace"` is the single predicate the admin fulfilment queue
 * filters on (src/app/api/v1/admin/service-orders/route.ts:54). The name is
 * historical — no AI is involved — and it means "fulfilled by the نظامي team,
 * not the marketplace". It is also what keeps this row OUT of lawyer
 * marketplace browse: 20260815_marketplace_excludes_ai_workspace.sql excludes
 * exactly this receiver from the SELECT policy's browse clause, which matters
 * more than usual here because the row carries a stranger's phone number.
 *
 * `payment: { amount: 0, status: "not_required" }` states the owner's ruling in
 * the data: the client submits FREE and the team quotes afterwards.
 */
export function buildLeadRow(
  lead: BusinessLead,
  opts: { id: string; requesterUserId: string | null; sourcePath?: string },
): Record<string, unknown> {
  return {
    id: opts.id,
    type: "business_case",
    title: `تقييم قانوني مجاني — ${lead.companyName}`,
    description: buildLeadDescription(lead),
    status: "pending_assignment",
    receiver: "ai_workspace",
    requester_user_id: opts.requesterUserId,
    requester: {
      name: lead.contactName,
      email: lead.contactEmail,
      phone: lead.contactPhone,
      company: lead.companyName,
      // Says plainly that nothing about this requester was authenticated. Every
      // other writer of this column fills it from a signed-in profile.
      source: "public_lead",
    },
    payment: { amount: 0, status: "not_required" },
    // Never the caller's raw string — resolveLeadSourcePath() in this file is
    // the gate, and route.ts is where it runs. Before 2026-08-27 this was the
    // hardcoded literal below, so every lead filed from the 360° health-check
    // page recorded that the visitor came from /services/business.
    source_path: opts.sourcePath ?? DEFAULT_LEAD_SOURCE_PATH,
    metadata: {
      service: "business_assessment",
      // «طلباتي» and the order detail page both print
      // `metadata.serviceTitleAr` as the order's name
      // (src/app/ai/orders/page.tsx:66, src/app/ai/orders/[id]/page.tsx:170)
      // and neither falls back to anything when it is absent — the row would
      // render as a bare « · <date>». It matters here because a lead submitted
      // by a visitor who happens to be signed in DOES carry their user id, and
      // `listMyServiceOrders` fetches on `receiver=ai_workspace`
      // (src/lib/services/serviceOrders.ts:106), so this row lands on their own
      // orders list.
      serviceTitleAr: "تقييم قانوني مجاني",
      isPublicLead: true,
      intake: {
        companyName: lead.companyName,
        companySize: companySizeLabelAr(lead.companySize),
        legalNeeds: lead.needs.map(legalNeedLabelAr),
        contactName: lead.contactName,
        ...(lead.contactPhone ? { contactPhone: lead.contactPhone } : {}),
        ...(lead.contactEmail ? { contactEmail: lead.contactEmail } : {}),
        ...(lead.notes ? { notes: lead.notes } : {}),
      },
    },
  };
}

/**
 * The short reference shown to the visitor on the confirmation screen. Derived
 * from the row id that was actually written, so it can never be printed for a
 * lead that does not exist.
 */
export function leadReference(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
