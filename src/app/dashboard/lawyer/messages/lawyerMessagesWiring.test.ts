/**
 * lawyerMessagesWiring.test.ts — old owner note ب8 (file 10): a client's message
 * and a client's review must reach the lawyer. The .tsx pages cannot be loaded by
 * node --test, so this checks how they are wired.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../../../../lib/ui/darkModeScan.ts";

const SRC = join(import.meta.dirname, "../../../..");
const code = (rel: string) => stripComments(readFileSync(join(SRC, rel), "utf8"));

test("the lawyer's messages page reads and writes the request chat rooms through useChat", () => {
  const body = code("app/dashboard/lawyer/messages/page.tsx");
  assert.match(body, /from "@\/hooks\/useChat"/);
  assert.match(body, /chat\.sendMessage\(text\)/);
  // A failed read is said, never shown as an empty inbox.
  assert.match(body, /roomsState === "unreadable"/);
  assert.match(body, /messagesState === "unreadable"/);
  // A failed send keeps the draft and says it did not arrive.
  assert.match(body, /catch \{\s*setSendError\(/);
  assert.doesNotMatch(body, /DashboardComingSoon/);
});

test("«الاستشارات» opens the messages page (no new sidebar row)", () => {
  assert.match(code("app/dashboard/lawyer/consultations/page.tsx"), /href="\/dashboard\/lawyer\/messages"/);
  const sidebars = code("constants/navigation.sidebars.legal.ts");
  assert.doesNotMatch(sidebars, /\/dashboard\/lawyer\/messages/);
});

test("the reviews page shows the real reviews, and a new review's notification opens it", () => {
  const page = code("app/dashboard/lawyer/reviews/page.tsx");
  assert.match(page, /<ReviewsPanel isDark=\{isDark\} \/>/);
  assert.doesNotMatch(page, /DashboardComingSoon/);
  assert.match(code("app/api/v1/reviews/route.ts"), /href: "\/dashboard\/lawyer\/reviews"/);
});
