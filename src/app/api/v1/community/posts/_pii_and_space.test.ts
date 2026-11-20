/**
 * S5-3 (mask before storing) and N05-C2 (verified firms in lawyers-only
 * content) on the community write routes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LINK_REFUSAL_AR, linkIssueIn } from "./_feed.ts";
import { LAWYERS_SPACE_REFUSAL_AR, lawyersSpaceFromRpc } from "./_lawyersSpace.ts";
import { maskCommunityPii } from "../../../../../lib/community/piiMask.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("linkIssueIn: links and handles are still refused; masked text and plain text pass", () => {
  assert.equal(linkIssueIn(["نص عادي", ["وسم"]]), null);
  assert.equal(linkIssueIn([maskCommunityPii("اتصل 0501234567 أو a@example.com").text]), null);
  assert.equal(linkIssueIn(["زر https://example.com"]), LINK_REFUSAL_AR);
  assert.equal(linkIssueIn(["عنوان", undefined, ["@lawyer_x"]]), LINK_REFUSAL_AR);
  // an amount is not a phone any more, so it is neither masked nor refused
  assert.equal(linkIssueIn([maskCommunityPii("قيمة العقد 500000000 ريال").text]), null);
});

test("lawyersSpaceFromRpc: the database decides; a missing function falls back; anything else refuses", () => {
  assert.equal(lawyersSpaceFromRpc(true, null), true);
  assert.equal(lawyersSpaceFromRpc(false, null), false);
  assert.equal(lawyersSpaceFromRpc("true", null), false, "only a real boolean true");
  assert.equal(lawyersSpaceFromRpc(null, { code: "PGRST202" }), "fallback");
  assert.equal(lawyersSpaceFromRpc(null, { code: "42883" }), "fallback");
  assert.equal(lawyersSpaceFromRpc(true, { code: "57014" }), false, "a timeout is a refusal");
  assert.equal(lawyersSpaceFromRpc(null, {}), false);
  assert.match(LAWYERS_SPACE_REFUSAL_AR, /المكاتب الموثّقة/);
});

test("the three write routes mask before they store, and no longer refuse a phone or e-mail", () => {
  const posts = read("./route.ts");
  const post = posts.slice(posts.indexOf("export async function POST("));
  assert.ok(post.indexOf("maskCommunityFields(") > -1);
  assert.ok(post.indexOf("maskCommunityFields(") < post.indexOf('.from("community_posts")'), "masked before the insert");
  assert.ok(post.includes("title: clean.title") && post.includes("body: clean.body") && post.includes("tags: clean.tags"));
  assert.ok(post.includes("maskedNotice: piiMaskedNoticeAr(masked)"));
  assert.equal(posts.includes("contactIssueIn"), false);

  const detail = read("./[id]/route.ts");
  const patch = detail.slice(detail.indexOf("export async function PATCH("));
  assert.ok(patch.indexOf("maskCommunityFields(") > -1);
  assert.ok(patch.indexOf("maskCommunityFields(") < patch.indexOf(".update(updates)"), "an edit is masked too");
  assert.ok(patch.includes("maskedNotice: piiMaskedNoticeAr(masked)"));
  assert.equal(detail.includes("contactIssueIn"), false);

  const answers = read("./[id]/answers/route.ts");
  assert.ok(answers.indexOf("maskCommunityPii(") > -1);
  assert.ok(answers.indexOf("maskCommunityPii(") < answers.indexOf('.from("community_answers")'));
  assert.ok(answers.includes("body: answerText,"));
  assert.ok(answers.includes("maskedNotice: piiMaskedNoticeAr(masked)"));
  assert.equal(answers.includes("contactIssueIn"), false);
});

test("lawyers-only posting and moving go through canUseLawyersSpace, not a lawyer-only lookup", () => {
  for (const rel of ["./route.ts", "./[id]/route.ts"]) {
    const src = read(rel);
    assert.ok(src.includes('visibility === "lawyers_only" && !(await canUseLawyersSpace(supabase, user.id))'), rel);
    assert.ok(src.includes("LAWYERS_SPACE_REFUSAL_AR"), rel);
    assert.equal(src.includes("متاح للمحامين الموثّقين فقط"), false, rel);
  }
  const space = read("./_lawyersSpace.ts");
  assert.ok(space.includes('rpc("community_lawyers_space_ok")'));
  // the answer badge is still the answering user's OWN lawyer file
  const answers = read("./[id]/answers/route.ts");
  assert.ok(answers.includes('const isLawyerVerified = lawyerProfile?.verification_status === "verified";'));
});
