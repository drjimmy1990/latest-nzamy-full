import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { instantBadge, instantBoxItems, instantHref, lawNameCore } from "./instantBox.ts";

const MURAFAAT = "نظام المرافعات الشرعية";
const MURAFAAT_BOG = "نظام المرافعات أمام ديوان المظالم";

test("١٢-٢: the name core is short and distinctive", () => {
  assert.equal(lawNameCore("نظام العمل"), "العمل");
  assert.equal(lawNameCore("نظام الشركات"), "الشركات");
  assert.equal(lawNameCore("نظام مكافحة الاحتيال المالي وخيانة الأمانة"), "مكافحة الاحتيال");
  assert.equal(lawNameCore(""), "");
});

test("١٢-٢: the two مرافعات laws never collapse into one name", () => {
  const set = [MURAFAAT, MURAFAAT_BOG];
  const a = lawNameCore(MURAFAAT, set);
  const b = lawNameCore(MURAFAAT_BOG, set);
  assert.notEqual(a, b);
  assert.equal(a, "المرافعات الشرعية");
  assert.equal(b, "المرافعات أمام");
  // hamza/ta-marbuta spelling does not hide a clash: a name that is the
  // start of another stays whole, the other one lengthens past it
  const pair = ["نظام المرافعات الشرعيه", "نظام المرافعات الشرعية التجارية"];
  assert.equal(lawNameCore(pair[0], pair), "نظام المرافعات الشرعيه");
  assert.equal(lawNameCore(pair[1], pair), "المرافعات الشرعية التجارية");
  // a law and its regulation share the whole tail: the full titles stay apart
  const reg = "اللائحة التنفيذية لنظام المرافعات الشرعية";
  assert.notEqual(lawNameCore(MURAFAAT, [MURAFAAT, reg]), lawNameCore(reg, [MURAFAAT, reg]));
});

test("١٢-٢: badges [نظام|لائحة|مبدأ|فقه|أمر]", () => {
  assert.equal(instantBadge({ section: "laws", title: "نظام العمل" }), "نظام");
  assert.equal(instantBadge({ section: "laws", title: "اللائحة التنفيذية لنظام العمل" }), "لائحة");
  assert.equal(instantBadge({ section: "laws", title: "نظام", lawType: "regulation" }), "لائحة");
  assert.equal(instantBadge({ section: "precedents" }), "مبدأ");
  assert.equal(instantBadge({ section: "feqh" }), "فقه");
  assert.equal(instantBadge({ section: "orders" }), "أمر");
});

test("١٢-٢: a click opens the document with ?q=", () => {
  const q = "عمل";
  const enc = encodeURIComponent(q);
  assert.equal(instantHref({ section: "laws", slug: "labor" }, q), `/laws/labor?q=${enc}`);
  assert.equal(instantHref({ section: "feqh", slug: "mughni" }, q), `/book/mughni?q=${enc}`);
  assert.equal(instantHref({ section: "orders", slug: "o1" }, q), `/laws/orders/o1?q=${enc}`);
  assert.equal(instantHref({ section: "precedents", slug: "c1", kind: "collection" }, q), `/precedents/c1?q=${enc}`);
  assert.equal(instantHref({ section: "precedents", slug: "p1", href: "/precedents/c1?target=p1#p1" }, q), `/precedents/c1?target=p1&q=${enc}#p1`);
  assert.equal(instantHref({ section: "precedents", slug: "p1" }, q), "", "a principle with no collection opens nothing");
  assert.equal(instantHref({ section: "laws", slug: "x", href: "https://evil.example/" }, q), "", "only site paths");
});

test("instantBoxItems: a locked row carries no snippet; laws get their core", () => {
  const items = instantBoxItems([
    { title: MURAFAAT, section: "laws", slug: "a" },
    { title: MURAFAAT_BOG, section: "laws", slug: "b" },
    { title: "مبدأ رقم 3", section: "precedents", slug: "p", snippet: "نص", locked: true, href: "/precedents/c?target=p#p" },
    { title: "", section: "laws", slug: "z" },
  ], "مرافعات");
  assert.equal(items.length, 3);
  assert.notEqual(items[0].core, items[1].core);
  assert.equal(items[2].snippet, "");
  assert.equal(items[2].locked, true);
});

test("source: the box opens the document; the route locks principle snippets per viewer", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /instantBoxItems\(data\.topMatches \|\| \[\], q\)/);
  assert.match(page, /if \(s\.href\) \{\s*router\.push\(s\.href\);/);
  const route = readFileSync(new URL("../api/library/autocomplete/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /snippet: text\?\.slice\(0, 120\)/, "no principle text for every viewer");
  assert.match(route, /const isFree = access !== null && isFreeLibraryItem\(\{\s*contentType: 'principles'/);
  assert.match(route, /snippet: isFree && text \?/);
  assert.match(route, /'Cache-Control': TIER_SHAPED_CACHE_CONTROL/);
  assert.match(route, /\.select\('id, principle_number, issuing_body, text, collection_id'\)/);
});
