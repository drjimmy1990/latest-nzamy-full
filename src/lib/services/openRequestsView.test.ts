/**
 * openRequestsView.test.ts — owner ١٠: a lawyer sees type, city and summary only.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/openRequestsView.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toOpenRequestItem, toOpenRequestItems } from "./openRequestsView.ts";

test("a new row: Arabic type, Arabic city and the summary", () => {
  assert.deepEqual(
    toOpenRequestItem({
      id: "REQ-1",
      type: "consultation",
      receiver: "lawyer",
      city: "jeddah",
      public_summary: "استشارة: نزاع على إيجار محل تجاري",
      status: "pending_assignment",
      created_at: "2026-11-17T10:00:00Z",
    }),
    { id: "REQ-1", typeLabel: "استشارة", cityLabel: "جدة", summary: "استشارة: نزاع على إيجار محل تجاري", createdAt: "2026-11-17T10:00:00Z" },
  );
});

test("an old row (no city, no summary) shows its type only", () => {
  const item = toOpenRequestItem({ id: "REQ-2", type: "service", city: null, public_summary: null });
  assert.deepEqual(item, { id: "REQ-2", typeLabel: "خدمة", cityLabel: null, summary: null, createdAt: null });
});

test("an unsafe summary is never shown, an unknown slug or type is not printed raw", () => {
  const item = toOpenRequestItem({ id: "REQ-3", type: "brand_new", city: "atlantis", public_summary: "اتصل على 0551234567" });
  assert.deepEqual(item, { id: "REQ-3", typeLabel: "طلب", cityLabel: null, summary: null, createdAt: null });
});

test("whatever extra field a row carries, the item has the four listing fields only", () => {
  const item = toOpenRequestItem({ id: "REQ-4", type: "service", title: "محمد بن سعد", description: "نص" } as never);
  assert.deepEqual(Object.keys(item ?? {}).sort(), ["cityLabel", "createdAt", "id", "summary", "typeLabel"]);
});

test("rows without an id are dropped; a non-array is an empty list", () => {
  assert.equal(toOpenRequestItems([{ id: "" }, { type: "service" }, null, { id: "REQ-5" }]).length, 1);
  assert.deepEqual(toOpenRequestItems(null), []);
  assert.deepEqual(toOpenRequestItems({}), []);
});
