import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CLIENT_SERVICE_CATALOG, type ClientServiceCatalogItem } from "../../constants/clientServiceCatalog.ts";
import { getClientServiceById, mergeAdminPricingCatalogRows, type AdminPricingCatalogRow } from "../pricingRepository.ts";
import {
  CATALOG_PRICE_MODES,
  catalogRowUpdate,
  changedCatalogFields,
  codeEntryFor,
  customerViewOf,
  isLegacyCatalogRow,
  legacyRealignPatch,
  validateCatalogPatch,
} from "./catalogAdminRules.ts";

// ── fixtures ──────────────────────────────────────────────────────────────

/** The 27 rows of the 20260518 seed, parsed from the migration itself (as clientPricingServer.test.ts). */
function seedRows(): AdminPricingCatalogRow[] {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20260518_client_workflow_backend_ready.sql", import.meta.url),
    "utf8",
  );
  const block = sql.slice(
    sql.indexOf("insert into public.admin_pricing_catalog"),
    sql.indexOf("on conflict (service_id) do update"),
  );
  const re =
    /\('([^']+)', '([^']+)', '([^']+)', '([^']+)', (\d+), '([^']+)', '([^']+)', '([^']+)', (true|false), (true|false),\s*'(\{[^\n]*?\})'::jsonb\)/g;
  const rows: AdminPricingCatalogRow[] = [];
  for (const m of block.matchAll(re)) {
    rows.push({
      service_id: m[1],
      audience: m[2],
      category_id: m[3] as AdminPricingCatalogRow["category_id"],
      label_ar: m[4],
      base_price: m[5],
      price_mode: m[6] as AdminPricingCatalogRow["price_mode"],
      receiver_type: m[7] as AdminPricingCatalogRow["receiver_type"],
      beta_visibility: m[8] as AdminPricingCatalogRow["beta_visibility"],
      requires_payment: m[9] === "true",
      enabled: m[10] === "true",
      metadata: JSON.parse(m[11]),
    });
  }
  return rows;
}

/** The 15 disabled seed rows with no adminHidden flag, pinned at HEAD (task-3 report). */
const LEGACY_15 = [
  "ai-letter", "file-lawsuit", "appeal", "cassation", "defense", "admin-objection",
  "mediation", "full-arbitration", "settlement", "legal-notice", "power-of-attorney",
  "inheritance", "enforce-judgment", "translation", "general",
];

/** A row put through the merge as the updated DB row would be (update applied over the stored row). */
function afterUpdate(row: AdminPricingCatalogRow, update: Record<string, unknown>): AdminPricingCatalogRow {
  return { ...row, ...update } as AdminPricingCatalogRow;
}

/** What a customer's by-id lookup returns, with the two "absent = default" fields normalised. */
function normalised(item: ClientServiceCatalogItem) {
  const out: Record<string, unknown> = { ...item, enabled: item.enabled !== false, audience: item.audience ?? "individual" };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const row = (over: Partial<AdminPricingCatalogRow> = {}): AdminPricingCatalogRow => ({
  service_id: "contract-review",
  audience: "individual",
  category_id: "contracts",
  label_ar: "مراجعة من محام متخصص",
  base_price: "600",
  price_mode: "starting_from",
  receiver_type: "lawyer",
  beta_visibility: "public",
  requires_payment: true,
  enabled: true,
  metadata: { priceNote: "يُؤكَّد", keepMe: 1 } as AdminPricingCatalogRow["metadata"],
  ...over,
});

// ── S6-T7: the section's exact cases ──────────────────────────────────────

test("S6: catalogue patch rules", () => {
  const sf = { price_mode: "starting_from", base_price: 600 };
  assert.deepEqual(validateCatalogPatch(sf, { basePrice: 650 }), { ok: true, fields: { base_price: 650 } });
  assert.deepEqual(validateCatalogPatch(sf, { basePrice: -1 }), { ok: false, error: "السعر غير صالح" });
  assert.deepEqual(validateCatalogPatch(sf, { priceMode: "fixed", basePrice: 0 }), {
    ok: false,
    error: "السعر مطلوب وأكبر من صفر لهذه الطريقة",
  });
  assert.deepEqual(validateCatalogPatch(sf, { priceMode: "weird" }), { ok: false, error: "طريقة التسعير غير صالحة" });
  assert.deepEqual(validateCatalogPatch(sf, { priceNote: "x".repeat(201) }), {
    ok: false,
    error: "الملاحظة أطول من ٢٠٠ حرف",
  });
  assert.deepEqual(validateCatalogPatch(sf, { enabled: false }), { ok: true, fields: { enabled: false } });
});

test("S6: the price modes are the code's ClientServicePriceMode, pinned at HEAD", () => {
  assert.deepEqual([...CATALOG_PRICE_MODES], ["free", "included", "fixed", "starting_from", "custom", "per_page", "points"]);
  for (const s of CLIENT_SERVICE_CATALOG) assert.ok(CATALOG_PRICE_MODES.includes(s.priceMode), s.serviceId);
});

test("S6: every field is type-checked on the server — no coercion", () => {
  const sf = { price_mode: "starting_from", base_price: 600 };
  for (const bad of ["650", null, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, 650.123, true]) {
    assert.deepEqual(validateCatalogPatch(sf, { basePrice: bad }), { ok: false, error: "السعر غير صالح" }, String(bad));
  }
  assert.deepEqual(validateCatalogPatch(sf, { basePrice: 1_000_000 }), { ok: true, fields: { base_price: 1_000_000 } });
  assert.deepEqual(validateCatalogPatch(sf, { basePrice: 0.5 }), { ok: true, fields: { base_price: 0.5 } });
  assert.deepEqual(validateCatalogPatch(sf, { priceMode: 3 }), { ok: false, error: "طريقة التسعير غير صالحة" });
  assert.deepEqual(validateCatalogPatch(sf, { priceNote: 5 }), { ok: false, error: "الملاحظة أطول من ٢٠٠ حرف" });
  assert.deepEqual(validateCatalogPatch(sf, { enabled: "false" }), { ok: false, error: "قيمة الإظهار غير صالحة" });
  assert.deepEqual(validateCatalogPatch(sf, { priceNote: "  ملاحظة  " }), { ok: true, fields: { priceNote: "ملاحظة" } });
  assert.deepEqual(validateCatalogPatch(sf, { priceNote: "x".repeat(200) }), { ok: true, fields: { priceNote: "x".repeat(200) } });
});

test("S6: a body that is not an object, or names nothing the route writes, is refused", () => {
  const sf = { price_mode: "starting_from", base_price: 600 };
  for (const body of [null, [], "x", 3]) {
    assert.deepEqual(validateCatalogPatch(sf, body), { ok: false, error: "بيانات غير صالحة" }, String(body));
  }
  assert.deepEqual(validateCatalogPatch(sf, {}), { ok: false, error: "لا توجد حقول للتحديث" });
  assert.deepEqual(validateCatalogPatch(sf, { label: "x", audience: "corporate", enabled_x: 1 }), {
    ok: false,
    error: "لا توجد حقول للتحديث",
  });
});

test("S6: «fixed»/«starting_from» need an effective price above zero (sent or stored)", () => {
  assert.deepEqual(validateCatalogPatch({ price_mode: "custom", base_price: 0 }, { priceMode: "starting_from" }), {
    ok: false,
    error: "السعر مطلوب وأكبر من صفر لهذه الطريقة",
  });
  assert.deepEqual(validateCatalogPatch({ price_mode: "fixed", base_price: "800" }, { basePrice: 0 }), {
    ok: false,
    error: "السعر مطلوب وأكبر من صفر لهذه الطريقة",
  });
  assert.deepEqual(validateCatalogPatch({ price_mode: "custom", base_price: "250.00" }, { priceMode: "fixed" }), {
    ok: true,
    fields: { price_mode: "fixed" },
  });
  // other modes may carry 0
  assert.deepEqual(validateCatalogPatch({ price_mode: "fixed", base_price: 600 }, { priceMode: "free", basePrice: 0 }), {
    ok: true,
    fields: { base_price: 0, price_mode: "free" },
  });
});

// ── the toggle contract (controller ruling 1) ─────────────────────────────

test("S6: disabling writes enabled=false AND adminHidden; enabling removes it; other metadata kept", () => {
  const live = row();
  const off = catalogRowUpdate(live, { enabled: false });
  assert.ok(off.ok);
  assert.equal(off.legacyRealigned, false);
  assert.deepEqual(off.update, { enabled: false, metadata: { priceNote: "يُؤكَّد", keepMe: 1, adminHidden: true } });

  const hidden = row({ enabled: false, metadata: { priceNote: "يُؤكَّد", keepMe: 1, adminHidden: true } as AdminPricingCatalogRow["metadata"] });
  const on = catalogRowUpdate(hidden, { enabled: true });
  assert.ok(on.ok);
  assert.deepEqual(on.update, { enabled: true, metadata: { priceNote: "يُؤكَّد", keepMe: 1 } });
  // the input row is not mutated
  assert.deepEqual(hidden.metadata, { priceNote: "يُؤكَّد", keepMe: 1, adminHidden: true });
});

test("S6: a price edit on a live row writes only that column; a note edit keeps every other metadata key", () => {
  const price = catalogRowUpdate(row(), { basePrice: 650 });
  assert.ok(price.ok);
  assert.deepEqual(price.update, { base_price: 650 });
  const note = catalogRowUpdate(row(), { priceNote: "جديد" });
  assert.ok(note.ok);
  assert.deepEqual(note.update, { metadata: { priceNote: "جديد", keepMe: 1 } });
  const bad = catalogRowUpdate(row(), { basePrice: -5 });
  assert.deepEqual(bad, { ok: false, error: "السعر غير صالح" });
});

// ── legacy rows (controller ruling 2) ─────────────────────────────────────

test("S6: the legacy rows are exactly the 15 disabled seed rows without adminHidden, and each has a code entry", () => {
  const rows = seedRows();
  assert.equal(rows.length, 27);
  const legacy = rows.filter(isLegacyCatalogRow).map((r) => r.service_id).sort();
  assert.deepEqual(legacy, [...LEGACY_15].sort());
  for (const id of LEGACY_15) assert.ok(codeEntryFor(id), `${id} has no code entry`);
  // the flag (as the loader reads it: text 'true') ends the legacy state
  assert.equal(isLegacyCatalogRow(row({ enabled: false, metadata: { adminHidden: true } })), false);
  assert.equal(isLegacyCatalogRow(row({ enabled: false, metadata: { adminHidden: false } })), true);
  assert.equal(isLegacyCatalogRow(row({ enabled: false, metadata: {} })), true);
  assert.equal(isLegacyCatalogRow(row({ enabled: true })), false);
});

test("S6: a legacy row's first PATCH realigns it to the code entry — the merge then equals the code (all 15)", () => {
  for (const legacy of seedRows().filter(isLegacyCatalogRow)) {
    const code = codeEntryFor(legacy.service_id)!;
    const patch = legacyRealignPatch(legacy, code, {});
    const merged = mergeAdminPricingCatalogRows([afterUpdate(legacy, patch)]);
    assert.deepEqual(
      normalised(getClientServiceById(legacy.service_id, merged)),
      normalised(code),
      `${legacy.service_id}: the realigned row differs from the code entry`,
    );
    // no longer legacy: a second PATCH never re-realigns over the admin's edit
    assert.equal(isLegacyCatalogRow(afterUpdate(legacy, patch)), false, legacy.service_id);
  }
});

test("S6: the stale seed values never come back (ai-letter 49 / «الأسرع» / ai_individual; appeal «شائع»; general internal)", () => {
  const rows = seedRows();
  const of = (id: string) => rows.find((r) => r.service_id === id)!;

  const aiLetter = catalogRowUpdate(of("ai-letter"), { priceNote: "ملاحظة المشرف" });
  assert.ok(aiLetter.ok);
  assert.equal(aiLetter.legacyRealigned, true);
  const ai = getClientServiceById("ai-letter", mergeAdminPricingCatalogRows([afterUpdate(of("ai-letter"), aiLetter.update)]));
  const aiCode = codeEntryFor("ai-letter")!;
  assert.equal(ai.basePrice, aiCode.basePrice);
  assert.notEqual(ai.basePrice, 49);
  assert.equal(ai.tag, aiCode.tag);
  assert.notEqual(ai.tag, "الأسرع");
  assert.equal(ai.includedByPlan, aiCode.includedByPlan);
  assert.equal(ai.priceNote, "ملاحظة المشرف", "the admin's explicit field wins over the code value");
  assert.equal(ai.betaVisibility, aiCode.betaVisibility);

  const appeal = catalogRowUpdate(of("appeal"), { basePrice: 2500 });
  assert.ok(appeal.ok);
  const ap = getClientServiceById("appeal", mergeAdminPricingCatalogRows([afterUpdate(of("appeal"), appeal.update)]));
  assert.equal(ap.basePrice, 2500, "the admin's price wins");
  assert.equal(ap.tag, codeEntryFor("appeal")!.tag);
  assert.notEqual(ap.tag, "شائع");
  assert.equal(ap.enabled, true, "the edit reaches customers: the row is now enabled");

  const general = catalogRowUpdate(of("general"), { enabled: false });
  assert.ok(general.ok);
  assert.equal(general.update.enabled, false);
  assert.equal((general.update.metadata as Record<string, unknown>).adminHidden, true);
  assert.equal(general.update.beta_visibility, codeEntryFor("general")!.betaVisibility);
  assert.notEqual(general.update.beta_visibility, "internal");
});

test("S6: a legacy realign validates against the code values, not the stale row", () => {
  // ai-letter's code entry is not fixed/starting_from at 49; switching to «fixed» with no price
  // is judged against the code's price (0), not the stale 49.
  const aiLetter = seedRows().find((r) => r.service_id === "ai-letter")!;
  const code = codeEntryFor("ai-letter")!;
  assert.equal(Number(aiLetter.base_price), 49, "fixture: the stale seed price");
  assert.equal(code.basePrice, 0, "fixture: the code price");
  const res = catalogRowUpdate(aiLetter, { priceMode: "fixed" });
  assert.deepEqual(res, { ok: false, error: "السعر مطلوب وأكبر من صفر لهذه الطريقة" });
  assert.ok(catalogRowUpdate(aiLetter, { priceMode: "fixed", basePrice: 49 }).ok);
});

test("S6: a legacy row keeps its non-display metadata keys (e.g. variantOf, unknown keys)", () => {
  const legacy = row({
    service_id: "appeal",
    enabled: false,
    metadata: { tag: "شائع", variantOf: "x-base", extra: "x" } as AdminPricingCatalogRow["metadata"],
  });
  const patch = legacyRealignPatch(legacy, codeEntryFor("appeal")!, {});
  const meta = patch.metadata as Record<string, unknown>;
  assert.equal(meta.extra, "x");
  assert.equal(meta.variantOf, "x-base");
  assert.equal("tag" in meta && meta.tag === "شائع", false);
});

test("S6: a disabled row with no code entry is not realigned (nothing to realign to)", () => {
  const orphan = row({ service_id: "no-such-service", enabled: false, metadata: {} });
  const res = catalogRowUpdate(orphan, { basePrice: 100 });
  assert.ok(res.ok);
  assert.equal(res.legacyRealigned, false);
  assert.deepEqual(res.update, { base_price: 100 });
});

test("S6: the admin screen shows what the customer sees (a legacy row reads the code entry)", () => {
  const aiLetter = seedRows().find((r) => r.service_id === "ai-letter")!;
  const code = codeEntryFor("ai-letter")!;
  const view = customerViewOf(aiLetter);
  assert.deepEqual(view, {
    legacy: true,
    label: code.label,
    basePrice: code.basePrice,
    priceMode: code.priceMode,
    priceNote: code.priceNote ?? "",
    visible: code.enabled !== false,
  });
  const live = customerViewOf(row({ base_price: "650.00" }));
  assert.deepEqual(live, {
    legacy: false,
    label: "مراجعة من محام متخصص",
    basePrice: 650,
    priceMode: "starting_from",
    priceNote: "يُؤكَّد",
    visible: true,
  });
  assert.equal(customerViewOf(row({ enabled: false, metadata: { adminHidden: true } })).visible, false);
});

test("S6: the screen sends only what changed against what the customer sees (a legacy row never resends stale values)", () => {
  const aiLetter = seedRows().find((r) => r.service_id === "ai-letter")!;
  const view = customerViewOf(aiLetter);
  const untouched = { basePrice: view.basePrice, priceMode: view.priceMode, priceNote: view.priceNote, enabled: view.visible };
  assert.deepEqual(changedCatalogFields(view, untouched), {});
  assert.deepEqual(changedCatalogFields(view, { ...untouched, basePrice: 25 }), { basePrice: 25 });
  assert.deepEqual(changedCatalogFields(view, { ...untouched, priceNote: "  ملاحظة " }), { priceNote: "ملاحظة" });
  assert.deepEqual(changedCatalogFields(view, { ...untouched, enabled: false }), { enabled: false });
  assert.deepEqual(changedCatalogFields(view, { ...untouched, priceMode: "fixed", basePrice: 49 }), { basePrice: 49, priceMode: "fixed" });
  // the stale seed price 49 is never in an untouched body
  assert.equal(Object.values(changedCatalogFields(view, untouched)).includes(49), false);
});
