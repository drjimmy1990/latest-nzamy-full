import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the search page sends only filters used by its requested section", () => {
  assert.match(pageSource, /if \(section === 'precedents' && precTrack !== 'all'\) filters\.track = precTrack/);
  assert.match(pageSource, /if \(section === 'precedents' && precSource !== 'all'\) filters\.source = precSource/);
  assert.match(pageSource, /if \(section === 'orders' && orderIssuer !== 'all'\) filters\.issuer = orderIssuer/);
  assert.match(pageSource, /if \(section === 'laws' && articleStatusFilter\) filters\.status = articleStatusFilter/);
  assert.doesNotMatch(pageSource, /if \(precTrack !== 'all'\) filters\.track/);
  assert.doesNotMatch(pageSource, /if \(orderIssuer !== 'all'\) filters\.issuer/);
});

test("an incompatible selected category fails closed before the request is sent", () => {
  const guardStart = pageSource.indexOf("if (cat !== 'all' && section !== 'laws' && section !== 'orders')");
  const fetchStart = pageSource.indexOf("const res = await fetch('/api/library/search'");
  assert.ok(guardStart >= 0 && guardStart < fetchStart, "category guard must run before fetch");
  assert.match(pageSource, /مرشح التصنيف يطبّق على الأنظمة والأوامر فقط؛ لم يُنفذ البحث\./);
  assert.match(pageSource, /The category filter applies only to laws and orders; the search was not sent\./);
  assert.match(pageSource, /setSearchResults\(null\);[\s\S]{0,240}setSearchError\(/);
});
