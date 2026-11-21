/**
 * N17 (owner RAW[31], batch l12): the letterhead, stamp and signature are reached
 * from the lawyer's and the firm's settings, pointing at the vault's one store.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/settings/components/tabs/signatureTab.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vaultHref } from "../../../../components/letterhead/legalVaultTabs.ts";

const tab = readFileSync(new URL("./SignatureTab.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../../hooks/useSettingsTabs.ts", import.meta.url), "utf8");

test("the settings tab links the vault's branding tab for a lawyer and a firm", () => {
  assert.match(tab, /const scope = userType === "firm" \? "firm" : userType === "lawyer" \? "lawyer" : null;/);
  assert.match(tab, /href=\{vaultHref\(scope, "branding"\)\}/);
  assert.equal(vaultHref("lawyer", "branding"), "/dashboard/lawyer/vault?tab=branding");
  assert.equal(vaultHref("firm", "branding"), "/dashboard/firm/vault?tab=branding");
  assert.match(tabs, /labelAr: "الترويسة والختم والتوقيع"/);
});

test("it stores nothing itself and promises no e-signature", () => {
  assert.doesNotMatch(tab, /type="file"|upload\(|fetch\(/);
  assert.match(tab, /التوقيع الرقمي غير متاح/);
});
