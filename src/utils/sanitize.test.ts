import assert from "node:assert/strict";
import test from "node:test";
import { markdownBoldToSafeHtml, safeHref, sanitizeHtml, sanitizeRichHtml } from "./sanitize.ts";

const LINK_STYLE = ' style="color:#C8A762;text-decoration:underline"';

/** Every `<` in `html` must open one of the allowed tag shapes. */
function assertOnlyTags(html: string, allowed: readonly RegExp[]): void {
  for (let i = html.indexOf("<"); i !== -1; i = html.indexOf("<", i + 1)) {
    const rest = html.slice(i);
    assert.ok(allowed.some((re) => re.test(rest)), `unexpected markup at ${i}: ${rest.slice(0, 60)}`);
  }
}

/** Quoted attribute values blanked, so only real attribute names remain. */
const withoutAttrValues = (html: string) => html.replace(/"[^"]*"/g, '""');

const INLINE_TAGS: readonly RegExp[] = [
  /^<\/?(?:strong|em)>/,
  /^<br>/,
  /^<\/a>/,
  /^<a>/,
  new RegExp(`^<a href="(?:#|https://|/(?![/\\\\&]))[^"<>]*"${LINK_STYLE}>`),
];
const RICH_TAGS: readonly RegExp[] = [
  /^<\/(?:h2|h3|p|ul|ol|li|strong|em)>/,
  /^<(?:h2|h3|p|ul|ol|li|strong|em)(?: class="[a-zA-Z0-9_:/\-[\].% ]+")?>/,
  /^<br>/,
];

/* ── Legitimate input keeps its output ─────────────────────────────────── */

test("inline: allowed tags pass, other tags are removed", () => {
  assert.equal(sanitizeHtml("<strong>نص</strong> و<em>مائل</em><br>"), "<strong>نص</strong> و<em>مائل</em><br>");
  assert.equal(sanitizeHtml("أ<br/>ب<br />ج</br>"), "أ<br>ب<br>ج");
  assert.equal(sanitizeHtml("< strong>x</ strong >"), "<strong>x</strong>");
  assert.equal(sanitizeHtml('<strong class="x" id="y">x</strong>'), "<strong>x</strong>");
  assert.equal(sanitizeHtml("<p>فقرة</p><span>نص</span><sup>1</sup>"), "فقرةنص1");
  assert.equal(sanitizeHtml("<STRONG>x</STRONG>"), "<strong>x</strong>");
});

test("inline: links keep their href and get the brand style", () => {
  assert.equal(sanitizeHtml('<a href="https://example.sa/x">r</a>'), `<a href="https://example.sa/x"${LINK_STYLE}>r</a>`);
  assert.equal(sanitizeHtml("<a href='/laws/abc'>r</a>"), `<a href="/laws/abc"${LINK_STYLE}>r</a>`);
  assert.equal(sanitizeHtml('<a href="#المادة-1">r</a>'), `<a href="#المادة-1"${LINK_STYLE}>r</a>`);
  assert.equal(sanitizeHtml("<a>bare</a>"), "<a>bare</a>");
  assert.equal(sanitizeHtml('<a title="t">no href</a>'), "<a>no href</a>");
});

test("inline: an ampersand in an href is written as an entity (same URL)", () => {
  assert.equal(sanitizeHtml('<a href="https://x.sa/?a=1&b=2">r</a>'), `<a href="https://x.sa/?a=1&amp;b=2"${LINK_STYLE}>r</a>`);
  assert.equal(sanitizeHtml('<a href="https://x.sa/?a=1&amp;b=2">r</a>'), `<a href="https://x.sa/?a=1&amp;b=2"${LINK_STYLE}>r</a>`);
});

test("text: entities and quotes are kept, stray angle brackets are escaped", () => {
  assert.equal(sanitizeHtml("شركة A&amp;B &nbsp; \"اقتباس\" 'و'"), "شركة A&amp;B &nbsp; \"اقتباس\" 'و'");
  assert.equal(sanitizeHtml("3 < 5 و 7 > 2"), "3 &lt; 5 و 7 &gt; 2");
  assert.equal(sanitizeHtml("< p>"), "&lt; p&gt;");
  assert.equal(sanitizeHtml("أ <!-- marker --> ب"), "أ  ب");
});

test("markdown: bold, italic, inline code and links on Arabic text", () => {
  assert.equal(markdownBoldToSafeHtml("**المادة الأولى:** يعمل بهذا النظام"), "<strong>المادة الأولى:</strong> يعمل بهذا النظام");
  assert.equal(markdownBoldToSafeHtml("نص *مائل* هنا"), "نص <em>مائل</em> هنا");
  assert.equal(markdownBoldToSafeHtml("الحالة `[ملغاة]`"), "الحالة [ملغاة]");
  assert.equal(
    markdownBoldToSafeHtml("انظر [الرابط](https://example.sa/عزل)"),
    `انظر <a href="https://example.sa/عزل"${LINK_STYLE}>الرابط</a>`,
  );
  assert.equal(markdownBoldToSafeHtml("[قسم](#قسم-٢)"), `<a href="#قسم-٢"${LINK_STYLE}>قسم</a>`);
  assert.equal(markdownBoldToSafeHtml(""), "");
});

test("rich: structural tags keep safe class names only", () => {
  assert.equal(
    sanitizeRichHtml('<h2 class="text-lg font-bold">ع</h2><p class="mb-2 md:mt-[3px]">ف</p><ul><li>١</li></ul><ol><li>٢</li></ol>'),
    '<h2 class="text-lg font-bold">ع</h2><p class="mb-2 md:mt-[3px]">ف</p><ul><li>١</li></ul><ol><li>٢</li></ol>',
  );
  assert.equal(sanitizeRichHtml('<p style="x" class="a b" onclick="y">t</p>'), '<p class="a b">t</p>');
  assert.equal(sanitizeRichHtml("<p>a<br/>b</p>"), "<p>a<br>b</p>");
  assert.equal(sanitizeRichHtml('<a href="https://x.sa">l</a><h1>t</h1><div>d</div>'), "ltd");
});

/* ── Hostile input ─────────────────────────────────────────────────────── */

const HOSTILE = [
  "<img src=x onerror=alert(1)>",
  "<<img>img src=x onerror=alert(1)>",
  "<<p>img src=x onerror=alert(1)>",
  "<<b>svg onload=alert(1)>",
  "<<<strong>>img src=x onerror=alert(1)>",
  "<scr<script>ipt>alert(1)</scr</script>ipt>",
  "<svg><script>alert(1)</script>",
  "<iframe src=javascript:alert(1)>",
  "<strong onmouseover=alert(1)>x</strong>",
  "<em style=\"background:url(javascript:alert(1))\">x</em>",
  "<br onload=alert(1)>",
  "<a href=\"javascript:alert(1)\">x</a>",
  "<a href=\"JaVaScRiPt:alert(1)\">x</a>",
  "<a href=\"&#106;avascript:alert(1)\">x</a>",
  "<a href=\"data:text/html,<script>alert(1)</script>\">x</a>",
  "<a href=\"vbscript:msgbox(1)\">x</a>",
  "<a href=\"/x\" onclick=\"alert(1)\">x</a>",
  "<a href=\"/x\"onclick=\"alert(1)\">x</a>",
  "<a href='/x\" onclick=\"alert(1)'>x</a>",
  "<a href=\"https://x.sa/\" \" onmouseover=\"alert(1)\">x</a>",
  "<a title=\"><img src=x onerror=alert(1)>\" href=\"/x\">x</a>",
  "<img alt=\">\" src=x onerror=alert(1)>",
  "<p <img src=x onerror=alert(1)>>",
  "<!--><img src=x onerror=alert(1)>-->",
  "<!-- <img src=x onerror=alert(1)>",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  "<a-b onclick=alert(1)>x</a-b>",
  "<strongx onclick=alert(1)>x</strongx>",
  "&lt;img src=x onerror=alert(1)&gt;",
  "\u0000<img src=x onerror=alert(1)>",
  "<div\nonclick=alert(1)>x</div>",
];

test("hostile inline input leaves only the allowed tags", () => {
  for (const s of HOSTILE) {
    const out = sanitizeHtml(s);
    assertOnlyTags(out, INLINE_TAGS);
    assert.doesNotMatch(withoutAttrValues(out), /<[a-z][^>]*\son[a-z]+\s*=/i, s);
    assert.doesNotMatch(out, /<(?:img|svg|script|iframe|style|math|p|div)\b/i, s);
  }
});

test("hostile rich input leaves only the allowed tags", () => {
  for (const s of HOSTILE) {
    const out = sanitizeRichHtml(s);
    assertOnlyTags(out, RICH_TAGS);
    assert.doesNotMatch(withoutAttrValues(out), /<[a-z][^>]*\son[a-z]+\s*=/i, s);
  }
});

test("hostile markdown input leaves only the allowed tags", () => {
  const md = [
    "**<<b>img src=x onerror=alert(1)>**",
    "[x](javascript:alert(1))",
    "[x](//evil.example/a)",
    "[x](/x\" onclick=\"alert(1))",
    "[x](https://x.sa/\"><img src=x onerror=alert(1)>)",
    "*<<i>svg onload=alert(1)>*",
  ];
  for (const s of md) assertOnlyTags(markdownBoldToSafeHtml(s), INLINE_TAGS);
  assert.equal(markdownBoldToSafeHtml("[x](javascript:void)"), "<a>x</a>");
  assert.equal(markdownBoldToSafeHtml("[x](//evil.example/a)"), "<a>x</a>");
});

test("split tags become visible text", () => {
  assert.equal(sanitizeHtml("<<img>img src=x>"), "&lt;img src=x&gt;");
  assert.equal(sanitizeRichHtml("<<b>img src=x>"), "&lt;img src=x&gt;");
  assert.equal(sanitizeRichHtml("<<p>img src=x>"), "&lt;<p>img src=x&gt;");
});

test("safeHref: the allowed forms", () => {
  assert.equal(safeHref("#a"), "#a");
  assert.equal(safeHref("https://x.sa/p?q=1"), "https://x.sa/p?q=1");
  assert.equal(safeHref("/laws/x"), "/laws/x");
  assert.equal(safeHref("/"), "/");
  assert.equal(safeHref("&#104;ttps://x.sa"), "https://x.sa");
  assert.equal(safeHref("https://x.sa/a&amp;b"), "https://x.sa/a&b");
});

test("safeHref: other schemes, other hosts and hidden characters are refused", () => {
  for (const h of [
    "", " ", "javascript:alert(1)", " javascript:alert(1)", "JAVASCRIPT:x", "&#106;avascript:x",
    "&#x6A;avascript:x", "data:text/html,x", "vbscript:x", "http://x.sa", "HTTPS://x.sa",
    "//evil.example", "/\\evil.example", "/&#47;evil.example", "/&#x2F;evil.example",
    "/&sol;evil.example", "/\t/evil.example", "/\n/evil.example", "\u0001/x", "/x\u0000y",
    "ftp://x", "mailto:a@b", "x", "?q",
  ]) assert.equal(safeHref(h), null, JSON.stringify(h));
});

test("random tag soup never produces markup outside the allowlist", () => {
  const parts = [
    "<", ">", "/", " ", "\"", "'", "=", "&", "#", ";", "<<", ">>", "</",
    "img", "a", "strong", "em", "br", "p", "h2", "li", "svg", "script",
    " src=x", " onerror=alert(1)", " href=", "\"/x\"", "'#y'", "\"https://x.sa\"", "javascript:",
    " class=\"a b\"", "<!--", "-->", "&#106;", "&lt;", "نص", "**", "*", "[t](", ")", "\n", "\t",
  ];
  let seed = 20261109;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let n = 0; n < 4000; n++) {
    let s = "";
    const len = 1 + (next() % 24);
    for (let k = 0; k < len; k++) s += parts[next() % parts.length];
    assertOnlyTags(sanitizeHtml(s), INLINE_TAGS);
    assertOnlyTags(sanitizeRichHtml(s), RICH_TAGS);
    assertOnlyTags(markdownBoldToSafeHtml(s), INLINE_TAGS);
  }
});
