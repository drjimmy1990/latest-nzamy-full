import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isLawyerCaseRow } from "../../cases/_caseListRules.ts";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "page.tsx"), "utf8").replace(/\r\n/g, "\n");

test("CODE-F40: the client file counts a case by the cases list's rule", () => {
  assert.match(page, /import \{ isLawyerCaseRow \} from "\.\.\/\.\.\/cases\/_caseListRules";/);
  assert.match(page, /type !== "consultation" && !isLawyerCaseRow\(/);
});

test("CODE-F40: client cards, invoices and AI orders are not cases", () => {
  assert.equal(isLawyerCaseRow({ type: "service", metadata: { client: true } }), false);
  assert.equal(isLawyerCaseRow({ type: "service", metadata: { invoice: true } }), false);
  assert.equal(isLawyerCaseRow({ type: "ai_draft", metadata: undefined }), false);
  assert.equal(isLawyerCaseRow({ type: "service", metadata: { caseType: "تجاري" } }), true);
});
