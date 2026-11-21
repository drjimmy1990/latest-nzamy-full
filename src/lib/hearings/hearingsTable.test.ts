/**
 * N13 (batch l12; owner RAW [11]): the hearings table — six columns, filled
 * only from what is stored, and a real Word table (right to left, header
 * repeated) on the letterhead.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HEARINGS_TABLE_HEADER, caseInfoFromCase, hearingTableCells, hearingsTableBlocks } from "./hearingsTable.ts";
import { blocksToBodyXml } from "../docx/ooxml.ts";
import { exportableBlocks } from "../docx/exportPolicy.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("N13: the six columns the owner named, in his order", () => {
  assert.deepEqual([...HEARINGS_TABLE_HEADER], ["التاريخ", "الوقت", "المحكمة", "رقم القضية", "الموكّل", "الدائرة"]);
});

test("N13: case columns come from the case — class as court, a directory name as circuit", () => {
  const info = caseInfoFromCase({
    id: "8f2c5a10-1111-4222-8333-944455556666",
    requester: { name: " شركة الأمل " },
    metadata: { court: "دائرة الأحوال الشخصية الأولى بالمحكمة العامة بجازان", courtClass: "المحكمة العامة" },
  });
  assert.ok(info);
  assert.equal(info.court, "المحكمة العامة");
  assert.equal(info.circuit, "دائرة الأحوال الشخصية الأولى بالمحكمة العامة بجازان");
  assert.equal(info.client, "شركة الأمل");
  assert.ok(info.reference && info.reference.length > 0);
  const plain = caseInfoFromCase({ id: "x", requester: {}, metadata: { court: "المحكمة التجارية" } });
  assert.equal(plain?.court, "المحكمة التجارية");
  assert.equal(plain?.circuit, null, "a classification is not a circuit");
  assert.equal(plain?.client, null);
  assert.equal(caseInfoFromCase(null), null);
});

test("N13: cells — Arabic digits, «—» where nothing is stored, no client-meeting address", () => {
  assert.deepEqual(hearingTableCells({ date: "2026-12-03", time: "09:30:00", location: "المحكمة العامة بالرياض", type: "hearing", caseInfo: null }),
    ["٠٣/١٢/٢٠٢٦", "٩:٣٠ ص", "المحكمة العامة بالرياض", "—", "—", "—"]);
  assert.deepEqual(hearingTableCells({ date: "2026-12-03", time: "13:05", location: "منزل العميل", type: "client_meet" }),
    ["٠٣/١٢/٢٠٢٦", "١:٠٥ م", "—", "—", "—", "—"]);
  const withCase = hearingTableCells({ date: "2026-12-04", time: null, location: "x", type: "hearing", caseInfo: { reference: "NZ-1", court: "المحكمة العمالية", circuit: null, client: "سالم" } });
  assert.deepEqual(withCase, ["٠٤/١٢/٢٠٢٦", "—", "المحكمة العمالية", "NZ-1", "سالم", "—"]);
});

test("N13: one sorted table block, and it survives the export wall as a Word table", () => {
  const blocks = hearingsTableBlocks([
    { date: "2026-12-05", time: "10:00", type: "hearing" },
    { date: "2026-12-04", time: "11:00", type: "hearing" },
  ], "كل جلسات المكتب");
  assert.equal(blocks[0].kind, "title");
  assert.equal(blocks[1].kind, "para");
  const table = blocks[2];
  assert.ok(table.kind === "table");
  assert.equal(table.rows[0][0], "٠٤/١٢/٢٠٢٦");
  const safe = exportableBlocks(blocks);
  assert.ok(safe.some((b) => b.kind === "table"));
  const xml = blocksToBodyXml(safe);
  assert.match(xml, /<w:tbl><w:tblPr><w:bidiVisual\/>/);
  assert.match(xml, /<w:trPr><w:tblHeader\/><\/w:trPr>/);
  assert.equal((xml.match(/<w:tr>/g) ?? []).length, 3);
  assert.equal((xml.match(/<w:tc>/g) ?? []).length, 18);
  assert.deepEqual(hearingsTableBlocks([]).map((b) => b.kind), ["title"]);
});

test("N13: the lawyer's printout and the firm page use the table; the firm read goes through the session", () => {
  const bar = repo("src/app/dashboard/lawyer/hearings/_HearingsExportBar.tsx");
  assert.match(bar, /return hearingsTableBlocks\(rows\);/);
  const route = repo("src/app/api/v1/firm/hearings/route.ts");
  assert.match(route, /query\.eq\("firm_id", firm\.id\)/);
  assert.ok(!route.includes("createServiceClient"));
  assert.match(repo("src/app/dashboard/firm/hearings/page.tsx"), /if \(!isDemoMode\) return <FirmHearingsLive \/>;/);
  assert.match(repo("src/app/api/v1/lawyer/hearings/_shared.ts"), /\.from\("service_requests"\)\s*\.select\("id, requester, metadata"\)/);
});
