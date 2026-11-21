/**
 * Batch l9 public — owner file 20 row 4, file 15 rows 11 / 45: the licence
 * number / issuer and the CR as admin settings; an empty number hides the
 * whole licence line everywhere; the «[[…]]» placeholder never reaches a page.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/publicSeo/platformRegistry.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_REGISTRY,
  licenceBadge,
  licenceLineAr,
  licenceLineEn,
  licenceSettingIssue,
  registryFromRows,
} from "./platformRegistry.ts";
import { buildOrganizationJsonLd } from "./structuredData.ts";
import { buildLlmsTxt } from "./llmsTxt.ts";
import { faqData, faqWithLicence, LICENCE_FAQ_ID } from "../../app/faq/faqData.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const filled = registryFromRows([
  { key: "license_number", value: "1234/ت" },
  { key: "license_issuer", value: "الجهة المانحة للاختبار" },
  { key: "billing_company", value: { legal_name_ar: "شركة اختبار", cr_number: "4031000000", vat_number: "3000", address_ar: "مكة" } },
]);

test("rows → registry: licence from its two settings, CR and legal name from billing_company", () => {
  assert.deepEqual(filled, {
    legalName: "شركة اختبار",
    commercialRegistration: "4031000000",
    licence: "1234/ت",
    licenceIssuer: "الجهة المانحة للاختبار",
  });
  assert.deepEqual(registryFromRows(null), EMPTY_REGISTRY);
  assert.deepEqual(registryFromRows([{ key: "license_number", value: 42 }, { key: "billing_company", value: [] }]), EMPTY_REGISTRY);
  // A placeholder that reached the table somehow is still never published.
  assert.equal(registryFromRows([{ key: "license_number", value: "[[رقم_الترخيص]]" }]).licence, "");
});

test("the licence line: hidden whole while the number is empty; the issuer only when set", () => {
  assert.equal(licenceLineAr(EMPTY_REGISTRY), null);
  assert.equal(licenceLineEn(EMPTY_REGISTRY), null);
  assert.equal(licenceLineAr({ ...EMPTY_REGISTRY, licenceIssuer: "جهة" }), null, "an issuer alone shows nothing");
  assert.equal(licenceLineAr(filled), "رقم الترخيص: 1234/ت، الجهة المانحة: الجهة المانحة للاختبار.");
  assert.equal(licenceLineAr({ ...EMPTY_REGISTRY, licence: "99" }), "رقم الترخيص: 99.");
  assert.equal(licenceLineEn(filled), "Licence number: 1234/ت, issued by: الجهة المانحة للاختبار.");
});

test("file 05 #33 (l12): the home badge only with a licence number; it names no issuer the owner did not set", () => {
  assert.equal(licenceBadge(EMPTY_REGISTRY, true), null, "no number: no badge");
  assert.equal(licenceBadge({ ...EMPTY_REGISTRY, licenceIssuer: "جهة" }, true), null, "an issuer without a number: no badge");
  assert.equal(licenceBadge({ ...EMPTY_REGISTRY, licence: "1234/ت" }, true), "منصة مرخّصة");
  assert.equal(licenceBadge(filled, true), "مرخّص من الجهة المانحة للاختبار");
  assert.equal(licenceBadge(filled, false), "Licensed platform");
  const hero = read("../../components/Hero.tsx");
  assert.doesNotMatch(hero, /"مرخّص من وزارة العدل"|Ministry of Justice/);
  assert.match(hero, /licenceBadge\(\{ \.\.\.EMPTY_REGISTRY, licence, licenceIssuer \}, isAr\)/);
  assert.match(hero, /\{badge && \(/);
  assert.match(read("../../app/page.tsx"), /<Hero licence=\{registry\.licence\} licenceIssuer=\{registry\.licenceIssuer\} \/>/);
});

test("the admin validator: strings only, one line, capped, no placeholder or markup", () => {
  assert.equal(licenceSettingIssue("license_number", ""), null, "empty hides the line");
  assert.equal(licenceSettingIssue("license_number", "1234/ت"), null);
  assert.equal(licenceSettingIssue("license_issuer", "وزارة التجارة"), null);
  assert.ok(licenceSettingIssue("license_number", null), "value is NOT NULL in platform_settings");
  assert.ok(licenceSettingIssue("license_number", 1234));
  assert.ok(licenceSettingIssue("license_number", "x".repeat(61)));
  assert.equal(licenceSettingIssue("license_issuer", "x".repeat(120)), null);
  assert.ok(licenceSettingIssue("license_issuer", "x".repeat(121)));
  assert.ok(licenceSettingIssue("license_number", "[[رقم_الترخيص: يسلّمه المالك]]"));
  assert.ok(licenceSettingIssue("license_issuer", "<b>x</b>"));
  assert.ok(licenceSettingIssue("license_issuer", "سطر\nثان"));
});

test("the settings route allows and validates both keys", () => {
  const route = read("../../app/api/v1/admin/settings/route.ts");
  assert.match(route, /"license_number",\n\s*"license_issuer",\n\] as const;/);
  assert.match(route, /license_number: \(value\) => licenceSettingIssue\("license_number", value\),/);
  assert.match(route, /license_issuer: \(value\) => licenceSettingIssue\("license_issuer", value\),/);
});

test("/faq: no year «٢٠٢٥»; «مرخّصة» and the licence line join answer 3 only when the number is given (file 05 #33)", () => {
  for (const item of faqData) {
    assert.doesNotMatch(item.answerAr, /٢٠٢٥|2025/, `faq ${item.id}`);
    assert.doesNotMatch(item.answerEn, /2025/, `faq ${item.id}`);
  }
  const licenceItem = faqData.find((i) => i.id === LICENCE_FAQ_ID)!;
  assert.doesNotMatch(licenceItem.questionAr + licenceItem.answerAr, /مرخّص/, "no licence claimed without the number");
  assert.doesNotMatch(licenceItem.answerEn, /licensed|supervision/i);
  assert.equal(faqWithLicence(faqData, null, null), faqData, "nothing set: the same items");
  const withLine = faqWithLicence(faqData, licenceLineAr(filled), licenceLineEn(filled));
  const three = withLine.find((i) => i.id === LICENCE_FAQ_ID)!;
  assert.ok(three.answerAr.endsWith(" رقم الترخيص: 1234/ت، الجهة المانحة: الجهة المانحة للاختبار."));
  assert.ok(three.answerEn.endsWith(" Licence number: 1234/ت, issued by: الجهة المانحة للاختبار."));
  assert.ok(three.answerAr.startsWith("نعم، نظامي منصة مرخّصة."));
  assert.equal(three.questionAr, "هل المنصة موثوقة ومرخّصة؟");
  for (const item of withLine.filter((i) => i.id !== LICENCE_FAQ_ID)) {
    assert.equal(item, faqData.find((i) => i.id === item.id), "other answers untouched");
  }
  assert.ok(faqData.every((i) => !/\[\[/.test(i.answerAr)));
});

test("Organization JSON-LD and llms.txt carry the fields only once they are filled", () => {
  const empty = buildOrganizationJsonLd(EMPTY_REGISTRY) as Record<string, unknown>;
  assert.equal("identifier" in empty, false);
  assert.equal("legalName" in empty, false);
  const ld = buildOrganizationJsonLd(filled) as { identifier: Array<{ propertyID: string; value: string }>; legalName: string };
  assert.equal(ld.legalName, "شركة اختبار");
  assert.deepEqual(ld.identifier.map((i) => i.value), ["4031000000", "1234/ت"]);

  assert.doesNotMatch(buildLlmsTxt(), /بيانات المنشأة|رقم الترخيص|السجل التجاري/);
  const txt = buildLlmsTxt(filled);
  assert.match(txt, /## بيانات المنشأة\n- الاسم النظامي: شركة اختبار\n- السجل التجاري: 4031000000\n- رقم الترخيص: 1234\/ت، الجهة المانحة: الجهة المانحة للاختبار\./);
});

test("the server reader is cached (not no-store) and fails to empty; the footer reads the public route", () => {
  const server = read("./platformRegistryServer.ts");
  assert.match(server, /next: \{ revalidate: PLATFORM_REGISTRY_REVALIDATE_SECONDS/);
  assert.doesNotMatch(server, /cache: "no-store"/);
  assert.match(server, /if \(!url \|\| !key\) return EMPTY_REGISTRY;/);
  const route = read("../../app/api/v1/public/platform-licence/route.ts");
  assert.match(route, /lineAr: licenceLineAr\(registry\), lineEn: licenceLineEn\(registry\)/);
  const footer = read("../../components/Footer.tsx");
  assert.match(footer, /fetch\("\/api\/v1\/public\/platform-licence"\)/);
  assert.match(footer, /\{licenceLine \? ` \$\{licenceLine\}` : null\}/);
});
