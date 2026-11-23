/**
 * journal.test.ts — «المجلة التشريعية» phase 1 (owner Q190–Q195, batch l13).
 * The pure rules executed (journal.ts, journalRender.ts, journalSend.ts) and
 * the route wiring pinned in the source (the routes import next/server and
 * cannot run under node --test). RLS: supabase/tests/rls/legislative_journal.test.sql.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JOURNAL_BADGES,
  JOURNAL_FLAG,
  cleanSourceUrl,
  entriesForIssue,
  impactLinesFrom,
  isIsoDay,
  issueIsPublic,
  issuePaths,
  issuePeriodFor,
  issueTitleAr,
  parseEntryInput,
  pdfConfigured,
  periodFromMonthInput,
  periodLabelAr,
  riyadhToday,
  shapeEntryForViewer,
  shiftMonthStart,
  type JournalEntryRow,
} from "./journal.ts";
import { EMAIL_TITLES_MAX, NEWSLETTER_FOOTER_AR, issueEmailKey, issueEmailMessage, renderIssueHtml } from "./journalRender.ts";
import { planIssueBatch, sendLogStatus } from "./journalSend.ts";
import { FEATURE_FLAGS, defaultFeatureFlags } from "../featureFlags/featureFlags.ts";

const SRC = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const row = (over: Partial<JournalEntryRow> = {}): JournalEntryRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  title: "تعديل نظام العمل",
  published_on: "2026-11-10",
  issuing_body: "مجلس الوزراء",
  source_url: "https://example.org/decision",
  impact_lines: ["يرفع مدة الإشعار", "يسري على العقود القائمة"],
  badge: "amended",
  effective_on: "2027-01-01",
  status: "approved",
  ...over,
});

// ── switch ───────────────────────────────────────────────────────────────────

test("the switch is the closed-list flag legislative_journal_enabled, default OFF", () => {
  assert.equal(JOURNAL_FLAG, "legislative_journal_enabled");
  assert.ok(Object.hasOwn(FEATURE_FLAGS, JOURNAL_FLAG));
  assert.equal(defaultFeatureFlags()[JOURNAL_FLAG], false);
});

// ── Q190 ب: who sees what ───────────────────────────────────────────────────

test("a visitor gets the title and the date ONLY — the other keys are absent, not empty", () => {
  const v = shapeEntryForViewer(row(), "visitor");
  assert.deepEqual(v, { id: row().id, title: "تعديل نظام العمل", publishedOn: "2026-11-10" });
  for (const k of ["badge", "effectiveOn", "impactLines", "issuingBody", "sourceUrl"]) {
    assert.equal(Object.hasOwn(v!, k), false, k);
  }
  assert.equal(JSON.stringify(v).includes("يرفع مدة الإشعار"), false);
});

test("a subscriber gets the badge, the effective date, the impact, the body and the link", () => {
  const s = shapeEntryForViewer(row(), "subscriber")!;
  assert.equal(s.badge, "amended");
  assert.equal(s.effectiveOn, "2027-01-01");
  assert.deepEqual(s.impactLines, ["يرفع مدة الإشعار", "يسري على العقود القائمة"]);
  assert.equal(s.issuingBody, "مجلس الوزراء");
  assert.equal(s.sourceUrl, "https://example.org/decision");
});

test("a draft is never shaped, for anyone; a bad stored link or badge is dropped", () => {
  assert.equal(shapeEntryForViewer(row({ status: "draft" }), "subscriber"), null);
  assert.equal(shapeEntryForViewer(row({ status: "draft" }), "visitor"), null);
  const s = shapeEntryForViewer(row({ source_url: "javascript:alert(1)", badge: "hot" as never }), "subscriber")!;
  assert.equal(s.sourceUrl, null);
  assert.equal(s.badge, null);
});

test("the two badges are «معدّل» and «سريان وشيك»", () => {
  assert.deepEqual(JOURNAL_BADGES, { amended: "معدّل", imminent_effect: "سريان وشيك" });
});

// ── the admin form ───────────────────────────────────────────────────────────

test("parseEntryInput: a full entry is cleaned (spaces, empty lines, empty optional fields)", () => {
  const r = parseEntryInput({
    title: "  تعديل   نظام  ",
    published_on: "2026-11-10",
    issuing_body: "",
    source_url: "",
    impact_lines: "سطر أول\n\n  سطر   ثانٍ \r\n",
    badge: "",
    effective_on: "",
  });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value, {
    title: "تعديل نظام",
    published_on: "2026-11-10",
    issuing_body: null,
    source_url: null,
    impact_lines: ["سطر أول", "سطر ثانٍ"],
    badge: null,
    effective_on: null,
  });
});

test("parseEntryInput refuses what the database would refuse, in plain Arabic", () => {
  const base = { title: "خبر صالح", published_on: "2026-11-10" };
  const bad = (over: Record<string, unknown>) => {
    const r = parseEntryInput({ ...base, ...over });
    assert.equal(r.ok, false, JSON.stringify(over));
    return r.ok ? "" : r.error;
  };
  assert.match(bad({ title: "اب" }), /عنوان/);
  assert.match(bad({ title: "ا".repeat(301) }), /أطول/);
  assert.match(bad({ published_on: "2026-02-31" }), /تاريخ/);
  assert.match(bad({ source_url: "javascript:alert(1)" }), /الرابط/);
  assert.match(bad({ source_url: "https://a b.com" }), /الرابط/);
  assert.match(bad({ impact_lines: Array.from({ length: 11 }, (_, i) => `سطر ${i}`) }), /سطور الأثر/);
  assert.match(bad({ impact_lines: ["ا".repeat(501)] }), /سطر أثر/);
  assert.match(bad({ badge: "hot" }), /الشارة/);
  assert.match(bad({ effective_on: "غداً" }), /النفاذ/);
  assert.equal(parseEntryInput(null).ok, false);
  assert.equal(parseEntryInput([1]).ok, false);
});

test("parseEntryInput partial (an edit): only the fields sent", () => {
  const r = parseEntryInput({ badge: "imminent_effect" }, true);
  assert.deepEqual(r.ok && r.value, { badge: "imminent_effect" });
  assert.deepEqual(parseEntryInput({}, true), { ok: true, value: {} });
});

test("dates and links helpers", () => {
  assert.equal(isIsoDay("2028-02-29"), true);
  assert.equal(isIsoDay("2027-02-29"), false);
  assert.equal(isIsoDay("2026-1-1"), false);
  assert.equal(cleanSourceUrl(" http://x.sa/a "), "http://x.sa/a");
  assert.equal(cleanSourceUrl("ftp://x.sa"), null);
  assert.equal(cleanSourceUrl("data:text/html,x"), null);
  assert.deepEqual(impactLinesFrom(["  أ ", 3, "", "ب"]), ["أ", "ب"]);
});

// ── months (Q192: the 1st of each Gregorian month, Riyadh date) ──────────────

test("the issue built on the 1st covers the previous month — by the RIYADH date, not UTC", () => {
  // 30 Nov 21:30 UTC is already 1 Dec 00:30 in Riyadh → the November issue.
  assert.equal(riyadhToday(new Date("2026-11-30T21:30:00Z")), "2026-12-01");
  assert.equal(issuePeriodFor(new Date("2026-11-30T21:30:00Z")), "2026-11-01");
  // 30 Nov 20:59 UTC is still 30 Nov in Riyadh → the October issue.
  assert.equal(issuePeriodFor(new Date("2026-11-30T20:59:00Z")), "2026-10-01");
  // January → December of the year before.
  assert.equal(issuePeriodFor(new Date("2027-01-01T06:00:00Z")), "2026-12-01");
  assert.equal(shiftMonthStart("2026-12-01", 1), "2027-01-01");
});

test("month labels and the issue title", () => {
  assert.equal(periodLabelAr("2026-11-01"), "نوفمبر ٢٠٢٦ م");
  assert.equal(issueTitleAr("2026-11-01"), "مجلة نظامي التشريعية — عدد نوفمبر ٢٠٢٦ م");
  assert.equal(periodFromMonthInput("2026-11"), "2026-11-01");
  assert.equal(periodFromMonthInput("2026-13"), null);
  assert.equal(periodFromMonthInput("2026-11-05"), null);
});

test("an issue takes approved entries not in another issue, dated before the next month — late approvals ride the next issue", () => {
  const rows = [
    { id: "a", status: "approved" as const, published_on: "2026-11-20" },
    { id: "b", status: "approved" as const, published_on: "2026-10-03" }, // approved late for October
    { id: "c", status: "draft" as const, published_on: "2026-11-05" },
    { id: "d", status: "approved" as const, published_on: "2026-12-01" }, // next month
    { id: "e", status: "approved" as const, published_on: "2026-11-02" }, // already in an issue
  ];
  const picked = entriesForIssue(rows, "2026-11-01", new Set(["e"]));
  assert.deepEqual(picked.map((r) => r.id), ["b", "a"], "oldest first");
});

test("only an approved (or sending / sent) issue is public; drafts are admin previews", () => {
  assert.equal(issueIsPublic({ status: "draft" }), false);
  for (const s of ["approved", "sending", "sent"] as const) assert.equal(issueIsPublic({ status: s }), true);
  assert.equal(issueIsPublic(null), false);
});

test("PDF needs CHROMIUM_PATH; the paths are fixed", () => {
  assert.equal(pdfConfigured({}), false);
  assert.equal(pdfConfigured({ CHROMIUM_PATH: "  " }), false);
  assert.equal(pdfConfigured({ CHROMIUM_PATH: "/usr/bin/chromium" }), true);
  assert.deepEqual(issuePaths("abc"), { page: "/journal/issues/abc", pdf: "/api/v1/journal/issues/abc/pdf" });
});

// ── the print page / PDF source ──────────────────────────────────────────────

test("the visitor's issue page carries titles and dates only; the subscriber's the rest", () => {
  const entries = [row()];
  const visitor = renderIssueHtml({
    title: "عدد", periodMonth: "2026-11-01", viewer: "visitor",
    entries: entries.map((r) => shapeEntryForViewer(r, "visitor")!),
  });
  assert.ok(visitor.includes("تعديل نظام العمل"));
  for (const hidden of ["يرفع مدة الإشعار", "مجلس الوزراء", "example.org", "معدّل", "تاريخ النفاذ"]) {
    assert.equal(visitor.includes(hidden), false, hidden);
  }
  const sub = renderIssueHtml({
    title: "عدد", periodMonth: "2026-11-01", viewer: "subscriber",
    entries: entries.map((r) => shapeEntryForViewer(r, "subscriber")!),
  });
  for (const shown of ["يرفع مدة الإشعار", "مجلس الوزراء", "https://example.org/decision", "معدّل", "تاريخ النفاذ"]) {
    assert.ok(sub.includes(shown), shown);
  }
});

test("the issue page escapes everything and loads nothing: no script, no remote resource", () => {
  const html = renderIssueHtml({
    title: "<script>x</script>", periodMonth: "2026-11-01", viewer: "subscriber",
    entries: [shapeEntryForViewer(row({ title: '"><img src=x onerror=alert(1)>', impact_lines: ["<b>x</b>"] }), "subscriber")!],
  });
  assert.equal(/<script/i.test(html), false);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<b>x</b>"), false);
  assert.equal(/<link\b|@import|url\(/i.test(html), false, "no remote stylesheet, font or image");
  assert.ok(html.includes('lang="ar" dir="rtl"'));
  assert.ok(html.includes("@page{size:A4"));
});

test("the page offers the PDF when the server can make one, else the browser's own save", () => {
  const base = { title: "عدد", periodMonth: "2026-11-01", viewer: "visitor" as const, entries: [] };
  assert.ok(renderIssueHtml({ ...base, pdfHref: "/api/v1/journal/issues/x/pdf" }).includes("تنزيل العدد بصيغة PDF"));
  assert.ok(renderIssueHtml(base).includes("أمر الطباعة في متصفحك"));
  assert.equal(renderIssueHtml({ ...base, forPdf: true }).includes("أمر الطباعة"), false);
  assert.ok(renderIssueHtml({ ...base, preview: true }).includes("لم يُعتمد بعد"));
});

// ── the e-mail (Q191 أ) ──────────────────────────────────────────────────────

test("the issue e-mail: the visitor view only, the PDF link when there is one, else the page link, and how to stop it", () => {
  const entries = [shapeEntryForViewer(row(), "visitor")!];
  const withPdf = issueEmailMessage({
    title: issueTitleAr("2026-11-01"), periodMonth: "2026-11-01", entries,
    pageHref: "https://site.example/journal/issues/x", pdfHref: "https://site.example/api/v1/journal/issues/x/pdf",
  });
  assert.equal(withPdf.subject, "مجلة نظامي التشريعية — عدد نوفمبر ٢٠٢٦ م");
  assert.ok(withPdf.text.includes("تنزيل العدد (PDF): https://site.example/api/v1/journal/issues/x/pdf"));
  assert.ok(withPdf.text.includes("تعديل نظام العمل"));
  assert.equal(withPdf.text.includes("يرفع مدة الإشعار"), false, "no subscriber field in a mail every opted-in account gets");
  for (const line of NEWSLETTER_FOOTER_AR) assert.ok(withPdf.text.includes(line));

  const noPdf = issueEmailMessage({
    title: "عدد", periodMonth: "2026-11-01", entries,
    pageHref: "https://site.example/journal/issues/x", pdfHref: null,
  });
  assert.ok(noPdf.text.includes("قراءة العدد: https://site.example/journal/issues/x"));
  assert.equal(noPdf.text.includes("PDF"), false);
});

test("the e-mail lists at most 25 titles and counts the rest; the key is per issue and recipient", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `خبر ${i}`, publishedOn: "2026-11-10" }));
  const m = issueEmailMessage({ title: "عدد", periodMonth: "2026-11-01", entries: many, pageHref: null, pdfHref: null });
  assert.equal(EMAIL_TITLES_MAX, 25);
  assert.ok(m.text.includes("خبر 24"));
  assert.equal(m.text.includes("خبر 25:"), false);
  assert.ok(m.text.includes("عددها ٥"));
  assert.equal(issueEmailKey("i1", "u1"), "journal-issue:i1:u1");
});

// ── who gets it ──────────────────────────────────────────────────────────────

test("planIssueBatch: once per account, suspended and address-less skipped (and logged), capped", () => {
  const plan = planIssueBatch({
    optedIn: ["u1", "u2", "u3", "u4", "u1", "u5", "u6"],
    alreadyLogged: new Set(["u2"]),
    addresses: new Map([["u1", "a@x.sa"], ["u3", "c@x.sa"], ["u4", "not-an-address"], ["u5", "e@x.sa"], ["u6", "f@x.sa"]]),
    suspended: new Set(["u3"]),
    limit: 2,
  });
  assert.deepEqual(plan.send, [{ userId: "u1", email: "a@x.sa" }, { userId: "u5", email: "e@x.sa" }]);
  assert.deepEqual(plan.skip, [{ userId: "u3", reason: "suspended" }, { userId: "u4", reason: "no_address" }]);
  assert.equal(plan.blocked, false);
});

test("planIssueBatch fails closed when the suspension list could not be read", () => {
  const plan = planIssueBatch({ optedIn: ["u1"], alreadyLogged: new Set(), addresses: new Map([["u1", "a@x.sa"]]), suspended: null, limit: 5 });
  assert.deepEqual(plan, { send: [], skip: [], blocked: true });
});

test("sendLogStatus: sent / sunk kept, anything else failed with its code", () => {
  assert.deepEqual(sendLogStatus("sent"), { status: "sent", lastError: null });
  assert.deepEqual(sendLogStatus("sunk"), { status: "sunk", lastError: null });
  assert.deepEqual(sendLogStatus("failed"), { status: "failed", lastError: "failed" });
  assert.deepEqual(sendLogStatus("unavailable"), { status: "failed", lastError: "unavailable" });
});

// ── wiring pinned in the source ──────────────────────────────────────────────

test("the cron route: secret first (fails closed), switch next, then build and send approved issues only", () => {
  const src = read("app/api/v1/cron/journal-issue/route.ts");
  const post = src.slice(src.indexOf("export async function POST("));
  const secretAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
  assert.ok(secretAt > -1);
  assert.ok(post.indexOf("status: 401") > secretAt);
  assert.ok(post.indexOf("journalEnabled()") > post.indexOf("status: 401"));
  assert.ok(post.indexOf("createServiceClient(") > post.indexOf("journalEnabled()"));
  assert.ok(post.includes('.in("status", ["approved", "sending"])'), "only issues an admin approved are sent");
  assert.ok(post.includes("issuePeriodFor()"));
});

test("sendIssueBatch never sends a draft, needs the switch and e-mail, claims before sending, passes userIds", () => {
  const src = read("lib/journal/journalServer.ts");
  const fn = src.slice(src.indexOf("export async function sendIssueBatch("), src.indexOf("export interface SendCounts"));
  assert.ok(fn.indexOf("journalEnabled()") < fn.indexOf("loadIssue("));
  assert.ok(fn.includes("emailConfigured(process.env)"));
  assert.ok(fn.includes('issue.status !== "approved" && issue.status !== "sending"'));
  assert.ok(fn.includes('.eq("newsletter", true)'), "explicit opt-in only");
  const claimAt = fn.indexOf('{ onConflict: "issue_id,user_id", ignoreDuplicates: true }', fn.indexOf("for (const r of plan.send)"));
  const sendAt = fn.indexOf("await sendEmail(");
  assert.ok(claimAt > -1 && claimAt < sendAt, "claim the send-log row before the e-mail");
  assert.ok(fn.includes("userIds: [r.userId]"), "test accounts are sunk by sendEmail");
});

test("the issue page and the PDF are per viewer and never cached", () => {
  const page = read("app/journal/issues/[id]/route.ts");
  assert.ok(page.includes("issueViewFor(id, await currentUserId())"));
  assert.ok(page.includes('"Cache-Control": "private, no-store"'));
  const pdf = read("app/api/v1/journal/issues/[id]/pdf/route.ts");
  assert.ok(pdf.includes("issueViewFor(id, await currentUserId())"));
  assert.ok(pdf.includes('"Cache-Control": "private, no-store"'));
  assert.ok(pdf.includes("if (!pdfConfigured()) return NextResponse.redirect(pageUrl, 303);"), "honest fallback to the print page");
  const pub = read("app/journal/page.tsx");
  assert.ok(pub.includes('export const dynamic = "force-dynamic"'));
  assert.ok(pub.indexOf("journalEnabled()") < pub.indexOf("loadPublicJournal("), "switch off → nothing read");
});

test("the PDF: puppeteer-core loaded only when needed, JavaScript off, every network request refused", () => {
  const src = read("lib/journal/journalPdf.ts");
  assert.ok(src.includes('await import("puppeteer-core")'));
  assert.ok(src.indexOf("if (!pdfConfigured()) return null;") < src.indexOf("loadPuppeteer()", src.indexOf("export async function renderIssuePdf")));
  assert.ok(src.includes("setJavaScriptEnabled(false)"));
  assert.ok(src.includes("setRequestInterception(true)"));
  assert.ok(src.includes("void req.abort()"));
  assert.ok(src.includes("executablePath: (process.env.CHROMIUM_PATH"));
});

test("the public data is shaped on the server through shapeEntryForViewer, never raw rows", () => {
  const src = read("lib/journal/journalServer.ts");
  const fn = src.slice(src.indexOf("export async function loadPublicJournal("), src.indexOf("export interface IssueWithEntries"));
  assert.ok(fn.includes('.eq("status", "approved")'));
  assert.ok(fn.includes("shapeEntryForViewer(r, viewer)"));
  const view = read("app/journal/JournalView.tsx");
  assert.equal(view.includes("createServiceClient"), false);
});
