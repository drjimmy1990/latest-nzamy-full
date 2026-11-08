/**
 * Final review of batch 2026-11-08, items 4 and 6 (owner ٤١٧: the contract
 * tools and the assistant are for lawyers and law firms only).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/lawyerOnlyScreens.finalReview.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canSeeLawyerTools, isLawyerOnlyAiHref } from "./lawyerOnlyTools.ts";
import { isRouteAllowedFor } from "../auth/routeAccess.ts";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");

test("item 4: the template drawer sends a non-lawyer to a consultation, not to the lawyer-only contract tool", () => {
  const page = src("app/ai/templates/page.tsx");
  // The contract templates point at /ai/contracts — a lawyer-only page.
  assert.ok(isLawyerOnlyAiHref("/ai/contracts?mode=draft&type=services"));
  // The drawer decides by the same rule as LawyerToolLink, and waits for the session.
  assert.match(
    page,
    /\{selected\.redirectTo && isLawyerOnlyAiHref\(selected\.redirectTo\) && !canSeeLawyerTools\(user\.userType\) \? \([\s\S]{0,400}user\.loading \? null : \(\s*<Link href="\/dashboard\/client\/consultation\/new"[\s\S]{0,400}اطلب استشارة/,
  );
  // …and only then falls back to the template's own link (the lawyer, firm, admin, and the non-lawyer pages /ai/draft, /ai/legal-opinion).
  assert.match(page, /\) : selected\.redirectTo \? \(\s*<Link href=\{selected\.redirectTo\}/);
  for (const shared of ["/ai/draft", "/ai/legal-opinion"]) assert.ok(!isLawyerOnlyAiHref(shared), shared);
  // The alternative is a page the client and the company may open.
  for (const t of ["individual", "corporate"]) assert.ok(isRouteAllowedFor("/dashboard/client/consultation/new", t), t);
  for (const t of ["lawyer", "firm", "admin"]) assert.ok(canSeeLawyerTools(t), t);
});

test("item 6: /ai/consult sends lawyers AND law firms to the assistant; the admin stays", () => {
  const page = src("app/ai/consult/page.tsx");
  assert.match(page, /const usesAssistant = userType === "lawyer" \|\| userType === "firm";/);
  assert.match(page, /if \(usesAssistant\) \{\s*router\.replace\("\/ai\/assistant"\);/);
  assert.match(page, /if \(usesAssistant\) return null;/);
  assert.doesNotMatch(page, /userType === "lawyer"\) (return null|\{)/, "a lawyer-only check is left");
  assert.doesNotMatch(page, /usesAssistant = [^;]*admin/, "the admin is not redirected");
});
