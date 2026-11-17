/**
 * P1-39: the RSS 2.0 builder of /blog/rss.xml (./_rss.ts).
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/blog/_rss.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RSS_MAX_ITEMS, articleUrl, buildRssXml, rssDate, xmlEscape, type RssArticle } from "./_rss.ts";

const CHANNEL = {
  baseUrl: "https://nezamy.sa",
  title: "المدونة القانونية — نظامي",
  description: "مقالات قانونية",
  path: "/blog",
  selfPath: "/blog/rss.xml",
  language: "ar",
};

const items = (xml: string) => xml.split("<item>").slice(1);

test("the channel: RSS 2.0, Arabic, absolute links, an atom self link", () => {
  const xml = buildRssXml(CHANNEL, []);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"'));
  assert.match(xml, /<title>المدونة القانونية — نظامي<\/title>/);
  assert.match(xml, /<link>https:\/\/nezamy\.sa\/blog<\/link>/);
  assert.match(xml, /<language>ar<\/language>/);
  assert.match(xml, /<atom:link href="https:\/\/nezamy\.sa\/blog\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.ok(xml.trimEnd().endsWith("</channel>\n</rss>"));
  // No items → no lastBuildDate (never "now").
  assert.doesNotMatch(xml, /lastBuildDate/);
});

test("items: newest first, at most 30, the build date is the newest item's", () => {
  const rows: RssArticle[] = Array.from({ length: 40 }, (_, i) => ({
    slug: `a-${i}`,
    title: `مقال ${i}`,
    published_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  }));
  rows.push({ slug: "undated", title: "بلا تاريخ", published_at: null });
  const xml = buildRssXml(CHANNEL, rows.reverse().slice().sort(() => 0));
  const list = items(xml);
  assert.equal(list.length, RSS_MAX_ITEMS);
  assert.match(list[0], /<title>مقال 39<\/title>/);
  assert.match(list[29], /<title>مقال 10<\/title>/);
  assert.ok(!xml.includes("بلا تاريخ"), "an undated row sorts last and falls past the cap");
  assert.match(xml, new RegExp(`<lastBuildDate>${new Date(Date.UTC(2026, 0, 40)).toUTCString()}</lastBuildDate>`));
});

test("an Arabic slug is percent-encoded in link and guid, both absolute", () => {
  const slug = "حقوق العامل & المكافأة";
  const xml = buildRssXml(CHANNEL, [{ slug, title: "حقوق العامل", published_at: "2026-11-01T08:00:00Z" }]);
  const url = `https://nezamy.sa/blog/${encodeURIComponent(slug)}`;
  assert.equal(articleUrl("https://nezamy.sa/", slug), url);
  assert.ok(xml.includes(`<link>${url}</link>`));
  assert.ok(xml.includes(`<guid isPermaLink="true">${url}</guid>`));
  assert.ok(xml.includes("<pubDate>Sun, 01 Nov 2026 08:00:00 GMT</pubDate>"));
});

test("text is escaped, and characters XML forbids are dropped", () => {
  assert.equal(xmlEscape(`<b>"A" & 'B'</b>`), "&lt;b&gt;&quot;A&quot; &amp; &apos;B&apos;&lt;/b&gt;");
  assert.equal(xmlEscape("a\u0000b\u0008c\u001Fd\te\nf"), "abcd\te\nf");
  const xml = buildRssXml(CHANNEL, [{
    slug: "x",
    title: "عنوان </title><script>alert(1)</script>",
    excerpt: "مقتطف & <b>عريض</b> ]]>",
    category: "عمالي",
    author: "فريق \u0001نظامي",
    published_at: "2026-11-02T00:00:00Z",
  }]);
  assert.ok(!xml.includes("<script>"));
  assert.ok(xml.includes("<title>عنوان &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>"));
  assert.ok(xml.includes("<description>مقتطف &amp; &lt;b&gt;عريض&lt;/b&gt; ]]&gt;</description>"));
  assert.ok(xml.includes("<category>عمالي</category>"));
  assert.ok(xml.includes("<dc:creator>فريق نظامي</dc:creator>"));
});

test("optional fields are left out, rows without slug or title are skipped, bad dates give no pubDate", () => {
  const xml = buildRssXml(CHANNEL, [
    { slug: "ok", title: "مقال", excerpt: "  ", category: null, author: null, published_at: "not a date" },
    { slug: "", title: "بلا رابط" },
    { slug: "no-title", title: "  " },
  ]);
  const list = items(xml);
  assert.equal(list.length, 1);
  assert.doesNotMatch(list[0], /<description>|<category>|<dc:creator>|<pubDate>/);
  assert.equal(rssDate("not a date"), null);
  assert.equal(rssDate(null), null);
});

test("the route serves RSS with its content type, reads only published rows, and fails as a 503", () => {
  const route = readFileSync(new URL("./rss.xml/route.ts", import.meta.url), "utf8");
  assert.match(route, /"Content-Type": "application\/rss\+xml; charset=utf-8"/);
  assert.match(route, /\.eq\("status", "published"\)/);
  assert.match(route, /\.order\("published_at", \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(route, /\.limit\(RSS_MAX_ITEMS\)/);
  const select = route.match(/\.select\("([^"]*)"\)/)?.[1] ?? "*";
  assert.ok(select !== "*" && !/\bbody\b/.test(select), "only the printed columns, never the article body");
  assert.match(route, /status: 503/);
  assert.match(route, /blogCategoryLabel\(row\.category\)/, "no raw sec_* codes");
});
