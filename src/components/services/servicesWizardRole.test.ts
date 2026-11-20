/**
 * N05-M3..6 (batch l11) — the public services pages.
 *   M3  a company account reaches the wizard as `corporate`, never `lawyer_client`;
 *   M4  «اختر الباقة» on /services/tracking leads somewhere;
 *   M5  the contract-type chips on /services/contracts no longer look clickable;
 *   M6  the marketplace pages that act for an account stay in PROTECTED.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildServicesWizardRequest } from "./servicesWizardRequest.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("N05-M3: the services page passes the chosen role itself", () => {
  const page = repo("src/app/services/page.tsx");
  assert.match(page, /userRole=\{role\}/);
  assert.doesNotMatch(page, /role === "individual" \? "individual" : "lawyer_client"/);
  const data = repo("src/components/services/ServiceRequestWizardData.ts");
  assert.match(data, /userRole: "individual" \| "corporate" \| "lawyer_client";/);
  const wizard = repo("src/components/services/ServiceRequestWizard.tsx");
  assert.match(wizard, /const isLawyer = userRole === "lawyer_client";/, "lawyer-only fields stay lawyer-only");
});

test("N05-M3: a company order is stored as corporate", () => {
  const req = buildServicesWizardRequest({
    id: "sr-1", title: "t", serviceTitleAr: "t", description: "d".repeat(40),
    requester: { name: "شركة", role: "corporate", tier: null }, serviceId: "srv-1", userRole: "corporate",
    region: "riyadh", deadline: "", budgetMin: 0, budgetMax: 0, confidential: false, assignmentMethod: "open_bids",
    barNumber: "", courtName: "", caseNumber: "", serviceType: "", attachments: [],
  });
  assert.equal(req.metadata.userRole, "corporate");
});

test("N05-M4: «اختر الباقة» is a link, not a dead button", () => {
  const page = repo("src/app/services/tracking/page.tsx");
  const i = page.indexOf('{isRTL ? "اختر الباقة" : "Choose Plan"}');
  const opener = page.lastIndexOf("<motion.", i);
  assert.ok(page.slice(opener, i).startsWith("<motion.a") && page.slice(opener, i).includes('href="/contact"'));
});

test("N05-M5: the contract chips do not invite a click", () => {
  const page = repo("src/app/services/contracts/page.tsx");
  const i = page.indexOf("{contractTypes[L].map(");
  const block = page.slice(i, page.indexOf("</motion.span>", i));
  assert.doesNotMatch(block, /whileHover|cursor-default|hover:/);
});

test("N05-M6: marketplace ordering pages require sign-in at the edge", () => {
  const proxy = repo("src/proxy.ts");
  for (const p of ["/marketplace/post", "/marketplace/order", "/marketplace/workspace", "/marketplace/collaborate"]) {
    assert.ok(proxy.includes(`"${p}",`), p);
  }
});
