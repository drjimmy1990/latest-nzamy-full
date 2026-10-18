/**
 * signupMetadata.test.ts — what /register/provider sends to signUp for each
 * card, which `?type=` values preselect a card, and the consultant's fixed
 * country (owner answer ٢١٩; plan Task 2.5).
 *
 * data.ts and page.tsx import Phosphor icons and Next at runtime, so they are
 * read as text here, the way planRequest.test.ts reads the pricing constants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROVIDER_TYPE_IDS,
  parseProviderTypeParam,
  providerSignupMetadata,
  signupCountry,
} from "./signupMetadata.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("each card maps to the user_type / sub_role the page sent before, and a consultant is a lawyer with practice_kind", () => {
  // The first five are exactly the inline ternaries this module replaced
  // (page.tsx, the step-4 submit): firm → firm, lawyer → lawyer, everything
  // else → provider; notary → notary, arbitrator → arbitrator,
  // tracker → bailiff, everything else → null.
  assert.deepEqual(providerSignupMetadata("lawyer"), { user_type: "lawyer", sub_role: null });
  assert.deepEqual(providerSignupMetadata("firm"), { user_type: "firm", sub_role: null });
  assert.deepEqual(providerSignupMetadata("notary"), { user_type: "provider", sub_role: "notary" });
  assert.deepEqual(providerSignupMetadata("tracker"), { user_type: "provider", sub_role: "bailiff" });
  assert.deepEqual(providerSignupMetadata("arbitrator"), { user_type: "provider", sub_role: "arbitrator" });
  assert.deepEqual(providerSignupMetadata("consultant"), {
    user_type: "lawyer",
    sub_role: null,
    practice_kind: "consultant",
  });
});

test("practice_kind is sent for a consultant only — absent, not null, for the other five", () => {
  for (const id of PROVIDER_TYPE_IDS) {
    const meta = providerSignupMetadata(id);
    assert.equal(Object.hasOwn(meta, "practice_kind"), id === "consultant", id);
  }
});

test("the result is a copy: a caller cannot change what the next signup sends", () => {
  const first = providerSignupMetadata("consultant") as { user_type: string };
  first.user_type = "admin";
  assert.equal(providerSignupMetadata("consultant").user_type, "lawyer");
});

test("?type= preselects a known card and ignores anything else", () => {
  for (const id of ["lawyer", "firm", "notary", "tracker", "arbitrator", "consultant"]) {
    assert.equal(parseProviderTypeParam(id), id);
  }
  // "service" is the live value on the other provider CTAs in
  // pricing.providers.ts; "provider" and "admin" are user_types, not cards.
  for (const v of [null, undefined, "", "service", "Consultant", " consultant", "consultant ", "admin", "provider", "bailiff", "toString", "__proto__", "constructor"]) {
    assert.equal(parseProviderTypeParam(v), null, String(v));
  }
});

test("a consultant registers in Saudi Arabia only; the other cards keep the chosen country", () => {
  assert.equal(signupCountry("consultant", "AE"), "SA");
  assert.equal(signupCountry("consultant", undefined), "SA");
  assert.equal(signupCountry("consultant", ""), "SA");
  assert.equal(signupCountry("lawyer", "AE"), "AE");
  assert.equal(signupCountry("lawyer", undefined), "SA");
  assert.equal(signupCountry("lawyer", ""), "SA");
  assert.equal(signupCountry(null, "EG"), "EG");
});

test("the cards in data.ts are exactly the ids this module knows, in both languages, with the owner's consultant copy", () => {
  const data = read("./data.ts");
  const block = data.slice(data.indexOf("export const providerTypes"), data.indexOf("export const specializations"));
  const ar = block.slice(block.indexOf("ar: ["), block.indexOf("en: ["));
  const en = block.slice(block.indexOf("en: ["));
  const ids = (s: string) => [...s.matchAll(/id: "([a-z]+)" as ProviderType/g)].map((m) => m[1]).sort();
  const known = [...PROVIDER_TYPE_IDS].sort();
  assert.deepEqual(ids(ar), known);
  assert.deepEqual(ids(en), known);
  assert.match(ar, /id: "consultant" as ProviderType, icon: \w+, label: "مستشار قانوني", desc: "الاستشارات والعقود والدراسات — دون ترافع \(المادة ١٨\)"/);
  assert.match(en, /id: "consultant" as ProviderType, icon: \w+, label: "Legal Consultant", desc: "Consultations, contracts and studies — no court pleading \(Art\. 18\)"/);
});

test("the page builds user_type / sub_role / practice_kind from this module, not from its own ternaries", () => {
  const page = read("./page.tsx");
  assert.match(page, /from "\.\/signupMetadata"/);
  assert.match(page, /providerSignupMetadata\(/);
  assert.match(page, /parseProviderTypeParam\(/);
  assert.doesNotMatch(page, /providerType === "tracker" \? "bailiff"/);
  assert.doesNotMatch(page, /practice_kind:/, "practice_kind travels only inside the module's result");
});

test("the consultant plan CTAs on /pricing preselect the consultant card", () => {
  const pricing = read("../../../constants/pricing/pricing.providers.ts");
  const consultantHrefs = [...pricing.matchAll(/id: "consultant-independent"[\s\S]*?ctaHref: "([^"]*)"/g)].map((m) => m[1]);
  assert.equal(consultantHrefs.length, 2, "one card in ar, one in en");
  for (const href of consultantHrefs) {
    const url = new URL(href, "https://nezamy.test");
    assert.equal(url.pathname, "/register/provider");
    assert.equal(parseProviderTypeParam(url.searchParams.get("type")), "consultant");
  }
});
