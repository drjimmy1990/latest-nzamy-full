/**
 * Owner decision Q27 (2026-10-06): نظامي presents itself as a LegalTech
 * provider, not as a law firm, and says that consultations come from the
 * licensed lawyers who join it. These guards read the page sources (the pages
 * are .tsx and cannot be loaded by `node --test`).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  LEGAL_IDENTITY_AR,
  LEGAL_IDENTITY_EN,
  NO_DIRECT_CONSULTATION_AR,
  NO_DIRECT_CONSULTATION_EN,
} from "./legalIdentity.ts";

function src(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const IDENTITY_PAGES = [
  "components/Footer.tsx",
  "app/terms/page.tsx",
  "app/refund-policy/page.tsx",
  "app/contact/page.tsx",
  "app/faq/page.tsx",
];

test("Q27: the owner's identity sentence is the one exported", () => {
  assert.match(LEGAL_IDENTITY_AR, /شركة تقنية قانونية مرخصة تقدم حلول البرمجيات السحابية وإدارة وتنسيق الخدمات القانونية \(LegalTech Provider\)/);
  assert.match(NO_DIRECT_CONSULTATION_AR, /بصفتها شخصية اعتبارية/);
  assert.match(NO_DIRECT_CONSULTATION_AR, /المحامين المرخصين المنضمين/);
  assert.match(LEGAL_IDENTITY_EN, /LegalTech Provider/);
  assert.match(NO_DIRECT_CONSULTATION_EN, /licensed lawyers/);
});

test("Q27: no page names the platform «شركة نظامي للمحاماة» or a «Law Firm»", () => {
  for (const path of IDENTITY_PAGES) {
    const text = src(path);
    assert.doesNotMatch(text, /نظامي للمحاماة/, `${path}: «شركة نظامي للمحاماة»`);
    assert.doesNotMatch(text, /N[e]?zamy Law Firm/, `${path}: "Nezamy Law Firm"`);
  }
});

test("Q27: the footer, terms, contact page and FAQ show the identity from the shared constant", () => {
  for (const path of ["components/Footer.tsx", "app/terms/page.tsx", "app/contact/page.tsx", "app/faq/page.tsx"]) {
    assert.match(src(path), /@\/constants\/legalIdentity/, `${path}: does not use the shared identity`);
  }
});

test("Q27: client screens call the platform «فريق نظامي», not «مكتب نظامي»", () => {
  for (const path of [
    "app/dashboard/client/cases/page.tsx",
    "app/dashboard/business/cases/page.tsx",
    "app/dashboard/business/page.tsx",
    "app/dashboard/client/find-lawyer/page.tsx",
    "components/floating/WhatsAppWidget.tsx",
    "app/settings/components/tabs/InvoiceTab.tsx",
  ]) {
    assert.doesNotMatch(src(path), /مكتب نظامي/, `${path}: «مكتب نظامي»`);
  }
});
