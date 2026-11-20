import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRM_INVITE_DAILY_CAP,
  firmInviteEmailMessage,
  firmInviteSubjectId,
  firmInviteSubjectPrefix,
  inviteAddressHash,
} from "./firmInviteEmail.ts";

const TOKEN = "a".repeat(32) + "b".repeat(32);
const PATH = `/invite/team/${TOKEN}`;
const ENV = { NEXT_PUBLIC_SITE_URL: "https://example.test" };
const FIRM = "11111111-1111-1111-1111-111111111111";
const INV = "22222222-2222-2222-2222-222222222222";

test("the log subject holds neither the address nor the token, and is stable per firm + address", () => {
  const id = firmInviteSubjectId(FIRM, "Invitee@Example.test", INV);
  assert.doesNotMatch(id, /@|invitee|example/i);
  assert.equal(id.includes(TOKEN), false);
  assert.ok(id.startsWith(firmInviteSubjectPrefix(FIRM, "invitee@example.test")), "case-insensitive address");
  assert.ok(id.endsWith(`:${INV}`));
  assert.ok(id.length <= 200);
  assert.equal(inviteAddressHash("a@b.test"), inviteAddressHash(" A@B.test "));
  assert.notEqual(inviteAddressHash("a@b.test"), inviteAddressHash("c@b.test"));
  assert.doesNotMatch(firmInviteSubjectPrefix(FIRM, "x@y.test"), /[%_]/, "safe inside a LIKE pattern");
  assert.equal(FIRM_INVITE_DAILY_CAP, 3);
});

test("the e-mail carries the link in its body only — never in the subject", () => {
  const m = firmInviteEmailMessage(
    { firmName: "مكتب العدل للمحاماة", roleLabel: "محامٍ", path: PATH, expiresAt: "2026-11-27T10:00:00Z" },
    ENV,
  );
  assert.ok(m);
  assert.equal(m.subject.includes(TOKEN), false);
  assert.match(m.text, new RegExp(`https://example\\.test/invite/team/${TOKEN}`));
  assert.match(m.html, new RegExp(`href="https://example\\.test/invite/team/${TOKEN}"`));
  assert.match(m.text, /«مكتب العدل للمحاماة»/);
  assert.match(m.text, /«محامٍ»/);
  assert.match(m.text, /٢٠٢٦-١١-٢٧/);
  assert.match(m.text, /لا تُنشأ أي عضوية دون قبولك/);
});

test("no https site origin → no e-mail; a missing firm name or role falls back; markup is escaped", () => {
  assert.equal(firmInviteEmailMessage({ firmName: "x", roleLabel: "y", path: PATH, expiresAt: null }, {}), null);
  assert.equal(
    firmInviteEmailMessage({ firmName: "x", roleLabel: "y", path: PATH, expiresAt: null }, { NEXT_PUBLIC_SITE_URL: "http://example.test" }),
    null,
  );
  const m = firmInviteEmailMessage({ firmName: null, roleLabel: "", path: PATH, expiresAt: "bad" }, ENV);
  assert.ok(m);
  assert.match(m.text, /«مكتب محاماة»/);
  assert.match(m.text, /«عضو في الفريق»/);
  assert.doesNotMatch(m.text, /تنتهي صلاحية الدعوة/);
  const x = firmInviteEmailMessage({ firmName: "<script>x</script>", roleLabel: "r", path: PATH, expiresAt: null }, ENV);
  assert.ok(x && !x.html.includes("<script>"));
});
