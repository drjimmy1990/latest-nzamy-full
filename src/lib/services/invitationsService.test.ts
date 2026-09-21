/**
 * invitationsService.test.ts — the pure half of the invitation client, plus a
 * source contract for the parts that only exist as code.
 *
 * Review 2026-09-21 A5 / F03. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/invitationsService.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INVITATION_KINDS,
  answerPath,
  inviterNameAr,
  invitationKindLabelAr,
  type PendingInvitation,
} from "./invitationsService.ts";
import { listFromApi, listViewState, itemsOf } from "./listRead.ts";

const serviceSource = readFileSync(new URL("./invitationsService.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);
const bannerSource = readFileSync(
  new URL("../../components/dashboard/PendingInvitationsBanner.tsx", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

// ── the two kinds ───────────────────────────────────────────────────────────

test("the kinds are exactly the two entity types with a roster route", () => {
  // government_members / ngo_members took the same accept arm in 20260922_02,
  // but nothing in the product writes an invitation to either, so listing them
  // would be listing a state that cannot occur.
  assert.deepEqual([...INVITATION_KINDS], ["business", "firm"]);
});

// ── answerPath ──────────────────────────────────────────────────────────────

test("an answer is POSTed under /api/v1/me/invitations/{kind}/{id}/{answer}", () => {
  assert.equal(
    answerPath("business", "11111111-2222-3333-4444-555555555555", "accept"),
    "/api/v1/me/invitations/business/11111111-2222-3333-4444-555555555555/accept",
  );
  assert.equal(
    answerPath("firm", "abc", "decline"),
    "/api/v1/me/invitations/firm/abc/decline",
  );
});

test("the id is URL-encoded, so a crafted value cannot walk out of its segment", () => {
  const crafted = "../../../admin/users";
  const path = answerPath("firm", crafted, "accept");
  assert.equal(path, "/api/v1/me/invitations/firm/..%2F..%2F..%2Fadmin%2Fusers/accept");
  assert.ok(!path.includes("/admin/"), "the crafted id escaped its path segment");
  // and a query string cannot be smuggled in either
  assert.ok(!answerPath("firm", "x?select=*", "accept").includes("?"));
});

// ── the Arabic the banner prints ────────────────────────────────────────────

const base: PendingInvitation = {
  id: "m1",
  kind: "business",
  entityId: "b1",
  entityName: "شركة الأفق",
  role: "employee",
  roleLabel: "موظف عام",
  invitedAt: "2026-09-22T08:00:00.000Z",
};

test("a readable entity name is printed as-is", () => {
  assert.equal(inviterNameAr(base), "شركة الأفق");
  assert.equal(inviterNameAr({ ...base, kind: "firm", entityName: "مكتب البيان" }), "مكتب البيان");
});

test("a null name says «we could not read it» — it never becomes a dash or an empty name", () => {
  // An invitee cannot read business_profiles/firm_profiles for themselves, so
  // null here is a read failure, not an unnamed company. Printing «—» would
  // make «we do not know who is asking» look like «nobody is asking».
  const business = inviterNameAr({ ...base, entityName: null });
  const firm = inviterNameAr({ ...base, kind: "firm", entityName: null });
  for (const s of [business, firm]) {
    assert.ok(/[؀-ۿ]/.test(s), s);
    assert.ok(s.includes("تعذّرت قراءة الاسم"), s);
    assert.notEqual(s.trim(), "—");
    assert.notEqual(s.trim(), "");
  }
  assert.ok(business.startsWith("شركة"));
  assert.ok(firm.startsWith("مكتب محاماة"));
});

test("an empty-string name is treated as unreadable too, not printed as a blank inviter", () => {
  assert.ok(inviterNameAr({ ...base, entityName: "" }).includes("تعذّرت قراءة الاسم"));
});

test("both kind labels are Arabic and distinct", () => {
  assert.equal(invitationKindLabelAr("business"), "شركة");
  assert.equal(invitationKindLabelAr("firm"), "مكتب محاماة");
  for (const kind of INVITATION_KINDS) {
    assert.ok(/[؀-ۿ]/.test(invitationKindLabelAr(kind)), kind);
  }
});

// ── the read contract ───────────────────────────────────────────────────────

test("a failed list read is `unreadable`, never «you have no invitations»", () => {
  // The whole point of A5: a pending invitation is a consent decision. An
  // unreadable list rendered as an empty one hides one silently.
  assert.equal(listViewState(false, listFromApi<PendingInvitation>(null)), "unreadable");
  assert.equal(listViewState(false, listFromApi<PendingInvitation>({ degraded: true })), "unreadable");
  assert.equal(listViewState(false, listFromApi<PendingInvitation>({} as never)), "unreadable");
  const ok = listFromApi<PendingInvitation>({ data: [base], total: 1 });
  assert.equal(listViewState(false, ok), "ready");
  assert.equal(itemsOf(ok)[0].id, "m1");
  assert.equal(listViewState(false, listFromApi<PendingInvitation>({ data: [], total: 0 })), "empty");
});

test("the service maps the endpoint through listFromApi, not through a catch that returns []", () => {
  assert.match(serviceSource, /return listFromApi\(body\);/);
  assert.match(serviceSource, /return listFailed<PendingInvitation>\(\);/);
  assert.doesNotMatch(serviceSource, /catch[\s\S]{0,80}?return \[\];/);
});

test("the writes throw rather than resolving on an answer the server did not confirm", () => {
  assert.match(serviceSource, /if \(res\?\.data\?\.status !== "active"\) throw new Error/);
  assert.match(serviceSource, /if \(res\?\.data\?\.status !== "removed"\) throw new Error/);
});

// ── the banner ──────────────────────────────────────────────────────────────

test("the banner renders nothing while loading and nothing when there is none", () => {
  assert.match(bannerSource, /if \(view === "loading" \|\| view === "empty"\) return null;/);
});

test("the banner surfaces an unreadable list instead of staying silent", () => {
  assert.match(bannerSource, /if \(view === "unreadable"\)/);
  assert.ok(bannerSource.includes("تعذّرت قراءة دعوات الانضمام"));
  assert.ok(bannerSource.includes("إعادة المحاولة"));
});

test("the banner offers both answers, in Arabic", () => {
  assert.ok(bannerSource.includes("قبول"));
  assert.ok(bannerSource.includes("رفض"));
  assert.match(bannerSource, /acceptInvitation\(invitation\.kind, invitation\.id\)/);
  assert.match(bannerSource, /declineInvitation\(invitation\.kind, invitation\.id\)/);
});

test("accepting re-reads the session, because joining an entity changes what the guards decide", () => {
  // useUser() exposes no refresh (src/hooks/useUser.ts ends `{ ...session,
  // isDemoBypass, loading }`), so a full reload is the honest option.
  assert.match(bannerSource, /window\.location\.reload\(\);/);
});

test("the banner keeps nothing in the browser — an unanswered invitation lives in the database", () => {
  // The USE of the APIs, not the word: the file's header says «No localStorage»
  // on purpose and that sentence must not be what makes this pass.
  assert.doesNotMatch(bannerSource, /localStorage\s*[.[]/);
  assert.doesNotMatch(bannerSource, /sessionStorage\s*[.[]/);
  assert.doesNotMatch(bannerSource, /indexedDB\s*[.[]/);
});

test("the banner is mounted on every dashboard an invitable account lands on", () => {
  // Without this, an edit that drops the component leaves the whole consent
  // flow dark and the suite green: invitations keep being written and nobody
  // is ever shown one. `individual` → /dashboard/client and `lawyer` →
  // /dashboard/lawyer are the two hrefs the roster routes notify to.
  //
  // `corporate` → /dashboard/business is the third, and it is the one that
  // looks unnecessary until you name the case: a company account owns ITS
  // OWN company, and ANOTHER company — or a law firm — can still invite it to
  // their roster. dashboardPathFor("corporate") sends that account here and
  // nowhere else, so an invitation it is entitled to answer had no screen to
  // be answered on. Review 2026-09-21 A5 blocker / B3.
  for (const rel of [
    "../../app/dashboard/client/page.tsx",
    "../../app/dashboard/lawyer/page.tsx",
    "../../app/dashboard/business/page.tsx",
  ]) {
    const page = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.match(page, /<PendingInvitationsBanner \/>/, rel);
    assert.match(
      page,
      /import PendingInvitationsBanner from "@\/components\/dashboard\/PendingInvitationsBanner";/,
      rel,
    );
  }
});

test("no «قريباً» anywhere in this feature's client code", () => {
  for (const source of [serviceSource, bannerSource]) {
    assert.doesNotMatch(source, /قريبا/);
  }
});
