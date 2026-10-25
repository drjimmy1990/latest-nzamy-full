/**
 * Source pins for N3.7 (a .tsx cannot load under node --test): the activity
 * page is three accessible tabs with the office tab for firm members only,
 * the case file has the timeline tab, and the ledger has no delete anywhere.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the activity page renders the three tabs around the existing personal feed", () => {
  const page = read("app/dashboard/lawyer/activity/page.tsx");
  assert.match(page, /return <ActivityTabs personal=\{<PersonalActivityFeed \/>\} \/>;/);
  const tabs = read("app/dashboard/lawyer/activity/_components/ActivityTabs.tsx");
  for (const label of ["نشاطي الشخصي", "نشاط المكتب وفريق العمل", "الصادر والوارد القانوني"]) assert.ok(tabs.includes(label), label);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{selected\}/);
  assert.match(tabs, /role="tabpanel"/);
  assert.match(tabs, /t\.id !== "office" \|\| isMember === true/, "the office tab only for an active firm member");
});

test("the ledger tab filters by direction, channel and case, and archives instead of deleting", () => {
  const tab = read("components/dashboard/ledger/LedgerTab.tsx");
  assert.match(tab, /setDirection/);
  assert.match(tab, /setChannel/);
  assert.match(tab, /<CasePicker/);
  assert.match(tab, /archived: !e\.archived/);
  assert.doesNotMatch(tab, /deleteLedger|"DELETE"/);
  assert.doesNotMatch(read("lib/services/ledgerService.ts"), /"DELETE"/);
  assert.doesNotMatch(read("app/api/v1/lawyer/ledger/[id]/route.ts"), /export async function DELETE/);
  assert.doesNotMatch(read("app/api/v1/lawyer/ledger/route.ts"), /export async function DELETE/);
});

test("the case file has the timeline tab with «إضافة قيد صادر / وارد»", () => {
  const page = read("app/dashboard/lawyer/cases/[id]/page.tsx");
  assert.match(page, /\{ id: "timeline",\s+label: "السجل الزمني"/);
  assert.match(page, /activeTab === "timeline" && <CaseTimeline caseId=\{id\} isDark=\{isDark\} \/>/);
  assert.match(read("components/dashboard/caseTimeline/CaseTimeline.tsx"), /إضافة قيد صادر \/ وارد/);
});

test("ledger, office and timeline routes read with the session (RLS); the firm comes from the case", () => {
  for (const f of ["app/api/v1/lawyer/ledger/route.ts", "app/api/v1/lawyer/ledger/[id]/route.ts", "app/api/v1/lawyer/activity/office/route.ts", "app/api/v1/cases/[id]/timeline/route.ts"]) {
    assert.ok(existsSync(join(SRC, f)), f);
    const src = read(f);
    assert.match(src, /assertCaseWorker\(\)/, f);
    assert.doesNotMatch(src, /createServiceClient/, f);
  }
  const post = read("app/api/v1/lawyer/ledger/route.ts");
  assert.match(post, /firm_id: firmId,/);
  assert.match(post, /const firmId = \(caseRow as \{ firm_id: string \| null \}\)\.firm_id \?\? null;/);
  assert.match(read("app/api/v1/lawyer/activity/office/route.ts"), /\.in\("actor_user_id", memberIds\)/, "planted rows from outside the firm stay out of the office tab");
});

test("nothing in the N3.7 screens keeps data in the browser", () => {
  for (const f of ["components/dashboard/ledger/LedgerTab.tsx", "components/dashboard/ledger/LedgerEntryModal.tsx", "components/dashboard/activity/OfficeActivityTab.tsx", "components/dashboard/caseTimeline/CaseTimeline.tsx", "app/dashboard/lawyer/activity/_components/ActivityTabs.tsx"]) {
    assert.doesNotMatch(read(f), /localStorage|sessionStorage/, f);
  }
});
