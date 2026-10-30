/**
 * buildLibraryMetadata — a library document's <head> (owner note ١٤ phase 1,
 * answers ٣١٨ / ٣١٩): its own title without «| نظامي - نظامي», og-image.png
 * kept, and no decree number, date or official link anywhere in it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLibraryFallbackMetadata, buildLibraryMetadata, buildMetadata } from "./seo.ts";

const FORBIDDEN = [/م\s*\/\s*[0-9٠-٩]/u, /١٤٤٢|1442/u, /رمضان/u, /gov\.sa/i, /www\./i, /boe/i];

/** Every string in the metadata, with our own canonical / og URLs removed. */
function texts(meta: unknown): string {
  return JSON.stringify(meta).replace(/https:\/\/nezamy\.sa[^"]*/g, "");
}

const LEAKY = {
  kind: "law" as const,
  id: "nizam-al-amal",
  name: "نظام العمل الصادر بالمرسوم الملكي رقم (م/‏51) وتاريخ ١٤٤٢/٩/٢٢هـ - نظامي | Nezamy",
  description:
    "صدر بالمرسوم الملكي رقم (م/‏14) وتاريخ ١٤٤٢/٩/٢٢هـ ويُعمل به من 22 رمضان 1442هـ.\n" +
    "يهدف إلى تنظيم علاقات العمل. المصدر: [هيئة الخبراء](https://www.boe.gov.sa/ar/Laws/1) و www.boe.gov.sa",
};

test("no decree number, date or link reaches <head>, whatever the source carried", () => {
  const meta = buildLibraryMetadata(LEAKY);
  const all = texts(meta);
  for (const re of FORBIDDEN) assert.doesNotMatch(all, re, String(re));
  assert.match(String(meta.description), /تنظيم علاقات العمل/);
});

test("the brand once: «<name> | نظامي», never «| نظامي - نظامي» or «- نظامي | Nezamy»", () => {
  const meta = buildLibraryMetadata({ kind: "law", id: "x", name: "نظام العمل - نظامي | Nezamy", description: "تنظيم العمل في المملكة." });
  assert.equal(meta.title, "نظام العمل | نظامي");
  assert.equal((meta.openGraph as { title?: string }).title, "نظام العمل | نظامي");
  assert.equal((meta.twitter as { title?: string }).title, "نظام العمل | نظامي");
  assert.doesNotMatch(String(meta.title), /نظامي\s*[|\-–—]\s*(?:نظامي|Nezamy)/);
  assert.doesNotMatch(String(meta.title), /Nezamy/);
});

test("og-image.png is kept in openGraph and twitter (a child replaces the root's whole)", () => {
  const meta = buildLibraryMetadata({ kind: "book", id: "المغني", name: "المغني", description: "كتاب في الفقه الحنبلي المقارن." });
  const og = meta.openGraph as { images?: Array<{ url: string; width: number; height: number }> };
  assert.equal(og.images?.[0]?.url, "https://nezamy.sa/og-image.png");
  assert.equal(og.images?.[0]?.width, 1024);
  assert.deepEqual((meta.twitter as { images?: string[] }).images, ["https://nezamy.sa/og-image.png"]);
});

test("canonical is the document's own page, its id encoded once", () => {
  const meta = buildLibraryMetadata({ kind: "book", id: "المغني - الجزء 01", name: "المغني", description: "" });
  assert.equal((meta.alternates as { canonical?: string }).canonical, `https://nezamy.sa/book/${encodeURIComponent("المغني - الجزء 01")}`);
  const order = buildLibraryMetadata({ kind: "order", id: "0b1c2d3e-0000-4000-8000-000000000000", name: "تعميم", description: "" });
  assert.equal((order.alternates as { canonical?: string }).canonical, "https://nezamy.sa/laws/orders/0b1c2d3e-0000-4000-8000-000000000000");
  assert.deepEqual(meta.robots, { index: true, follow: true });
});

test("the fallback <head> carries no database value and is noindex when asked", () => {
  const closed = buildLibraryFallbackMetadata("law", { noIndex: true });
  assert.deepEqual(closed.robots, { index: false, follow: false });
  assert.equal(closed.title, "مكتبة الأنظمة والتشريعات السعودية | نظامي");
  const failed = buildLibraryFallbackMetadata("collection", { noIndex: false });
  assert.deepEqual(failed.robots, { index: true, follow: true });
});

test("buildMetadata (every other page) is unchanged", () => {
  const meta = buildMetadata({ titleAr: "عن نظامي", descriptionAr: "وصف", path: "/about" });
  assert.equal(meta.title, "عن نظامي - نظامي | Nezamy");
});
