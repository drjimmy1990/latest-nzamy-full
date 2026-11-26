/**
 * limitRefusal.test.ts — S9 and the firm seat cap (20261126_50): the
 * database's three tokens map to fixed Arabic sentences (403) with the link
 * the screen renders; nothing else does, and no error text leaks. The routes
 * that create a case, a client or a firm seat answer through it.
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/api/limitRefusal.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  BUSINESS_SEATS_CONTACT_HREF,
  BUSINESS_SEATS_FULL_AR,
  FIRM_SEATS_CONTACT_HREF,
  FIRM_SEATS_FULL_AR,
  FIRM_SEATS_LINK_AR,
  PLAN_LIMIT_AR,
  PLAN_LIMIT_LINK_AR,
  PLAN_LIMIT_UPGRADE_HREF,
  demoRefusal,
  limitLinkForMessage,
  limitRefusal,
  limitRefusalBody,
} from "./dbErrorCore.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const pg = (message: string) => ({ code: "P0001", message, details: "service_requests", hint: null });

test("each token 20261126_50 raises maps to its sentence, a 403 and its link", () => {
  const cases: Array<[string, string, string, string]> = [
    ["plan_limit:cases", PLAN_LIMIT_AR.cases, PLAN_LIMIT_UPGRADE_HREF, PLAN_LIMIT_LINK_AR],
    ["plan_limit:clients", PLAN_LIMIT_AR.clients, PLAN_LIMIT_UPGRADE_HREF, PLAN_LIMIT_LINK_AR],
    ["firm_seats_full", FIRM_SEATS_FULL_AR, FIRM_SEATS_CONTACT_HREF, FIRM_SEATS_LINK_AR],
    ["business_seats_full", BUSINESS_SEATS_FULL_AR, BUSINESS_SEATS_CONTACT_HREF, FIRM_SEATS_LINK_AR],
  ];
  for (const [token, text, href, label] of cases) {
    const r = limitRefusal(pg(token));
    assert.ok(r, token);
    assert.equal(r.status, 403);
    assert.equal(r.message, text);
    assert.equal(r.token, token);
    assert.equal(r.linkHref, href);
    assert.equal(r.linkLabel, label);
    const body = limitRefusalBody(r);
    assert.deepEqual(body, { error: text, code: token, linkHref: href, linkLabel: label });
    assert.ok(!JSON.stringify(body).includes("service_requests"), "no table name leaks");
  }
});

test("the owner's words: cases and clients are «إدارة المكتب» (س٢١٢), «اكتملت مقاعد المكتب», «لزيادة المقاعد تواصل معنا»", () => {
  assert.equal(PLAN_LIMIT_AR.cases, "إضافة القضايا وإدارتها متاحة في باقة «إدارة المكتب».");
  assert.equal(PLAN_LIMIT_AR.clients, "إضافة الموكلين وإدارتهم متاحة في باقة «إدارة المكتب».");
  // no number is promised: the free allowance is a database constant (0 / 0 by default)
  assert.doesNotMatch(PLAN_LIMIT_AR.cases + PLAN_LIMIT_AR.clients, /[0-9٠-٩]/);
  assert.match(FIRM_SEATS_FULL_AR, /^اكتملت مقاعد المكتب/);
  assert.equal(FIRM_SEATS_LINK_AR, "لزيادة المقاعد تواصل معنا");
  // the seat link reuses the pricing cards' sales link — extra seats are not sold online
  assert.equal(FIRM_SEATS_CONTACT_HREF, "/contact?type=firm-seats");
  assert.equal(PLAN_LIMIT_UPGRADE_HREF, "/pricing?audience=lawyers");
});

test("anything else is not a limit refusal (and the demo tokens stay the demo's)", () => {
  for (const m of [undefined, "", "plan_limit", "plan_limit:cases2", "firm_seats", "business_seats", "demo_account:limit:cases", "duplicate key"]) {
    assert.equal(limitRefusal(m === undefined ? {} : pg(m)), null, String(m));
  }
  assert.equal(limitRefusal(null), null);
  assert.equal(demoRefusal(pg("plan_limit:cases")), null);
});

test("20261206_70: the free allowance is one constant, 0 / 0, and the storage token is raised", () => {
  const sql = readFileSync(join(repo, "supabase/migrations/20261206_70_roles_office_plan.sql"), "utf8");
  assert.equal((sql.match(/select 0, 0;/g) ?? []).length, 1);
  assert.ok(sql.includes("raise exception 'storage_quota_full'"));
  const r = limitRefusal(pg("storage_quota_full"));
  assert.ok(r);
  assert.equal(r.status, 403);
  assert.equal(r.linkHref, PLAN_LIMIT_UPGRADE_HREF);
  assert.match(r.message, /سعة الحساب المجاني/);
  assert.deepEqual(limitLinkForMessage(r.message), { href: PLAN_LIMIT_UPGRADE_HREF, label: PLAN_LIMIT_LINK_AR });
});

test("the SQL raises exactly these tokens, and the limits were 5 / 10 (20261126_50) and 5 / 15", () => {
  const sql = readFileSync(join(repo, "supabase/migrations/20261126_50_accounts_limits.sql"), "utf8");
  for (const token of ["plan_limit:cases", "plan_limit:clients", "firm_seats_full"]) {
    assert.ok(sql.includes(`raise exception '${token}'`), token);
  }
  assert.match(sql, /select 5, 10;/);
  assert.match(sql, /when 'firm-enterprise' then 15/);
  assert.match(sql, /when 'firm-basic'\s+then 5/);
  // the company seat cap (20261129_10, owner file 15 row 36)
  const biz = readFileSync(join(repo, "supabase/migrations/20261129_10_firm_company_roles_seats.sql"), "utf8");
  assert.ok(biz.includes("raise exception 'business_seats_full'"));
  assert.match(BUSINESS_SEATS_FULL_AR, /^اكتملت مقاعد الشركة/);
});

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("dbErrorJson answers a limit refusal before its generic 500", () => {
  const src = stripComments(readFileSync(join(here, "dbError.ts"), "utf8"));
  const limitAt = src.indexOf("limitRefusal(err)");
  const genericAt = src.lastIndexOf("dbErrorBody(opts.message ?? DB_ERROR_AR");
  assert.ok(limitAt > 0 && genericAt > limitAt);
});

test("the create routes map the tokens instead of a generic 500", () => {
  const routes = [
    "src/app/api/v1/service-requests/route.ts",
    "src/app/api/v1/lawyer/clients/route.ts",
    "src/app/api/v1/lawyer/consultations/[id]/convert/route.ts",
    "src/app/api/v1/firm/members/route.ts",
    "src/app/api/v1/firm/members/[memberId]/route.ts",
    "src/app/api/v1/firm/invitations/route.ts",
    "src/app/api/v1/invite/team/[token]/route.ts",
    "src/app/api/v1/business/members/route.ts",
    "src/app/api/v1/business/members/[memberId]/route.ts",
  ];
  for (const r of routes) {
    const src = stripComments(readFileSync(join(repo, r), "utf8"));
    assert.ok(/limitRefusal\(/.test(src), `${r} calls limitRefusal`);
  }
  // the clients PATCH (un-archive) goes through the shared mapper
  const clients = stripComments(readFileSync(join(repo, "src/app/api/v1/lawyer/clients/route.ts"), "utf8"));
  const mapper = clients.slice(clients.indexOf("function dbErrorResponse"));
  assert.ok(mapper.indexOf("limitRefusal(error)") > 0 && mapper.indexOf("limitRefusal(error)") < mapper.indexOf('"23505"'));
});

test("a screen that only has the message text still finds the link", () => {
  assert.deepEqual(limitLinkForMessage(`تعذّر إضافة القضية: ${PLAN_LIMIT_AR.cases}`), { href: PLAN_LIMIT_UPGRADE_HREF, label: PLAN_LIMIT_LINK_AR });
  assert.deepEqual(limitLinkForMessage(PLAN_LIMIT_AR.clients), { href: PLAN_LIMIT_UPGRADE_HREF, label: PLAN_LIMIT_LINK_AR });
  assert.deepEqual(limitLinkForMessage(FIRM_SEATS_FULL_AR), { href: FIRM_SEATS_CONTACT_HREF, label: FIRM_SEATS_LINK_AR });
  assert.deepEqual(limitLinkForMessage(BUSINESS_SEATS_FULL_AR), { href: BUSINESS_SEATS_CONTACT_HREF, label: FIRM_SEATS_LINK_AR });
  for (const m of [null, undefined, "", "تعذّر حفظ الموكّل.", "بلغ الحساب التجريبي الحد الأقصى من القضايا (٥)."]) {
    assert.equal(limitLinkForMessage(m), null, String(m));
  }
});

test("the case, client and team screens render the link beside their error", () => {
  for (const f of [
    "src/app/dashboard/lawyer/_components/AddCaseModal.tsx",
    "src/components/dashboard/lawyer/AddClientModal.tsx",
    "src/app/dashboard/firm/team/page.tsx",
    "src/app/dashboard/firm/team/_components/FirmInviteLinks.tsx",
    "src/app/dashboard/business/team/page.tsx",
  ]) {
    assert.ok(readFileSync(join(repo, f), "utf8").includes("<LimitRefusalLink message={error} />"), f);
  }
});
