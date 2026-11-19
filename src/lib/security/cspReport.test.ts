/**
 * Batch l9 — owner file 15 row 43: the report-only CSP finally reports its
 * violations somewhere, so «a week of clean reports» (register 24 / 71) can
 * start. It stays report-only.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/security/cspReport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CSP_REPORT_MAX_BYTES,
  CSP_REPORT_PATH,
  parseCspReports,
  sanitizeReportUrl,
  ViolationDeduper,
  violationKey,
} from "./cspReport.ts";

test("the old report-uri format", () => {
  const raw = JSON.stringify({
    "csp-report": {
      "document-uri": "https://nezamy.sa/checkout?order=abc123&token=secret#pay",
      "blocked-uri": "https://evil.example/x.js?u=1",
      "effective-directive": "script-src-elem",
      "violated-directive": "script-src",
      disposition: "report",
      "source-file": "https://nezamy.sa/_next/static/chunks/app.js",
    },
  });
  assert.deepEqual(parseCspReports(raw), [{
    document: "https://nezamy.sa/checkout",
    blocked: "https://evil.example/x.js",
    directive: "script-src-elem",
    disposition: "report",
    source: "https://nezamy.sa/_next/static/chunks/app.js",
  }]);
});

test("the Reporting API format (several in one body; other report types ignored)", () => {
  const raw = JSON.stringify([
    { type: "csp-violation", body: { documentURL: "https://nezamy.sa/", blockedURL: "inline", effectiveDirective: "script-src-elem", disposition: "report" } },
    { type: "deprecation", body: { id: "x" } },
    { type: "csp-violation", body: { documentURL: "https://nezamy.sa/laws/x", blockedURL: "eval", effectiveDirective: "script-src" } },
  ]);
  const out = parseCspReports(raw);
  assert.equal(out.length, 2);
  assert.equal(out[0].blocked, "inline");
  assert.equal(out[1].blocked, "eval");
  assert.equal(out[1].disposition, "report");
});

test("no token, id, query or fragment reaches the log", () => {
  assert.equal(sanitizeReportUrl("https://nezamy.sa/track/Zx9kQ2mP7vL1aB3cD4eF?x=1#y"), "https://nezamy.sa/track/:id");
  assert.equal(sanitizeReportUrl("https://nezamy.sa/payments/result/pay_8f1a2b3c4d5e6f7a8b9c"), "https://nezamy.sa/payments/result/:id");
  assert.equal(sanitizeReportUrl("https://nezamy.sa/dashboard/cases/0b5d1c2e-3f4a-4b5c-8d6e-7f8a9b0c1d2e"), "https://nezamy.sa/dashboard/cases/:id");
  assert.equal(sanitizeReportUrl("https://nezamy.sa/share/abc"), "https://nezamy.sa/share/:id");
  assert.equal(sanitizeReportUrl("https://nezamy.sa/laws/companies-law"), "https://nezamy.sa/laws/companies-law");
  assert.equal(sanitizeReportUrl("data:text/javascript,alert(1)"), "data");
  assert.equal(sanitizeReportUrl("not a url"), "");
  assert.equal(sanitizeReportUrl(42), "");
});

test("junk, oversize and directive-less bodies yield nothing", () => {
  assert.deepEqual(parseCspReports(""), []);
  assert.deepEqual(parseCspReports("{not json"), []);
  assert.deepEqual(parseCspReports(JSON.stringify({ "csp-report": { "document-uri": "https://nezamy.sa/" } })), []);
  assert.deepEqual(parseCspReports("x".repeat(CSP_REPORT_MAX_BYTES + 1)), []);
  const many = Array.from({ length: 50 }, () => ({ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://a.example/i.png" } }));
  assert.equal(parseCspReports(JSON.stringify(many)).length, 20);
});

test("the same violation is logged once per window; the memory is bounded", () => {
  const d = new ViolationDeduper(1000, 2);
  const key = violationKey({ document: "d", blocked: "b", directive: "x", disposition: "report", source: "" });
  assert.equal(d.shouldLog(key, 0), true);
  assert.equal(d.shouldLog(key, 500), false);
  assert.equal(d.shouldLog(key, 1500), true);
  assert.equal(d.shouldLog("k2", 1600), true);
  assert.equal(d.shouldLog("k3", 1700), false, "full and nothing expired");
  assert.equal(d.shouldLog("k3", 3000), true, "expired keys make room");
});

test("the route answers 204, logs one line per new violation, and never needs a sign-in", () => {
  const route = readFileSync(new URL("../../app/api/v1/security/csp-report/route.ts", import.meta.url), "utf8");
  assert.match(route, /status: 204/);
  assert.match(route, /if \(deduper\.shouldLog\(violationKey\(v\)\)\) console\.warn\(`\[csp-report\] \$\{JSON\.stringify\(v\)\}`\);/);
  assert.doesNotMatch(route, /requireApiUser|requireStaff|getUser/);
  assert.equal(CSP_REPORT_PATH, "/api/v1/security/csp-report");
});
