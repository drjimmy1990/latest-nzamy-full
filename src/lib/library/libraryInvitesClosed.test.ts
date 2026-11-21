/**
 * libraryInvitesClosed.test.ts — owner ٩٣ (batch l12): library invitation
 * codes and the colleague invitation are stopped; owner ٨٩: no plan except a
 * library plan opens the library. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/libraryInvitesClosed.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIBRARY_INVITES_CLOSED,
  LIBRARY_INVITES_CLOSED_AR,
  LIBRARY_INVITES_CLOSED_STATUS,
  libraryInvitesClosedBody,
} from "./libraryInvitesClosed.ts";
import { checkoutItemNotes } from "../payments/checkoutView.ts";
import { PAYABLE_ITEMS } from "../payments/catalog.ts";

const src = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...p), "utf8");

test("the doors are shut: 410 with an Arabic reason and a machine code", () => {
  assert.equal(LIBRARY_INVITES_CLOSED, true);
  assert.equal(LIBRARY_INVITES_CLOSED_STATUS, 410);
  assert.deepEqual(libraryInvitesClosedBody(), { error: LIBRARY_INVITES_CLOSED_AR, code: "library_invites_closed" });
  assert.doesNotMatch(LIBRARY_INVITES_CLOSED_AR, /[A-Za-z]/, "no technical words");
});

test("every invitation route answers the closed body before it reads or writes anything", () => {
  const cases: Array<[string[], string]> = [
    [["app", "api", "v1", "library", "invitations", "redeem", "route.ts"], "await assertRole()"],
    [["app", "api", "v1", "admin", "library-invitations", "route.ts"], "await request.json()"],
    [["app", "api", "v1", "invite", "[code]", "accept", "route.ts"], "await params"],
  ];
  for (const [path, firstWork] of cases) {
    const s = src(...path);
    const post = s.slice(s.indexOf("export async function POST"));
    const shut = post.indexOf("if (LIBRARY_INVITES_CLOSED) {");
    assert.ok(shut > 0, path.join("/"));
    assert.ok(shut < post.indexOf(firstWork), `${path.join("/")}: shut before ${firstWork}`);
    assert.match(post, /libraryInvitesClosedBody\(\), \{ status: LIBRARY_INVITES_CLOSED_STATUS \}/);
  }
  const lookup = src("app", "api", "v1", "invite", "[code]", "route.ts");
  assert.match(lookup, /if \(LIBRARY_INVITES_CLOSED\) \{\s*return NextResponse\.json\(\{ valid: false, reason: LIBRARY_INVITES_CLOSED_AR \}\);/);
  // the admin LIST stays (a record of the old codes)
  const admin = src("app", "api", "v1", "admin", "library-invitations", "route.ts");
  assert.doesNotMatch(admin.slice(admin.indexOf("export async function GET"), admin.indexOf("export async function POST")), /LIBRARY_INVITES_CLOSED/);
});

test("no screen offers a code or a colleague invite any more", () => {
  const page = src("app", "dashboard", "admin", "library-invitations", "page.tsx");
  assert.match(page, /\{!LIBRARY_INVITES_CLOSED && <button/);
  assert.match(page, /\{showForm && !LIBRARY_INVITES_CLOSED && \(/);
  assert.match(src("components", "InvitationBanner.tsx"), /const eligible = !LIBRARY_INVITES_CLOSED &&/);
  assert.match(src("app", "laws", "subscribe", "page.tsx"), /const canRedeemCode = !LIBRARY_INVITES_CLOSED &&/);
  assert.doesNotMatch(src("constants", "pricing", "pricing.library.ts"), /"[^"\n]*(دعوات|colleague invit|invitations for colleagues)[^"\n]*"/i);
});

test("owner ٨٩: a library plan's checkout says the 50-point rule; the quarterly one says the first question locks", () => {
  const q1 = checkoutItemNotes(PAYABLE_ITEMS["lib-q1"], { libraryMinPoints: 50, libraryQuestionPoints: 5 });
  assert.equal(q1.length, 2);
  assert.match(q1[1], /فأول سؤال مدفوع تطرحه ينزل رصيدك عن الحد/);
  const annual = checkoutItemNotes(PAYABLE_ITEMS["lib-annual"], { libraryMinPoints: 50, libraryQuestionPoints: 5 });
  assert.doesNotMatch(annual[1], /أول سؤال/);
  // gate off or not read: the old single line
  assert.equal(checkoutItemNotes(PAYABLE_ITEMS["lib-q1"], { libraryMinPoints: 0 }).length, 1);
  assert.equal(checkoutItemNotes(PAYABLE_ITEMS["lib-q1"]).length, 1);
});

test("owner ٨٩: the /laws/my «plan» block no longer says the library comes with a plan", () => {
  const block = src("app", "laws", "my", "_PlanBlock.tsx");
  assert.doesNotMatch(block, /يأتي ضمن باقتك الحالية/);
});
