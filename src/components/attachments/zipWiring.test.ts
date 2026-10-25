/**
 * zipWiring.test.ts — run with: node --test src/components/attachments/zipWiring.test.ts
 *
 * «تحميل الكل (ZIP)» (owner ٢٥٦, plan D3) is one route behind many screens.
 * These checks read the sources: each surface renders the button with the
 * scope whose access rule matches that screen's reader (a client page never
 * asks for the lawyer's `contract` scope, and vice versa), the button builds
 * its link through zipHref and hides below two files, and the route keeps its
 * gate, its soft-delete filter, its caps and its headers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const SURFACES: Array<{ file: string; scope: string; component: "ZipDownloadButton" | "RequestZipDownloadButton" }> = [
  { file: "src/app/dashboard/lawyer/cases/[id]/page.tsx", scope: "case", component: "ZipDownloadButton" },
  { file: "src/app/dashboard/firm/cases/[id]/page.tsx", scope: "case", component: "ZipDownloadButton" },
  { file: "src/app/dashboard/client/cases/[id]/page.tsx", scope: "case", component: "ZipDownloadButton" },
  { file: "src/app/dashboard/business/cases/[id]/page.tsx", scope: "case", component: "ZipDownloadButton" },
  { file: "src/app/ai/orders/[id]/page.tsx", scope: "request", component: "ZipDownloadButton" },
  { file: "src/app/dashboard/lawyer/_components/consultations/ConsultationDetail.tsx", scope: "consultation", component: "RequestZipDownloadButton" },
  { file: "src/app/dashboard/client/consultation/[id]/page.tsx", scope: "consultation", component: "RequestZipDownloadButton" },
  { file: "src/app/dashboard/lawyer/_components/contracts/ContractDetail.tsx", scope: "contract", component: "ZipDownloadButton" },
  { file: "src/app/dashboard/client/contracts/page.tsx", scope: "client_contract", component: "ZipDownloadButton" },
  { file: "src/app/dashboard/micro/contracts/page.tsx", scope: "client_contract", component: "ZipDownloadButton" },
];

for (const s of SURFACES) {
  test(`${s.file}: «تحميل الكل (ZIP)» with scope="${s.scope}"`, () => {
    const src = read(s.file);
    assert.match(src, /from ["']@\/components\/attachments\/ZipDownloadButton["']/, "imports the shared button");
    const uses = [...src.matchAll(new RegExp(`<${s.component}\\b[^>]*?scope="([a-z_]+)"`, "g"))].map((m) => m[1]);
    assert.ok(uses.length >= 1, `renders <${s.component}>`);
    for (const scope of uses) assert.equal(scope, s.scope, "every button on this screen uses its own scope");
    // No hand-built link to the route that could skip zipHref.
    assert.doesNotMatch(src, /\/api\/v1\/attachments\/zip/);
  });
}

test("client screens never use a lawyer-side scope", () => {
  for (const s of SURFACES.filter((x) => /dashboard\/(client|micro|business)\/|ai\/orders/.test(x.file))) {
    assert.doesNotMatch(read(s.file), /scope="contract"/, s.file);
  }
});

test("the lawyer / firm consultation pages render ConsultationDetail (which carries the button)", () => {
  for (const f of ["src/app/dashboard/lawyer/consultations/[id]/page.tsx", "src/app/dashboard/firm/consultations/[id]/page.tsx"]) {
    assert.match(read(f), /ConsultationDetail/, f);
  }
  assert.match(read("src/app/dashboard/firm/contracts/[id]/page.tsx"), /ContractDetail/);
});

test("the button: a link built by zipHref, hidden below ZIP_MIN_FILES_FOR_BUTTON, caps checked, no invisible text colours", () => {
  const src = read("src/components/attachments/ZipDownloadButton.tsx");
  assert.match(src, /href=\{zipHref\(scope, id\)\}/);
  assert.match(src, /sizes\.length < ZIP_MIN_FILES_FOR_BUTTON\) return null/);
  assert.match(src, /checkZipCaps\(sizes\)/);
  assert.match(src, /تحميل الكل \(ZIP\)/);
  // Dark-mode trap (globals.css turns gray-50/100/200 into surfaces).
  assert.doesNotMatch(src, /text-(gray|zinc|slate)-(100|200)\b/);
});

test("the route: request gate shared with the per-file routes, soft-delete filter, caps before streaming, headers", () => {
  const route = read("src/app/api/v1/attachments/zip/route.ts");
  assert.match(route, /mayDownloadRequestFiles\(order, user\.id/);
  assert.match(route, /\.is\("deleted_at", null\)/);
  assert.match(route, /visibleRequestFiles\(rows, requestId\)/);
  assert.match(route, /assertRole\(\["lawyer", "firm"\]\)/);
  assert.match(route, /\.eq\("client_user_id", auth\.user\.id\)/);
  assert.match(route, /visibleContractFiles\(rows, contractId\)/);
  const caps = route.indexOf("checkZipCaps(");
  const stream = route.indexOf("buildZipStream(\n");
  assert.ok(caps > 0 && stream > caps, "caps are checked before the stream is built");
  assert.match(route, /status: 413/);
  assert.match(route, /zipContentDisposition\(archiveFileName\(scope, id\)\)/);
  assert.match(route, /\.\.\.ZIP_RESPONSE_HEADERS/);
  assert.doesNotMatch(route, /\.remove\(|\.delete\(|\.upload\(/, "the ZIP route only reads");

  for (const f of [
    "src/app/api/v1/service-requests/[id]/attachments/[attachmentId]/route.ts",
    "src/app/api/v1/service-requests/[id]/deliverable/route.ts",
  ]) {
    assert.match(read(f), /mayDownloadRequestFiles\(order, user\.id/, `${f} uses the same gate`);
  }
});

test("the proxy rate-limits the ZIP route in its own bucket", () => {
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /isAttachmentsZipRoute\(method, pathname\)/);
  assert.match(proxy, /rateLimiter\.check\("attachments-zip", key, ATTACHMENTS_ZIP_RATE_LIMIT\)/);
  assert.match(proxy, /rateLimiter\.check\("attachments-zip-ip", ip, ATTACHMENTS_ZIP_IP_RATE_LIMIT\)/);
});
