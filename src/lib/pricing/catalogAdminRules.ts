/**
 * catalogAdminRules.ts — what an admin edit of public.admin_pricing_catalog
 * may write (S6-T7). Pure; the PATCH route
 * (src/app/api/v1/admin/pricing-catalog/[serviceId]/route.ts) reads the row,
 * calls catalogRowUpdate, writes `update` and audits it. The admin pricing
 * screen uses customerViewOf / isLegacyCatalogRow, so both sides share one
 * definition of a legacy row.
 *
 * Three rules (controller rulings for Task 4):
 *
 * 1. Toggle. `enabled:false` writes enabled = false AND metadata.adminHidden =
 *    true; `enabled:true` writes enabled = true and removes the flag
 *    (adminHiddenPatch, applied to the row's CURRENT metadata — never a blind
 *    replace). Without the flag the client loader never fetches a disabled
 *    row (clientPricingServer.ts), so the toggle would hide nothing.
 *
 * 2. Legacy rows. A row with enabled = false and no metadata.adminHidden is
 *    never fetched by the client loader: customers see the CODE catalogue
 *    entry (CLIENT_SERVICE_CATALOG) instead. The 20260518 seed holds 15 such
 *    rows with stale values (ai-letter 49 / «الأسرع», appeal «شائع», general
 *    internal). The first admin PATCH of such a row, for any field, also
 *    realigns every field the merge (mergeAdminPricingCatalogRows) reads to
 *    the code entry and sets `enabled` to the code entry's state — so the
 *    customer sees exactly what they saw before plus the admin's edit, the
 *    stale seed values never come back, and the row stops being legacy (a
 *    second PATCH never realigns over the first). Fields the admin sends win.
 *    No migration touches those rows.
 *
 * 3. Validation is against the realigned row, not the stale one: ai-letter's
 *    stale 49 must not let «fixed» through when the code price is 0.
 *
 * Namespace rule (preflight R19): these are HUMAN-service ids of the client
 * catalogue. Never map an AI tool id (e.g. the AI tool `contract-review`) here.
 *
 * Relative `.ts` imports only (node --test).
 */
import {
  CLIENT_SERVICE_CATALOG,
  type ClientServiceCatalogItem,
  type ClientServicePriceMode,
} from "../../constants/clientServiceCatalog.ts";
import { adminHiddenPatch, type AdminPricingCatalogRow } from "../pricingRepository.ts";

/** Every ClientServicePriceMode at HEAD (catalogAdminRules.test.ts pins the list). */
export const CATALOG_PRICE_MODES: readonly ClientServicePriceMode[] = [
  "free",
  "included",
  "fixed",
  "starting_from",
  "custom",
  "per_page",
  "points",
];

export const CATALOG_MAX_PRICE = 1_000_000;
export const CATALOG_NOTE_MAX = 200;

/** Modes that print a riyal amount, so the amount must be above zero. */
const NEEDS_PRICE: readonly string[] = ["fixed", "starting_from"];

export const CATALOG_ERRORS = {
  body: "بيانات غير صالحة",
  nothing: "لا توجد حقول للتحديث",
  price: "السعر غير صالح",
  mode: "طريقة التسعير غير صالحة",
  needsPrice: "السعر مطلوب وأكبر من صفر لهذه الطريقة",
  note: "الملاحظة أطول من ٢٠٠ حرف",
  enabled: "قيمة الإظهار غير صالحة",
} as const;

/** The validated admin fields, by the name they are written under. */
export type CatalogPatchFields = {
  base_price?: number;
  price_mode?: ClientServicePriceMode;
  /** metadata.priceNote */
  priceNote?: string;
  enabled?: boolean;
};

export type CatalogPatchResult = { ok: true; fields: CatalogPatchFields } | { ok: false; error: string };

/**
 * Validates a PATCH body `{ basePrice?, priceMode?, priceNote?, enabled? }`
 * against the row as it will be before the admin's fields (the realigned row
 * for a legacy one). Unknown keys are ignored; a body naming none of the four
 * is refused. No coercion: a price is a number, a flag a boolean.
 */
export function validateCatalogPatch(
  existing: { price_mode: string; base_price: number | string },
  body: unknown,
): CatalogPatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: CATALOG_ERRORS.body };
  const b = body as Record<string, unknown>;
  const fields: CatalogPatchFields = {};

  if (b.basePrice !== undefined) {
    const x = b.basePrice;
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      x < 0 ||
      x > CATALOG_MAX_PRICE ||
      // numeric(12,2): more than two decimals would be rounded silently by the DB
      Math.round(x * 100) / 100 !== x
    ) {
      return { ok: false, error: CATALOG_ERRORS.price };
    }
    fields.base_price = x;
  }

  if (b.priceMode !== undefined) {
    if (typeof b.priceMode !== "string" || !CATALOG_PRICE_MODES.includes(b.priceMode as ClientServicePriceMode)) {
      return { ok: false, error: CATALOG_ERRORS.mode };
    }
    fields.price_mode = b.priceMode as ClientServicePriceMode;
  }

  if (b.priceNote !== undefined) {
    if (typeof b.priceNote !== "string") return { ok: false, error: CATALOG_ERRORS.note };
    const note = b.priceNote.trim();
    if (note.length > CATALOG_NOTE_MAX) return { ok: false, error: CATALOG_ERRORS.note };
    fields.priceNote = note;
  }

  if (b.enabled !== undefined) {
    if (typeof b.enabled !== "boolean") return { ok: false, error: CATALOG_ERRORS.enabled };
    fields.enabled = b.enabled;
  }

  if (Object.keys(fields).length === 0) return { ok: false, error: CATALOG_ERRORS.nothing };

  const mode = fields.price_mode ?? existing.price_mode;
  const price = fields.base_price ?? Number(existing.base_price);
  if (NEEDS_PRICE.includes(mode) && !(Number.isFinite(price) && price > 0)) {
    return { ok: false, error: CATALOG_ERRORS.needsPrice };
  }

  return { ok: true, fields };
}

/**
 * Legacy = disabled, without the admin's hide flag. The flag is compared as
 * text, exactly as the loader's `metadata->>adminHidden.eq.true` does.
 */
export function isLegacyCatalogRow(row: Pick<AdminPricingCatalogRow, "enabled" | "metadata">): boolean {
  const flag = (row.metadata as Record<string, unknown> | null | undefined)?.adminHidden;
  return row.enabled === false && String(flag) !== "true";
}

/** The code catalogue entry of exactly this id (variants included; never the `general` fallback). */
export function codeEntryFor(
  serviceId: string,
  catalog: readonly ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): ClientServiceCatalogItem | undefined {
  return catalog.find((s) => s.serviceId === serviceId);
}

/** The metadata keys mergeAdminPricingCatalogRows reads with a code fallback (same name on the code item). */
const REALIGN_META_KEYS = [
  "description",
  "priceNote",
  "route",
  "icon",
  "requestType",
  "includedByPlan",
  "tag",
  "aiPowered",
  "humanService",
] as const;

/** The columns and metadata one PATCH writes (updated_at is the route's). */
export type CatalogRowUpdate = {
  label_ar?: string;
  category_id?: string;
  base_price?: number;
  price_mode?: ClientServicePriceMode;
  receiver_type?: string;
  beta_visibility?: string;
  requires_payment?: boolean;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

/**
 * The realigning write for a legacy row: every column and metadata key the
 * merge reads takes the code entry's value — a key the code entry lacks is
 * REMOVED (the merge's `metadata.X ?? code.X` would otherwise keep the stale
 * one) — and `enabled` takes the code entry's state. Other metadata keys
 * (variantOf, unknown ones) are kept. Then the admin's fields win. Pure.
 */
export function legacyRealignPatch(
  row: AdminPricingCatalogRow,
  codeEntry: ClientServiceCatalogItem,
  adminFields: CatalogPatchFields,
): CatalogRowUpdate {
  const metadata: Record<string, unknown> = { ...((row.metadata as Record<string, unknown> | null) ?? {}) };
  for (const key of REALIGN_META_KEYS) {
    delete metadata[key];
    const value = codeEntry[key];
    if (value !== undefined) metadata[key] = value;
  }
  const realigned: CatalogRowUpdate = {
    label_ar: codeEntry.label,
    category_id: codeEntry.categoryId,
    base_price: codeEntry.basePrice,
    price_mode: codeEntry.priceMode,
    receiver_type: codeEntry.receiverType,
    beta_visibility: codeEntry.betaVisibility,
    requires_payment: codeEntry.requiresPayment,
  };
  return withAdminFields(realigned, metadata, codeEntry.enabled !== false, adminFields);
}

/** Applies the admin's fields; `enabled` (when written) always goes through adminHiddenPatch. */
function withAdminFields(
  columns: CatalogRowUpdate,
  metadata: Record<string, unknown> | null,
  enabledToWrite: boolean | undefined,
  fields: CatalogPatchFields,
): CatalogRowUpdate {
  const update: CatalogRowUpdate = { ...columns };
  if (fields.base_price !== undefined) update.base_price = fields.base_price;
  if (fields.price_mode !== undefined) update.price_mode = fields.price_mode;
  let meta = metadata;
  if (fields.priceNote !== undefined) meta = { ...(meta ?? {}), priceNote: fields.priceNote };
  const enabled = fields.enabled ?? enabledToWrite;
  if (enabled !== undefined) {
    const patch = adminHiddenPatch(enabled, meta);
    update.enabled = patch.enabled;
    meta = patch.metadata;
  }
  if (meta !== null) update.metadata = meta;
  return update;
}

export type CatalogRowUpdateResult =
  | { ok: true; update: CatalogRowUpdate; legacyRealigned: boolean }
  | { ok: false; error: string };

/**
 * The whole PATCH decision for one stored row: realign when legacy (and a code
 * entry exists), validate against that, apply the admin's fields. A row
 * without a code entry has nothing to realign to and is edited as stored.
 */
export function catalogRowUpdate(
  row: AdminPricingCatalogRow,
  body: unknown,
  catalog: readonly ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): CatalogRowUpdateResult {
  const code = isLegacyCatalogRow(row) ? codeEntryFor(row.service_id, catalog) : undefined;
  const effective = code ? { price_mode: code.priceMode, base_price: code.basePrice } : row;
  const checked = validateCatalogPatch(effective, body);
  if (!checked.ok) return checked;
  if (code) return { ok: true, update: legacyRealignPatch(row, code, checked.fields), legacyRealigned: true };
  const metadata =
    checked.fields.priceNote !== undefined || checked.fields.enabled !== undefined
      ? { ...((row.metadata as Record<string, unknown> | null) ?? {}) }
      : null;
  return { ok: true, update: withAdminFields({}, metadata, undefined, checked.fields), legacyRealigned: false };
}

/** What a customer sees for one row: a legacy row shows its code entry. */
export type CatalogCustomerView = {
  legacy: boolean;
  label: string;
  basePrice: number;
  priceMode: string;
  priceNote: string;
  visible: boolean;
};

export function customerViewOf(
  row: AdminPricingCatalogRow,
  catalog: readonly ClientServiceCatalogItem[] = CLIENT_SERVICE_CATALOG,
): CatalogCustomerView {
  const code = isLegacyCatalogRow(row) ? codeEntryFor(row.service_id, catalog) : undefined;
  if (code) {
    return {
      legacy: true,
      label: code.label,
      basePrice: code.basePrice,
      priceMode: code.priceMode,
      priceNote: code.priceNote ?? "",
      visible: code.enabled !== false,
    };
  }
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  return {
    legacy: false,
    label: row.label_ar,
    basePrice: Number(row.base_price) || 0,
    priceMode: row.price_mode,
    priceNote: typeof meta.priceNote === "string" ? meta.priceNote : "",
    visible: row.enabled !== false,
  };
}

/** The screen's edit draft for one row. */
export type CatalogEditDraft = { basePrice: number; priceMode: string; priceNote: string; enabled: boolean };

/**
 * The PATCH body for an edit: only what differs from what the customer sees
 * now (customerViewOf). For a legacy row the view is the code entry, so an
 * untouched field is never sent — sending the stale DB value would make the
 * admin's "explicit" field win and republish it. Pure.
 */
export function changedCatalogFields(view: CatalogCustomerView, draft: CatalogEditDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (draft.basePrice !== view.basePrice) body.basePrice = draft.basePrice;
  if (draft.priceMode !== view.priceMode) body.priceMode = draft.priceMode;
  if (draft.priceNote.trim() !== view.priceNote.trim()) body.priceNote = draft.priceNote.trim();
  if (draft.enabled !== view.visible) body.enabled = draft.enabled;
  return body;
}
