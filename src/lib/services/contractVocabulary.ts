/**
 * contractVocabulary.ts — the ONE vocabulary of the contract manager.
 * ─────────────────────────────────────────────────────────
 * Mirrors every CHECK constraint on public.contracts and its four child
 * tables (20260905_phase3_consultations_and_contracts.sql). Pure — no I/O.
 * A screen renders the Arabic from here; the API validates against the
 * lists here; the database refuses anything else with 23514.
 */

export const CONTRACT_STATUSES = ["draft", "under_review", "pending_signature", "active", "expired", "terminated", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_AR: Record<ContractStatus, string> = {
  draft:             "مسودة",
  under_review:      "قيد المراجعة",
  pending_signature: "بانتظار التوقيع",
  active:            "ساري",
  expired:           "منتهٍ",
  terminated:        "مُنهى",
  cancelled:         "ملغى",
};

/** Which status may follow which. `terminated` and `cancelled` are terminal; an expired contract can be renewed back to active. */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft:             ["under_review", "pending_signature", "active", "cancelled"],
  under_review:      ["draft", "pending_signature", "active", "cancelled"],
  pending_signature: ["under_review", "active", "cancelled"],
  active:            ["expired", "terminated"],
  expired:           ["active"],
  terminated:        [],
  cancelled:         [],
};

export const CONTRACT_TYPES = ["service_agreement", "fee_agreement", "power_of_attorney", "nda", "employment", "lease", "supply", "partnership", "other"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_TYPE_AR: Record<ContractType, string> = {
  service_agreement: "اتفاقية خدمات",
  fee_agreement:     "عقد أتعاب",
  power_of_attorney: "وكالة قانونية",
  nda:               "اتفاقية سرية",
  employment:        "عقد عمل",
  lease:             "عقد إيجار",
  supply:            "عقد توريد",
  partnership:       "عقد شراكة",
  other:             "آخر",
};

export const VERSION_LABELS = ["draft", "revised", "final", "signed"] as const;
export type VersionLabel = (typeof VERSION_LABELS)[number];
export const VERSION_LABEL_AR: Record<VersionLabel, string> = {
  draft:   "مسودة",
  revised: "منقّحة",
  final:   "نهائية",
  signed:  "موقَّعة",
};

export const PARTY_ROLES = ["first_party", "second_party", "guarantor", "witness", "other"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
export const PARTY_ROLE_AR: Record<PartyRole, string> = {
  first_party:  "الطرف الأول",
  second_party: "الطرف الثاني",
  guarantor:    "ضامن",
  witness:      "شاهد",
  other:        "آخر",
};

export const PARTY_KINDS = ["client", "counterparty", "firm"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];
export const PARTY_KIND_AR: Record<PartyKind, string> = {
  client:       "موكّلنا",
  counterparty: "الطرف الآخر",
  firm:         "المكتب",
};

export const ENTITY_TYPES = ["individual", "company", "government", "other"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_TYPE_AR: Record<EntityType, string> = {
  individual: "فرد",
  company:    "شركة",
  government: "جهة حكومية",
  other:      "آخر",
};

export const OBLIGATION_KINDS = ["delivery", "payment", "notice", "renewal", "termination", "other"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];
export const OBLIGATION_KIND_AR: Record<ObligationKind, string> = {
  delivery:    "تسليم",
  payment:     "دفع",
  notice:      "إشعار",
  renewal:     "تجديد",
  termination: "إنهاء",
  other:       "آخر",
};

export const OBLIGATION_STATUSES = ["pending", "done", "missed", "cancelled"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];
export const OBLIGATION_STATUS_AR: Record<ObligationStatus, string> = {
  pending:   "قائم",
  done:      "تمّ",
  missed:    "فات",
  cancelled: "ملغى",
};

export const PAYMENT_STAGES = ["advance", "milestone", "final", "other"] as const;
export type PaymentStage = (typeof PAYMENT_STAGES)[number];
export const PAYMENT_STAGE_AR: Record<PaymentStage, string> = {
  advance:   "مقدَّم",
  milestone: "دفعة إنجاز",
  final:     "دفعة ختامية",
  other:     "أخرى",
};

export const PAYMENT_STATUSES = ["pending", "paid", "overdue", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_AR: Record<PaymentStatus, string> = {
  pending:   "مستحقة",
  paid:      "مسدَّدة",
  overdue:   "متأخرة",
  cancelled: "ملغاة",
};

const inList = <T extends string>(list: readonly T[]) => (v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export const isContractStatus   = inList(CONTRACT_STATUSES);
export const isContractType     = inList(CONTRACT_TYPES);
export const isVersionLabel     = inList(VERSION_LABELS);
export const isPartyRole        = inList(PARTY_ROLES);
export const isPartyKind        = inList(PARTY_KINDS);
export const isEntityType       = inList(ENTITY_TYPES);
export const isObligationKind   = inList(OBLIGATION_KINDS);
export const isObligationStatus = inList(OBLIGATION_STATUSES);
export const isPaymentStage     = inList(PAYMENT_STAGES);
export const isPaymentStatus    = inList(PAYMENT_STATUSES);

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return from === to || CONTRACT_TRANSITIONS[from].includes(to);
}

/** Arabic reason a contract status change must be refused, or null. */
export function contractTransitionIssue(from: ContractStatus, to: ContractStatus): string | null {
  if (canTransitionContract(from, to)) return null;
  return `لا يمكن نقل العقد من «${CONTRACT_STATUS_AR[from]}» إلى «${CONTRACT_STATUS_AR[to]}»`;
}
