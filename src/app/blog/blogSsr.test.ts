/**
 * Owner package 25-Nov (annex 09 GSC-02, gap A-75): Googlebot read /blog with
 * no <h1> and no JSON-LD. Two causes: BlogList's `if (!mounted) return null`,
 * and its own useSearchParams, which on a prerendered route leaves everything
 * up to the nearest <Suspense> (whose fallback was null) to the browser.
 * Source-read: .tsx cannot load under node --test. The build's HTML is the
 * real check (see the l16-seo report); this pins the shape that produces it.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/blog/blogSsr.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildBlogListJsonLd, serializeJsonLd } from "../../lib/publicSeo/structuredData.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("BlogList renders on the server: no mounted gate, no useSearchParams of its own", () => {
  const code = strip(read("./BlogList.tsx"));
  assert.doesNotMatch(code, /if \(!mounted\) return null/);
  assert.doesNotMatch(code, /useSearchParams/);
  assert.match(code, /urlCategory\?: string \| null/);
  assert.match(code, /<h1 /);
});

test("/blog: the Suspense fallback is the list itself, and the JSON-LD is printed outside it", () => {
  const page = strip(read("./(list)/page.tsx"));
  assert.match(page, /<Suspense fallback=\{<BlogList \/>\}>/);
  assert.match(page, /<BlogListFromUrl \/>/);
  assert.match(page, /type="application\/ld\+json" dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(jsonLd\) \}\}/);
  const wrapper = strip(read("./BlogListFromUrl.tsx"));
  assert.match(wrapper, /useSearchParams\(\)/);
  assert.match(wrapper, /<BlogList urlCategory=\{searchParams\.get\("category"\)\} \/>/);
});

test("a category page needs no Suspense: the list reads no search params", () => {
  const page = strip(read("./category/[slug]/page.tsx"));
  assert.doesNotMatch(page, /Suspense/);
  assert.match(page, /<BlogList key=\{category\.slug\} categorySlug=\{category\.slug\} \/>/);
  assert.match(page, /serializeJsonLd\(jsonLd\)/);
});

test("buildBlogListJsonLd: a CollectionPage of the Blog + the breadcrumb, nothing invented", () => {
  const list = buildBlogListJsonLd({ name: "المدونة القانونية", description: "d", path: "/blog" }) as { "@graph": any[] };
  const [pageNode, crumbs] = list["@graph"];
  assert.equal(pageNode["@type"], "CollectionPage");
  assert.equal(pageNode.url, "https://nezamy.sa/blog");
  assert.equal(pageNode.isPartOf["@type"], "Blog");
  assert.deepEqual(pageNode.publisher, { "@id": "https://nezamy.sa/#organization" });
  assert.equal(crumbs["@type"], "BreadcrumbList");
  assert.deepEqual(crumbs.itemListElement.map((c: any) => c.position), [1, 2]);
  assert.doesNotMatch(JSON.stringify(list), /ratingValue|reviewCount|numberOfItems|interactionCount/);

  const cat = buildBlogListJsonLd({ name: "عمالي", description: "d", path: "/blog/category/labor", categoryLabel: "عمالي" }) as { "@graph": any[] };
  const items = cat["@graph"][1].itemListElement;
  assert.equal(items.length, 3);
  assert.deepEqual(items[2], { "@type": "ListItem", position: 3, name: "عمالي", item: "https://nezamy.sa/blog/category/labor" });
});

test("the label cannot close the <script>: serializeJsonLd escapes <", () => {
  const out = serializeJsonLd(buildBlogListJsonLd({ name: "</script><b>", description: "", path: "/blog" }));
  assert.doesNotMatch(out, /<\/script>/);
});
