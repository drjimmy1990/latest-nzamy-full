import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { orderCopyPrefix, orderHeaderLine, orderMetaShown } from "./orderMetaLabels.ts";

const reader = readFileSync(new URL("./orders/[slug]/page.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./orders/[slug]/_sidebar.tsx", import.meta.url), "utf8");
const items = readFileSync(new URL("./components/ListItems.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const decreeRoute = readFileSync(new URL("../api/library/decrees/[id]/route.ts", import.meta.url), "utf8");
const searchRoute = readFileSync(new URL("../api/library/search/route.ts", import.meta.url), "utf8");

test("owner ٤٢٤ / ٣٨٠: a blank or «—» number or date is not shown", () => {
  for (const v of ["", "  ", "—", null, undefined, 5]) assert.equal(orderMetaShown(v), false, String(v));
  assert.equal(orderMetaShown("13/ت/1234"), true);
});

test("the reader's header line has no stray «•»", () => {
  assert.equal(orderHeaderLine("13/ت/1234", "1445/03/12هـ"), "13/ت/1234 • 1445/03/12هـ");
  assert.equal(orderHeaderLine("13/ت/1234", ""), "13/ت/1234");
  assert.equal(orderHeaderLine("", "1445/03/12هـ"), "1445/03/12هـ");
  assert.equal(orderHeaderLine("", ""), "");
  assert.equal(orderHeaderLine("—", "—"), "");
});

test("a copied page never says «رقم ()»", () => {
  assert.equal(orderCopyPrefix(2, "تعميم", "13/ت/1234", true), "الصفحة 2 من تعميم رقم (13/ت/1234) ونصه:");
  assert.equal(orderCopyPrefix(2, "تعميم", "", true), "الصفحة 2 من تعميم ونصه:");
  assert.equal(orderCopyPrefix(1, "Circular", "7", false), "Page 1 of Circular Ref (7), text:");
  assert.equal(orderCopyPrefix(1, "Circular", "—", false), "Page 1 of Circular, text:");
});

test("source: the decree route, init/search and the screens use the mask and the blank-safe helpers", () => {
  assert.match(decreeRoute, /maskDecreeOfficialFields\(\s*\{ ref: decree\.ref \|\| '', date: decree\.date \|\| '', official_url: decree\.official_url \|\| '' \},\s*isSubscriber,\s*\)/);
  assert.match(decreeRoute, /officialMetaLocked: !isSubscriber,/);
  assert.match(searchRoute, /maskDecreeOfficialFields\(\{ ref: r\.ref \?\? '', date: r\.date \?\? '' \}, hasFullAccess\)/);
  assert.doesNotMatch(reader, /\{order\.ref\} • \{order\.date\}/);
  assert.doesNotMatch(reader, /رقم \(\$\{order\.ref\}\)/);
  assert.match(reader, /orderHeaderLine\(order\.ref, order\.date\)/);
  assert.match(sidebar, /order\.officialMetaLocked \? \(\s*<OfficialMetaLockedRow/);
  assert.equal((items.match(/orderMetaShown\(o\.(?:ref|date)\) &&/g) || []).length, 4);
  assert.doesNotMatch(page, /ref: d\.ref \|\| "—"|date: d\.date \|\| "—"|ref: r\.meta\?\.ref \|\| '—'|date: r\.meta\?\.date \|\| '—'/);
});
