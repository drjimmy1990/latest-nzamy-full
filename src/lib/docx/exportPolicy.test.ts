/**
 * exportPolicy.test.ts — q345: who gets the bar, what reaches the paper, what the
 * file route hands out, and that an export never charges or logs.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/docx/exportPolicy.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { BrandingOwner, VaultRow } from "../branding/brandingServer.ts";
import { letterheadPermissionsFor } from "../branding/firmLetterheadPermissions.ts";
import type { VaultForPrint } from "../branding/vaultForPrint.ts";
import { exportFileAnswer, parseExportKind, type ExportFileDeps } from "./exportFile.ts";
import { strFromU8, unzipSync } from "fflate";
import { consultAnswerBlocks, letterDraftBlocks } from "../../app/ai/legal-opinion/_components/aiOpinion.ts";
import { contractBlocks } from "../../app/ai/contract-drafter/_components/contractDraft.ts";
import { pleadingBlocks } from "../../components/draft/legalDraft.ts";
import { documentParagraphs, exportableBlocks, letterheadScopesFor, waitUntil } from "./exportPolicy.ts";
import { buildLetterheadDocx } from "./letterheadDocx.ts";
import { assertPackageOpens } from "./packageCheck.testkit.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const FIRM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOGO = `f/${FIRM}/logo-abcdefgh.png`;
const DOCX = `f/${FIRM}/asset-letterhead-docx-abcdefgh.docx`;
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);

test("letterheadScopesFor", () => {
  assert.deepEqual(letterheadScopesFor({ userType: "lawyer", affiliation: { entityType: "firm" } }, true), ["lawyer", "firm"]);
  assert.deepEqual(letterheadScopesFor({ userType: "lawyer", affiliation: { entityType: "firm" } }, false), ["lawyer"]);
  assert.deepEqual(letterheadScopesFor({ userType: "lawyer", affiliation: { entityType: "corporate" } }, true), ["lawyer"]);
  assert.deepEqual(letterheadScopesFor({ userType: "lawyer" }, true), ["lawyer"]);
  assert.deepEqual(letterheadScopesFor({ userType: "firm" }, true), ["firm"]);
  assert.deepEqual(letterheadScopesFor({ userType: "individual" }, true), []);
  assert.deepEqual(letterheadScopesFor({ userType: "corporate", affiliation: { entityType: "firm" } }, true), []);
  assert.deepEqual(letterheadScopesFor({ userType: null }, true), []);
});

test("exportableBlocks: no raw citation marker survives in any block", () => {
  const out = exportableBlocks([
    { kind: "title", text: "عنوان [S1]" },
    { kind: "heading", text: "الوقائع[S2]" },
    { kind: "para", text: "نص [S1] وبقية [S12][S13]\nسطر [S123]" },
    { kind: "list", ordered: true, items: ["طلب [S4]"] },
    { kind: "signature", lines: ["الاسم [S5]"] },
  ]);
  assert.deepEqual(out, [
    { kind: "title", text: "عنوان" },
    { kind: "heading", text: "الوقائع" },
    { kind: "para", text: "نص وبقية\nسطر" },
    { kind: "list", ordered: true, items: ["طلب"] },
    { kind: "signature", lines: ["الاسم"] },
  ]);
  assert.ok(!/\[S\d+\]/.test(JSON.stringify(out)));
});

test("exportableBlocks: a block left empty is dropped; a law's [م ٥] is not a marker", () => {
  assert.deepEqual(
    exportableBlocks([{ kind: "para", text: "[S1]" }, { kind: "list", ordered: false, items: ["[S1]"] }, { kind: "signature", lines: [" "] }]),
    [],
  );
  assert.deepEqual(exportableBlocks([{ kind: "para", text: "المادة [٥] و[Section]" }]), [{ kind: "para", text: "المادة [٥] و[Section]" }]);
});

test("waitUntil: resolves true when ready, false at the deadline, and never hangs", async () => {
  let n = 0;
  assert.equal(await waitUntil(() => ++n > 2, { timeoutMs: 500, intervalMs: 1 }), true);
  assert.equal(await waitUntil(() => false, { timeoutMs: 5, intervalMs: 1 }), false);
});

const firmOwner = (role: string): BrandingOwner => ({ scope: "firm", ownerId: FIRM, firmRole: role, permissions: letterheadPermissionsFor("firm", { isOwner: false, role }) });
const vault = (over: Partial<VaultForPrint> = {}): VaultForPrint => ({ denied: false, row: { logo_path: LOGO } as VaultRow, docxPath: DOCX, hasPdf: false, error: null, ...over });

function files(answer: VaultForPrint, bytes: Uint8Array | null = PNG) {
  const downloads: string[] = [];
  const deps: ExportFileDeps = {
    read: async () => answer,
    download: async (bucket, path) => { downloads.push(`${bucket}:${path}`); return bytes; },
  };
  return { deps, downloads };
}

test("parseExportKind takes two values, never a path", () => {
  assert.equal(parseExportKind("logo"), "logo");
  assert.equal(parseExportKind("letterhead_docx"), "letterhead_docx");
  for (const bad of ["stamp", "signature", "letterhead_pdf", "../x", "", null]) assert.equal(parseExportKind(bad), null);
});

test("export-file: without print → 403 and no download at all", async () => {
  for (const kind of ["logo", "letterhead_docx"] as const) {
    const { deps, downloads } = files(vault({ denied: true, row: null, docxPath: null }));
    const out = await exportFileAnswer(firmOwner("lawyer"), kind, deps);
    assert.equal(out.status, 403);
    assert.deepEqual(downloads, []);
  }
});

test("export-file: the holder gets the template, from the files bucket", async () => {
  const { deps, downloads } = files(vault());
  const out = await exportFileAnswer(firmOwner("office_admin"), "letterhead_docx", deps);
  assert.equal(out.status, 200);
  assert.deepEqual(downloads, [`branding-files:${DOCX}`]);
  if (out.status === 200) {
    assert.equal(out.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(out.filename, "letterhead.docx");
  }
});

test("export-file: the logo's type comes from its bytes, from the logo bucket", async () => {
  const { deps, downloads } = files(vault());
  const out = await exportFileAnswer(firmOwner("office_admin"), "logo", deps);
  assert.equal(out.status, 200);
  assert.deepEqual(downloads, [`branding:${LOGO}`]);
  if (out.status === 200) {
    assert.equal(out.contentType, "image/png");
    assert.equal(out.filename, "logo.png");
  }
});

test("export-file: a stored logo that is markup is never served", async () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const { deps } = files(vault(), svg);
  const out = await exportFileAnswer(firmOwner("office_admin"), "logo", deps);
  assert.equal(out.status, 415);
  assert.ok(!("bytes" in out));
});

test("export-file: a logo path outside this firm's folder is not downloaded", async () => {
  const { deps, downloads } = files(vault({ row: { logo_path: `f/${OTHER}/logo-abcdefgh.png` } as VaultRow }));
  const out = await exportFileAnswer(firmOwner("office_admin"), "logo", deps);
  assert.equal(out.status, 404);
  assert.deepEqual(downloads, []);
});

test("export-file: nothing there, a missing object, and read failures are honest", async () => {
  const none = files(vault({ docxPath: null, row: null }));
  assert.equal((await exportFileAnswer(firmOwner("office_admin"), "letterhead_docx", none.deps)).status, 404);
  assert.equal((await exportFileAnswer(firmOwner("office_admin"), "logo", none.deps)).status, 404);
  assert.deepEqual(none.downloads, []);

  assert.equal((await exportFileAnswer(firmOwner("office_admin"), "letterhead_docx", files(vault(), null).deps)).status, 404);
  assert.equal((await exportFileAnswer(firmOwner("office_admin"), "logo", files(vault({ error: { code: "42P01" } })).deps)).status, 503);
  assert.equal((await exportFileAnswer(firmOwner("office_admin"), "logo", files(vault({ error: { code: "500" } })).deps)).status, 500);
});

const ROUTE = "src/app/api/v1/branding/export-file/route.ts";

test("the route: the gate comes first, the service role only inside the download", () => {
  const route = read(ROUTE);
  const gate = route.indexOf('resolveBrandingCaller(');
  assert.ok(gate > 0);
  assert.ok(route.includes('"letterhead.print"'));
  assert.ok(gate < route.indexOf("exportFileAnswer("));
  assert.ok(route.indexOf("exportFileAnswer(") < route.indexOf("createServiceClient()"), "the service role is reached through the answer");
  assert.ok(route.includes("readVaultForPrint(supabase, owner)"));
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), "read-only");
});

test("the route's headers: not sniffed, not cached, not rendered inline", () => {
  const route = read(ROUTE);
  assert.ok(route.includes('"X-Content-Type-Options": "nosniff"'));
  assert.ok(route.includes('"Cache-Control": "no-store"'));
  assert.ok(route.includes("attachment; filename="));
});

const EXPORT_SOURCES = [
  ROUTE,
  "src/lib/docx/exportFile.ts",
  "src/lib/docx/exportPolicy.ts",
  "src/lib/docx/ooxml.ts",
  "src/lib/docx/letterheadDocx.ts",
  "src/components/letterhead/exportKit.ts",
  "src/components/letterhead/LetterheadExportBar.tsx",
  "src/components/letterhead/LetterheadPrintDocument.tsx",
];

test("an export never charges points and never logs: no AI run, no points, no console, no body sent", () => {
  for (const path of EXPORT_SOURCES) {
    assert.ok(existsSync(path), path);
    const code = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [/useAiRun/, /\/api\/v1\/ai\b/, /\/points\b/, /debitPoints|chargePoints|spend_points|chargedPoints/, /\bconsole\./, /\blogger\b/, /captureException/]) {
      assert.ok(!banned.test(code), `${path}: ${banned}`);
    }
  }
});

test("the document text never travels: export-file reads no body, the kit sends none", () => {
  const route = read(ROUTE);
  assert.ok(!/request\.(json|text|formData|arrayBuffer|body)/.test(route));
  const kit = read("src/components/letterhead/exportKit.ts");
  assert.ok(!/method:\s*["'](POST|PUT|PATCH)/.test(kit));
  assert.ok(!/\bbody:/.test(kit));
  const fetches = [...kit.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(fetches.length, 1, "one fetch, for the bytes");
  assert.ok(fetches[0].includes("/api/v1/branding/export-file"));
});

test("owner ٤٤٢(أ): the kit builds no QR, and print goes through the sheet, which carries none", () => {
  const kit = read("src/components/letterhead/exportKit.ts");
  assert.ok(!kit.includes("letterheadQrPayload"), "no QR payload is built");
  assert.ok(!kit.includes("qrcode"), "the QR library is not loaded");
  assert.ok(!/qrPng/.test(kit), "no QR image reaches the file");
  assert.ok(!kit.includes("/verify/"));
  const doc = read("src/components/letterhead/LetterheadPrintDocument.tsx");
  assert.ok(doc.includes("<LetterheadSheet"), "print goes through the sheet");
  assert.ok(!doc.includes("/verify/"));
  assert.ok(!doc.includes("svg[role='img']"), "print no longer waits for a QR that is not drawn");
});

test("both exports pass through the last wall", () => {
  const bar = read("src/components/letterhead/LetterheadExportBar.tsx");
  assert.ok(bar.includes("exportableBlocks(blocks)"));
  const uses = bar.slice(bar.indexOf("exportableBlocks(blocks)"));
  assert.ok(uses.includes("blocks: safe") && uses.includes("blocks={safe}"), "the kit and the print document both get the cleaned blocks");
});

test("fflate (and any QR code) load only when the person exports", () => {
  const bar = read("src/components/letterhead/LetterheadExportBar.tsx");
  assert.ok(bar.includes('import("./exportKit")'));
  assert.ok(!/^import .*exportKit/m.test(bar));
  assert.ok(!/^import .*(fflate|qrcode)/m.test(bar));
});

test("documentParagraphs: markers out, each line a paragraph, no empties", () => {
  assert.deepEqual(documentParagraphs("أ [S1]\n\n  ب  \r\n[S2]\n"), [{ kind: "para", text: "أ" }, { kind: "para", text: "ب" }]);
  assert.deepEqual(documentParagraphs(""), []);
});

const MARKED = "نص [S1] مع [S22] وأيضاً [S333]";
const IDENTITY = {
  nameAr: "مكتب العدل", nameEn: "", licenceLine: null, contacts: [], logoUrl: null, accent: "#C8A762",
  qr: { kind: "platform" as const, url: "https://nezamy.sa", caption: "امسح", reason: "firm" as const },
};

test("from each tool to the file: the .docx opens and carries no raw citation marker", () => {
  const documents = [
    pleadingBlocks({ title: MARKED, sections: [{ heading: MARKED, body: MARKED }], requests: [MARKED], citation_check: [] }),
    consultAnswerBlocks({ summary: MARKED, sections: [{ heading: MARKED, body: MARKED }] }),
    letterDraftBlocks({ title: MARKED, body: MARKED, citation_check: [] }),
    contractBlocks({ title: MARKED, preamble: MARKED, sections: [{ heading: MARKED, body: MARKED }], citation_check: [] }),
  ];
  for (const blocks of documents) {
    const files = assertPackageOpens(buildLetterheadDocx({ blocks: exportableBlocks(blocks), identity: IDENTITY }).bytes);
    assert.ok(strFromU8(files["word/document.xml"]).includes("مع"));
    for (const name of Object.keys(files)) {
      if (name.endsWith(".xml")) assert.ok(!/\[S\d/.test(strFromU8(files[name])), name);
    }
  }
});

test("the wall holds even for a block a tool's helper left raw", () => {
  const raw = [{ kind: "para" as const, text: MARKED }, { kind: "list" as const, ordered: false, items: [MARKED] }];
  const files = unzipSync(buildLetterheadDocx({ blocks: exportableBlocks(raw), identity: IDENTITY }).bytes);
  assert.ok(!/\[S\d/.test(strFromU8(files["word/document.xml"])));
});

test("the print document shows only what the wall passed", () => {
  const bar = read("src/components/letterhead/LetterheadExportBar.tsx");
  assert.ok(/<LetterheadPrintDocument[^>]*blocks=\{safe\}/.test(bar));
  assert.ok(!bar.includes("blocks={blocks}"));
});

const TOOLS: [string, RegExp][] = [
  ["src/components/draft/steps/StepAiDraft.tsx", /<LetterheadExportBar title=\{pleading\.title\} blocks=\{pleadingBlocks\(pleading\)\}/],
  ["src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx", /<LetterheadExportBar[\s\S]{0,200}consultAnswerBlocks\(answer\)[\s\S]{0,100}letterDraftBlocks\(letter\)/],
  ["src/app/ai/contract-drafter/_components/StepContractResult.tsx", /aiDraft && \([\s\S]{0,80}<LetterheadExportBar[\s\S]{0,120}contractBlocks\(aiDraft\.draft\)/],
];

test("the three live tools mount the bar, and keep the actions they had", () => {
  for (const [path, mount] of TOOLS) assert.ok(mount.test(read(path)), path);
  const step = read("src/components/draft/steps/StepAiDraft.tsx");
  assert.ok(step.includes("downloadWord"), "the plain Word button stays for everyone else");
  assert.ok(step.includes("<AiResultActions"));
  assert.ok(read("src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx").includes("<AiResultActions"));
  assert.ok(read("src/app/ai/contract-drafter/_components/StepContractResult.tsx").includes("<AiResultActions"));
  assert.ok(read("src/app/ai/contract-drafter/page.tsx").includes("aiDraft={{ citations: draft.citation_check, chargedPoints: run.chargedPoints, draft }}"));
});

test("no mock surface was wired (section's list)", () => {
  for (const path of ["src/components/letterhead/LetterheadWorkspace.tsx", "src/components/draft/steps/StepApproval.tsx", "src/components/draft/steps/StepDrafting.tsx"]) {
    if (existsSync(path)) assert.ok(!read(path).includes("<LetterheadExportBar"), path);
  }
});

test("the screens stop saying the tools cannot do this, and keep what is still not done", () => {
  const panel = read("src/components/letterhead/BrandingAssetsPanel.tsx");
  assert.ok(!panel.includes("لا تدمج المنصة بعدُ"));
  assert.ok(panel.includes("لا تطبع المنصة فوق ملف PDF"));
  assert.ok(panel.includes("الختم والتوقيع"));
  const workspace = read("src/components/letterhead/LetterheadWorkspace.tsx");
  assert.ok(!workspace.includes("ولا تطبّق تلك الأدوات هذه الهوية تلقائياً بعد"));
  assert.ok(!read("src/lib/branding/brandingAssets.ts").includes("does NOT yet\n * merge a document"));
});

test("neither export can hang: the file fetch has a deadline, and a print that never reports back can be repeated", () => {
  assert.ok(read("src/components/letterhead/exportKit.ts").includes("AbortSignal.timeout(FILE_TIMEOUT_MS)"));
  const bar = read("src/components/letterhead/LetterheadExportBar.tsx");
  assert.ok(bar.includes("key={printRun}"));
  assert.ok(!/disabled=\{[^}]*printRun/.test(bar));
  const doc = read("src/components/letterhead/LetterheadPrintDocument.tsx");
  assert.ok(doc.includes("waitUntil(") && doc.includes("READY_TIMEOUT_MS"));
});

test("the title too: browsers print the page title in their header, so no marker reaches it", () => {
  const bar = read("src/components/letterhead/LetterheadExportBar.tsx");
  assert.ok(bar.includes("title={stripCitationMarkers(title).trim()}"));
  assert.ok(!bar.includes("title={title}"));
});
