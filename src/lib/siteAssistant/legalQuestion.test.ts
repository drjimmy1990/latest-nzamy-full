/**
 * legalQuestion.test.ts — owner Q181 (ب, batch l13): the individual's free
 * legal questions in «مساعد نظامي». The money side (never charged, the
 * count under the lock) is proved in src/lib/ai/freeQuestion.test.ts and in
 * Docker (supabase/tests/rls/l13_assistant.test.sql); this file pins what
 * the window decides and says.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/siteAssistant/legalQuestion.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FLOATING_PAID_LINKS,
  FREE_STATUS_URL,
  LEGAL_COPY,
  answerSources,
  canSendAsLegal,
  floatingRefusalText,
  legalDecision,
  parseFreeStatus,
} from "./legalQuestion.ts";
import { FREE_QUESTION_COPY } from "../ai/freeQuestion.ts";
import { answerMessage, classify } from "./answer.ts";
import { AI_TOOLS } from "../ai/tools.ts";
import { buildPriceFeed } from "./feed.ts";

test("the status: the server's count only; none, malformed or impossible → null", () => {
  assert.deepEqual(parseFreeStatus({ available: true, left: 3, total: 5 }), { available: true, left: 3, total: 5 });
  assert.deepEqual(parseFreeStatus({ available: false, left: 0, total: 5 }), { available: false, left: 0, total: 5 });
  assert.deepEqual(parseFreeStatus({ available: true, left: 0, total: 5 }), { available: false, left: 0, total: 5 }, "0 left is never available");
  for (const bad of [null, undefined, "x", [], { available: false, left: 0, total: 0 }, { left: 6, total: 5 }, { left: -1, total: 5 }, { left: 1.5, total: 5 }, { left: "2", total: 5 }]) {
    assert.equal(parseFreeStatus(bad), null, JSON.stringify(bad));
  }
  assert.equal(FREE_STATUS_URL, "/api/v1/ai/free-question?tool=floating");
});

test("the decision: offer while some are left, the honest end after the last, today's reply otherwise", () => {
  const some = { available: true, left: 2, total: 5 };
  const none = { available: false, left: 0, total: 5 };
  assert.equal(legalDecision("legal_advice", some), "offer");
  assert.equal(legalDecision("legal_advice", none), "used");
  assert.equal(legalDecision("legal_advice", null), "keep", "a guest, a lawyer, an unverified e-mail: today's refusal");
  for (const intent of ["prices", "fallback", "greeting", "library_text", undefined]) {
    assert.equal(legalDecision(intent, some), "keep", String(intent));
  }
  assert.equal(canSendAsLegal("fallback", some, "سؤال عن عقد العمل"), true);
  assert.equal(canSendAsLegal("fallback", some, "مرحبا"), false, "under eight characters");
  assert.equal(canSendAsLegal("fallback", none, "سؤال عن عقد العمل"), false);
  assert.equal(canSendAsLegal("prices", some, "سؤال عن عقد العمل"), false);
});

test("the answerer still reads a legal question as legal_advice and refuses it for everyone else", () => {
  const q = "هل يحق لصاحب العمل فصلي دون إنذار؟";
  assert.equal(classify(q).intent, "legal_advice");
  const reply = answerMessage(q, { prices: buildPriceFeed(new Date("2026-11-20T09:00:00Z")), saleOpen: false, offers: null, founder: null, libraryOpenTo: null });
  assert.equal(reply.intent, "legal_advice");
  assert.match(reply.text, /لا أقدّم رأياً أو استشارة قانونية/);
});

test("the words: the owner's count line, an offer before anything is spent, the paid ways after", () => {
  assert.equal(FREE_QUESTION_COPY.floatingLeft(4, 5), "بقي لك ٤ من ٥ أسئلة مجانية");
  assert.deepEqual(FLOATING_PAID_LINKS.map((l) => l.href), ["/ai/quick-answer", "/services"]);
  assert.equal(floatingRefusalText("free_questions_none"), FREE_QUESTION_COPY.floatingNone);
  for (const code of ["no_sources", "ungrounded", "tool_failed", "timeout", "unavailable"]) {
    assert.match(floatingRefusalText(code) ?? "", /لم يُحسب عليك السؤال/, code);
  }
  assert.equal(floatingRefusalText("tool_off"), null, "the server's own message");
  for (const t of [...(Object.values(LEGAL_COPY) as unknown[]).filter((v): v is string => typeof v === "string"), LEGAL_COPY.subtitleFree(1, 5)]) {
    assert.doesNotMatch(t, /[A-Za-z]/, t);
  }
});

test("sources: same-site links only, deduplicated, at most five", () => {
  const cites = [
    { sid: "S1", title: "نظام العمل — المادة ٧٧", url: "/laws/labor-law#a77" },
    { sid: "S2", title: "مكرر", url: "/laws/labor-law#a77" },
    { sid: "S3", title: "خارجي", url: "https://evil.example/x" },
    { sid: "S4", title: "بروتوكول", url: "//evil.example" },
    { sid: "S5", title: "", url: "/laws/x" },
    ...Array.from({ length: 6 }, (_, i) => ({ sid: `T${i}`, title: `مادة ${i}`, url: `/laws/y#${i}` })),
  ];
  const out = answerSources(cites);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0], { label: "نظام العمل — المادة ٧٧", href: "/laws/labor-law#a77" });
  assert.ok(out.every((l) => l.href.startsWith("/") && !l.href.startsWith("//")));
  assert.deepEqual(answerSources(null), []);
});

test("source contract: the window asks the floating tool, renders text only, and offers before spending", () => {
  const w = readFileSync("src/components/chatbot/SiteAssistantWidget.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.match(w, /await runClient\.start\(FLOATING_TOOL, \{ question: question\.trim\(\) \}\)/);
  assert.match(w, /ask: \{ question: message, label: FREE_QUESTION_COPY\.floatingAsk \}/, "an offer, never an automatic spend");
  assert.match(w, /if \(open && freeRef\.current === null\) void refreshFree\(\);/, "the count is read when the window opens, not on page load");
  assert.match(w, /stripCitationMarkers\(answer\)/);
  assert.doesNotMatch(w, /dangerouslySetInnerHTML/);
  assert.equal(AI_TOOLS.floating.price({}, { pages: null }), 0);
  // the chatbot route itself still calls no model
  const route = readFileSync("src/app/api/v1/chatbot/route.ts", "utf8");
  assert.match(route, /intent: reply\.intent/);
  assert.doesNotMatch(route, /n8n|fetch\(|ai\/runs/);
});
