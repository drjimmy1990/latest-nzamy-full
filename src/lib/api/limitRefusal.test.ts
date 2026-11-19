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

test("the owner's words: 5 cases, 10 clients, «اكتملت مقاعد المكتب», «لزيادة المقاعد تواصل معنا»", () => {
  assert.match(PLAN_LIMIT_AR.cases, /٥ قضايا نشطة/);
  assert.match(PLAN_LIMIT_AR.clients, /١٠ موكلين/);
  assert.match(FIRM_SEATS_FULL_AR, /^اكتملت مقاعد المكتب/);
  assert.equal(FIRM_SEATS_LINK_AR, "لزيادة المقاعد تواصل معنا");
  // the seat link reuses the pricing cards' sales link — extra seats are not sold online
  assert.equal(FIRM_SEATS_CONTACT_HREF, "/contact?type=firm-seats");
  assert.equal(PLAN_LIMIT_UPGRADE_HREF, "/pricing");
});

test("anything else is not a limit refusal (and the demo tokens stay the demo's)", () => {
  for (const m of [undefined, "", "plan_limit", "plan_limit:cases2", "firm_seats", "business_seats", "demo_account:limit:cases", "duplicate key"]) {
    assert.equal(limitRefusal(m === undefined ? {} : pg(m)), null, String(m));
  }
  assert.equal(limitRefusal(null), null);
  assert.equal(demoRefusal(pg("plan_limit:cases")), null);
});

test("the SQL raises exactly these tokens, and the limits are 5 / 10 and 5 / 15", () => {
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
