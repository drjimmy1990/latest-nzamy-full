import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  POST_ANSWERS_FK,
  LIST_SELECT,
  DETAIL_SELECT,
  visibilityForTab,
  dbCategoryFor,
  uiCategoryFor,
  embeddedCount,
  cleanText,
  cleanDetail,
  toFeedItem,
  contactIssueIn,
  FEED_ASKER,
} from "./_feed.ts";

test("both embeds name the post_id foreign key (PGRST201: two FKs join the tables)", () => {
  assert.equal(POST_ANSWERS_FK, "community_answers_post_id_fkey");
  assert.equal(LIST_SELECT, "*, community_answers!community_answers_post_id_fkey(count)");
  assert.equal(DETAIL_SELECT, "*, answers:community_answers!community_answers_post_id_fkey(*)");
});

test("no .select() literal anywhere in src embeds community_answers/community_posts without an FK hint", async () => {
  const SRC = path.resolve(process.cwd(), "src");
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes(".test.")) files.push(full);
    }
  };
  await walk(SRC);
  const offenders: string[] = [];
  const selectLiteral = /\.select\(\s*(["'`])([\s\S]*?)\1/g;
  const bareEmbed = /(?:^|[\s,:(])community_(answers|posts)\s*\(/;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const m of source.matchAll(selectLiteral)) {
      if (bareEmbed.test(m[2])) offenders.push(`${path.relative(SRC, file)}: ${m[2].slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("tab and visibility: the page's `lawyers` is the column's `lawyers_only`", () => {
  assert.equal(visibilityForTab("public"), "public");
  assert.equal(visibilityForTab("lawyers"), "lawyers_only");
  assert.equal(visibilityForTab("lawyers_only"), "lawyers_only");
  assert.equal(visibilityForTab("private"), "private");
  assert.equal(visibilityForTab(null), null);
  assert.equal(visibilityForTab("everyone"), null);
});

test("categories map between the UI ids and the CHECK list, both ways", () => {
  assert.equal(dbCategoryFor("real-estate"), "real_estate");
  assert.equal(dbCategoryFor("labor"), "labor");
  assert.equal(dbCategoryFor("civil"), "other");
  assert.equal(dbCategoryFor("all"), null);
  assert.equal(dbCategoryFor(""), null);
  assert.equal(dbCategoryFor("not-a-category"), null);
  assert.equal(uiCategoryFor("real_estate"), "real-estate");
  assert.equal(uiCategoryFor("other"), "civil");
  assert.equal(uiCategoryFor("general"), "general");
  for (const ui of ["labor", "commercial", "civil", "criminal", "family", "real-estate"]) {
    assert.equal(uiCategoryFor(dbCategoryFor(ui)), ui, ui);
  }
});

test("embeddedCount reads PostgREST's [{count}] and nothing else", () => {
  assert.equal(embeddedCount([{ count: 3 }]), 3);
  assert.equal(embeddedCount([]), 0);
  assert.equal(embeddedCount(undefined), 0);
  assert.equal(embeddedCount([{ count: "3" }]), 0);
});

test("cleanText removes contact without leaking a character or rewriting other digits", () => {
  assert.equal(cleanText("تابعني @ahmad_law الآن"), "تابعني [محذوف] الآن");
  assert.equal(cleanText("اتصل 501234567 الآن"), "اتصل [محذوف] الآن");
  assert.equal(cleanText("رقمي ٠٥٠١٢٣٤٥٦٧ والمادة ٧٤"), "رقمي [محذوف] والمادة ٧٤");
  assert.equal(cleanText("واتساب: 0501234567"), "[محذوف]");
  assert.equal(cleanText("راسلني a.b@example.com"), "راسلني [محذوف]");
  assert.equal(cleanText("المادة ١٨٧ من نظام المرافعات"), "المادة ١٨٧ من نظام المرافعات");
  assert.equal(cleanText(undefined), "");
});

// A row exactly as PostgREST returns it for LIST_SELECT.
const ROW = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  author_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "سؤال عن الإيجار — اتصلوا 0501234567",
  body: "تفاصيل",
  category: "real_estate",
  visibility: "lawyers_only",
  status: "active",
  is_pinned: false,
  vote_count: 4,
  answer_count: 0,
  view_count: 12,
  accepted_answer_id: null,
  tags: ["إيجار", "@handle_x"],
  metadata: {},
  created_at: "2026-10-16T08:00:00.000Z",
  updated_at: "2026-10-16T08:00:00.000Z",
  community_answers: [{ count: 3 }],
};

test("toFeedItem gives the feed the fields it filters, counts and prints", () => {
  const item = toFeedItem(ROW);
  assert.equal(item.id, ROW.id);
  assert.equal(item.tab, "lawyers");
  assert.equal(item.visibility, "lawyers_only");
  assert.equal(item.category, "real-estate");
  assert.equal(item.title, "سؤال عن الإيجار — اتصلوا [محذوف]");
  assert.deepEqual(item.tags, ["إيجار", "[محذوف]"]);
  assert.equal(item.answerCount, 3, "the embed count, not the never-maintained answer_count column");
  assert.deepEqual(item.answers, []);
  assert.equal(item.isAnswered, true);
  assert.equal(item.views, 12);
  assert.equal(item.votes, 4);
  assert.equal(item.asker, FEED_ASKER);
  assert.equal(item.createdAt, ROW.created_at);
  assert.equal("author_id" in item, false, "the list does not hand out author ids");
});

test("a public row with no answers is public, unanswered, and keeps an empty body out", () => {
  const item = toFeedItem({ ...ROW, visibility: "public", body: "  ", community_answers: [{ count: 0 }] });
  assert.equal(item.tab, "public");
  assert.equal(item.isAnswered, false);
  assert.equal(item.body, undefined);
});

test("cleanDetail filters the post and every answer body, and leaves the rest alone", () => {
  const post = cleanDetail({
    id: "p1",
    title: "عنوان",
    body: "راسلني على x@y.com",
    tags: ["وسم"],
    view_count: 2,
    answers: [
      { id: "a1", body: "واتساب ٠٥٠١٢٣٤٥٦٧", is_lawyer_verified: true },
      { id: "a2", body: "المادة ٧٤" },
    ],
  });
  assert.equal(post.body, "راسلني على [محذوف]");
  assert.equal(post.view_count, 2);
  const answers = post.answers as { id: string; body: string; is_lawyer_verified?: boolean }[];
  assert.equal(answers[0].body, "[محذوف]");
  assert.equal(answers[0].is_lawyer_verified, true);
  assert.equal(answers[1].body, "المادة ٧٤");
});

test("contactIssueIn refuses the first value carrying contact, strings or lists", () => {
  assert.equal(contactIssueIn(["عنوان", "نص عادي", ["وسم"]]), null);
  assert.match(contactIssueIn(["عنوان", "اتصل 0501234567"]) ?? "", /رقم هاتف/);
  assert.match(contactIssueIn(["عنوان", undefined, ["@lawyer_x"]]) ?? "", /معرّف حساب/);
});
