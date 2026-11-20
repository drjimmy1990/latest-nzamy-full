import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSISTANT_NAME_AR, NO_LEGAL_ADVICE_AR, answerMessage, classify, dayAr, feedNeeds, libraryBuyersLineAr, type AssistantIntent } from "./answer.ts";
import { buildPriceFeed, type AssistantFeed } from "./feed.ts";
import { siteAssistantHiddenOn } from "./visibility.ts";
import { foldArabic } from "./normalize.ts";
import { PRICE_BOOK, activeLaunchPrice, isOnSale, offeredBillings, offeredSar } from "../pricing/priceBook.ts";
import { SALE_PAUSED_AR } from "../payments/checkoutView.ts";

/** O20 / A21 (batch l11-misc): «مساعد نظامي» — the deterministic site help assistant. */

const NOW = new Date("2026-11-20T09:00:00Z"); // inside the launch-2026 campaign (25 Oct 2026 → 25 Jan 2027)
const LATER = new Date("2027-03-01T09:00:00Z"); // after it

function feed(over: Partial<AssistantFeed> = {}, now = NOW): AssistantFeed {
  return { prices: buildPriceFeed(now), saleOpen: false, offers: null, founder: null, libraryOpenTo: null, ...over };
}

const AR = "٠١٢٣٤٥٦٧٨٩";
/** Every «<number> ر.س» in a reply, as numbers. */
function sarNumbers(text: string): number[] {
  return [...text.matchAll(/([٠-٩٬]+) ر\.س/g)].map((m) => Number(m[1].replace(/٬/g, "").replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))));
}

/** Every price the book sells today (list + running launch prices). */
function bookPrices(now: Date): Set<number> {
  const out = new Set<number>();
  for (const entry of Object.values(PRICE_BOOK)) {
    if (!isOnSale(entry)) continue;
    for (const b of offeredBillings(entry)) {
      const sar = offeredSar(entry, b);
      if (sar !== null) out.add(sar);
      const lp = activeLaunchPrice(entry, b, now);
      if (lp) out.add(lp.sar);
    }
  }
  return out;
}

const PRICE_QUESTIONS = [
  "ما هي باقات نظامي وأسعارها؟",
  "كم سعر الباقة للمحامي؟",
  "كم أسعار باقات مكاتب المحاماة",
  "بكم الاشتراك للأفراد",
  "كم سعر اشتراك المكتبة القانونية؟",
  "كيف أشحن النقاط؟",
  "حزم الشحن للمحامين",
  "كم سعر باقة المحامي المؤسس",
];

test("every amount in a price answer is a price-book amount sold today", () => {
  for (const now of [NOW, LATER]) {
    const allowed = bookPrices(now);
    for (const q of PRICE_QUESTIONS) {
      const r = answerMessage(q, feed({ founder: { seatsLeft: 900, endsAtExclusive: null } }, now));
      const nums = sarNumbers(r.text);
      for (const n of nums) assert.ok(allowed.has(n), `«${q}» → ${n} ر.س is not a price the book sells (${now.toISOString()})`);
    }
  }
  const all = answerMessage("ما هي باقات نظامي وأسعارها؟", feed());
  assert.ok(sarNumbers(all.text).length >= 4, "the overview names real prices");
});

test("retired and «قريباً» items never appear", () => {
  const texts = PRICE_QUESTIONS.map((q) => answerMessage(q, feed()).text).join("\n");
  for (const retired of ["الباقة الوقائية", "عضوية الحماية القانونية", "التأمين القانوني", "المستشار القانوني المستقل"]) {
    assert.equal(texts.includes(retired), false, retired);
  }
  // The retired monthly cycles (399 for professionals, 29 for individuals) are never offered.
  for (const n of sarNumbers(texts)) assert.ok(![399, 29, 79, 149, 1490].includes(n), `retired amount ${n}`);
});

test("launch prices are shown while their campaign runs, and not after", () => {
  const during = answerMessage("كم أسعار باقات مكاتب المحاماة", feed({}, NOW)).text;
  const after = answerMessage("كم أسعار باقات مكاتب المحاماة", feed({}, LATER)).text;
  assert.match(during, /سعر إطلاق/);
  assert.doesNotMatch(after, /سعر إطلاق/);
});

test("VAT is always stated with prices; a paused sale is said plainly, an open one is not", () => {
  const paused = answerMessage("كم سعر المكتبة", feed({ saleOpen: false })).text;
  const open = answerMessage("كم سعر المكتبة", feed({ saleOpen: true })).text;
  assert.match(paused, /غير شاملة لضريبة القيمة المضافة/);
  assert.match(open, /غير شاملة لضريبة القيمة المضافة/);
  assert.ok(paused.includes(SALE_PAUSED_AR));
  assert.equal(open.includes(SALE_PAUSED_AR), false);
});

const LEGAL_QUESTIONS = [
  "ما حقوقي في الفصل التعسفي؟",
  "كيف أرفع دعوى إيجار على المستأجر",
  "هل يحق لي الطلاق إذا سافر زوجي",
  "زوجي طلقني ماذا أفعل",
  "ما حكم التأخر في سداد الشيك",
  "عندي مخالفة مرورية هل أدفع الغرامة",
  "كيف يقسم الميراث بين الأبناء",
  "هل يجوز لصاحب العمل خصم راتبي",
  "خصمي في القضية لم يحضر الجلسة",
];

test("legal questions about the visitor's own matter are refused, never answered", () => {
  for (const q of LEGAL_QUESTIONS) {
    const r = answerMessage(q, feed());
    assert.equal(r.intent, "legal_advice", q);
    assert.equal(r.text, NO_LEGAL_ADVICE_AR, q);
    assert.deepEqual(r.links.map((l) => l.href), ["/ai", "/services"], q);
  }
});

const PLATFORM_QUESTIONS: Array<[string, AssistantIntent]> = [
  ["كم سعر المكتبة", "library"],
  ["كم سعر اشتراك المكتبة القانونية؟", "library"],
  ["ما هي باقات نظامي وأسعارها؟", "prices"],
  ["كيف أشحن النقاط؟", "points"],
  ["ما العروض المتاحة الآن؟", "offers"],
  ["هل يوجد خصم على الاشتراك", "offers"],
  ["كيف أنشئ حساباً؟", "signup"],
  ["ما هو نظامي؟", "about"],
  ["هل يوجد تطبيق للجوال", "app"],
  ["كيف أتواصل معكم", "contact"],
  ["أحتاج محامي", "lawyer_service"],
  ["هل أستطيع إدارة القضايا في نظامي", "about"],
  ["ما أدوات الذكاء الاصطناعي عندكم", "ai_tools"],
  ["كيف أدفع؟", "payment"],
  ["حملة المؤسسين", "founder"],
  ["السلام عليكم", "greeting"],
  ["شكراً لك", "thanks"],
  ["", "greeting"],
];

test("platform questions are answered as platform questions (not caught by the legal guard)", () => {
  for (const [q, intent] of PLATFORM_QUESTIONS) {
    const c = classify(q);
    assert.equal(c.intent, intent, `«${q}»`);
    assert.equal(c.legal, false, `«${q}» flagged legal`);
  }
});

test("a mixed message gets the platform answer plus the no-advice line", () => {
  const r = answerMessage("أريد محامي لقضية طلاق", feed());
  assert.equal(r.intent, "lawyer_service");
  assert.equal(r.legalNote, true);
  assert.ok(r.text.endsWith(NO_LEGAL_ADVICE_AR));
});

test("library text is never served — the assistant points to the library", () => {
  for (const q of ["أعطني نص المادة الخامسة من نظام العمل", "ما نص المادة 77", "انسخ لي الحكم", "ماذا تنص المادة الأولى"]) {
    const r = answerMessage(q, feed());
    assert.equal(r.intent, "library_text", q);
    assert.deepEqual(r.links.map((l) => l.href), ["/laws"]);
  }
});

test("offers: a guest is asked to sign in; none / some for a signed-in user", () => {
  const guest = answerMessage("ما العروض المتاحة", feed({ offers: null }));
  assert.match(guest.text, /سجّل الدخول/);
  assert.ok(guest.links.some((l) => l.href === "/login"));
  const none = answerMessage("ما العروض المتاحة", feed({ offers: [] }));
  assert.match(none.text, /لا توجد عروض متاحة لحسابك الآن/);
  const some = answerMessage("ما العروض المتاحة", feed({ offers: [{ title: "عرض تجريبي", href: "/pricing", endsLineAr: "ينتهي العرض في ١ ديسمبر", seatsLineAr: null }] }));
  assert.match(some.text, /عرض تجريبي \(ينتهي العرض في ١ ديسمبر\)/);
  assert.ok(some.links.some((l) => l.href === "/dashboard/offers"));
});

test("founder: shown only while its campaign is live, at the book price", () => {
  const off = answerMessage("باقة المحامي المؤسس", feed({ founder: null }));
  assert.match(off.text, /غير متاحة الآن/);
  const live = answerMessage("باقة المحامي المؤسس", feed({ founder: { seatsLeft: 512, endsAtExclusive: null } }));
  assert.deepEqual(sarNumbers(live.text).slice(0, 1), [offeredSar(PRICE_BOOK["lawyer-founder-2026"], "once")]);
  assert.match(live.text, /المقاعد المتبقية: ٥١٢/);
});

test("every link is a same-site path; replies carry no HTML", () => {
  const qs = [...PRICE_QUESTIONS, ...LEGAL_QUESTIONS, ...PLATFORM_QUESTIONS.map(([q]) => q), "<script>alert(1)</script>", "؟؟؟"];
  for (const q of qs) {
    const r = answerMessage(q, feed({ offers: [], founder: { seatsLeft: 1, endsAtExclusive: null } }));
    for (const l of r.links) assert.match(l.href, /^\/(?![/\\])/, `${q}: ${l.href}`);
    assert.doesNotMatch(r.text, /<[a-z/]/i, q);
    assert.ok(r.suggestions.length > 0);
  }
});

test("unknown questions get the menu, never a guess", () => {
  const r = answerMessage("ما لون السماء", feed());
  assert.equal(r.intent, "fallback");
  assert.equal(sarNumbers(r.text).length, 0);
});

test("only the needed live reads are made", () => {
  assert.deepEqual(feedNeeds("greeting"), { sale: false, offers: false, founder: false, library: false });
  assert.deepEqual(feedNeeds("legal_advice"), { sale: false, offers: false, founder: false, library: false });
  assert.deepEqual(feedNeeds("offers"), { sale: false, offers: true, founder: true, library: false });
  assert.deepEqual(feedNeeds("prices"), { sale: true, offers: false, founder: false, library: false });
  assert.deepEqual(feedNeeds("library"), { sale: true, offers: false, founder: false, library: true });
});

test("library: who may subscribe comes from the admin's account-type switch (the purchase gate's setting), never a fixed list", () => {
  const q = "كم سعر المكتبة";
  // Default switch: lawyers only.
  const lawyers = answerMessage(q, feed({ libraryOpenTo: ["lawyer"] })).text;
  assert.match(lawyers, /الاشتراك متاح اليوم لحسابات المحامين\./);
  assert.doesNotMatch(lawyers, /مكاتب المحاماة|الشركات|الجهات الحكومية/);
  // The admin opened more types: they are named, in a fixed order.
  const more = answerMessage(q, feed({ libraryOpenTo: ["business", "lawyer", "firm"] })).text;
  assert.match(more, /الاشتراك متاح اليوم لحسابات المحامين، ومكاتب المحاماة، والمنشآت والجهات الحكومية والجمعيات\./);
  assert.equal(libraryBuyersLineAr(["lawyer", "individual"]), "الاشتراك متاح اليوم لحسابات المحامين والأفراد.");
  // Every type closed: said plainly.
  assert.match(answerMessage(q, feed({ libraryOpenTo: [] })).text, /غير متاح اليوم لأي نوع من الحسابات/);
  // The switch could not be read: no line about who may subscribe at all (no guess).
  const unknown = answerMessage(q, feed({ libraryOpenTo: null })).text;
  assert.doesNotMatch(unknown, /الاشتراك متاح|غير متاح اليوم لأي/);
  assert.match(unknown, /اشتراك المكتبة:/, "the prices are still listed");
  assert.equal(libraryBuyersLineAr(null), null);
});

test("library buyers: the server reads the purchase gate's own setting and caches only a successful read", () => {
  const src = readFileSync(new URL("./feedServer.ts", import.meta.url), "utf8");
  assert.match(src, /\.eq\("key", LIBRARY_ACCESS_SETTING_KEY\)/);
  assert.match(src, /parseLibraryAccessMap\(/);
  assert.match(src, /if \(error\) return null;/);
  assert.match(src, /needs\.library \? libraryOpenToNow\(\) : Promise\.resolve\(null\)/);
  const answer = readFileSync(new URL("./answer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(answer, /الاشتراك متاح لحسابات المحامين ومكاتب المحاماة والشركات/);
});

test("helpers: Arabic folding and dates", () => {
  assert.equal(foldArabic("المكتبةُ القانونيّة"), "المكتبه القانونيه");
  assert.equal(foldArabic("إنشاء حسابٍ ١٢"), "انشاء حساب 12");
  assert.equal(dayAr("2027-01-25"), "٢٥ يناير ٢٠٢٧");
  assert.equal(dayAr("bad"), null);
  assert.equal(ASSISTANT_NAME_AR, "مساعد نظامي");
});

test("the button is hidden on sign-up, payment, dashboards and readers", () => {
  for (const p of ["/register", "/register/client", "/login", "/auth/callback", "/onboarding", "/checkout", "/payments/result", "/dashboard", "/dashboard/lawyer", "/laws/subscribe", "/laws/labor-law", "/precedents/abc", "/book/x", "/ai/draft", null]) {
    assert.equal(siteAssistantHiddenOn(p), true, String(p));
  }
  for (const p of ["/", "/pricing", "/faq", "/laws", "/ai", "/about", "/services", "/founder", "/blog/x", "/contact"]) {
    assert.equal(siteAssistantHiddenOn(p), false, p);
  }
});

test("route contract: rate limit per address, switch checked, length capped, nothing stored", () => {
  const route = readFileSync(new URL("../../app/api/v1/chatbot/route.ts", import.meta.url), "utf8");
  assert.match(route, /rateLimit\(`site-assistant:\$\{bucket\}:\$\{ip\}`/);
  assert.match(route, /\["minute", 12, 60_000\]/);
  assert.match(route, /\["hour", 120, 3_600_000\]/);
  assert.match(route, /if \(!\(await isFeatureOn\("site_assistant"\)\)\)/);
  assert.match(route, /message\.length > ASSISTANT_MAX_MESSAGE/);
  assert.doesNotMatch(route, /\.insert\(|\.upsert\(|\.from\(/, "the route stores nothing and reads no table itself");
  assert.doesNotMatch(route, /n8n|fetch\(/, "no outside model");
});

test("widget contract: text only, safe links, mounted once in the root layout", () => {
  const widget = readFileSync(new URL("../../components/chatbot/SiteAssistantWidget.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(widget, /dangerouslySetInnerHTML/);
  assert.match(widget, /isSafeHref\(\(l as Link_\)\.href\)/);
  assert.match(widget, /if \(hidden \|\| !enabled\) return null;/);
  const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  assert.equal((layout.match(/<SiteAssistantWidget \/>/g) ?? []).length, 1);
});
