/**
 * T28-22 / T28-27 source contract for the two other routes that shape official
 * law metadata with _official-meta.ts: GET /api/library/init (the catalogue)
 * and GET /api/library/enactments (the countdown widget). They import
 * next/server and "@/…" aliases, so this reads their source — same shape as
 * regulation-paywall.routes.test.ts. The masking itself is unit-tested in
 * _official-meta.test.ts, the window math in
 * src/lib/services/enactmentCountdown.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const initSource = readFileSync(new URL("../../init/route.ts", import.meta.url), "utf8");
const enactmentsSource = readFileSync(new URL("../../enactments/route.ts", import.meta.url), "utf8");

test("init: law rows are masked for non-subscribers and the envelope says so", () => {
  assert.match(initSource, /import \{ maskListOfficialFields, TIER_SHAPED_CACHE_CONTROL \} from "@\/app\/api\/library\/laws\/\[slug\]\/_official-meta";/);
  assert.match(initSource, /return \{ \.\.\.maskListOfficialFields\(shaped, hasFullAccess\), free: isFree, locked: !isFree \};/);
  // hasFullAccess here is getLibraryAccessForUser's tier >= pro — no whitelist.
  assert.match(initSource, /const \{ hasFullAccess, whitelistedSlugs, freeItemsByType \} = await getLibraryAccessForUser\(userId\);/);
  assert.match(initSource, /officialMetaLocked: !hasFullAccess,/);
  assert.match(initSource, /\{ headers: \{ "Cache-Control": TIER_SHAPED_CACHE_CONTROL \} \}/);
  // status stays in the card columns.
  assert.match(initSource, /const LAW_LIST_COLUMNS =\s*"[^"]*\bstatus\b[^"]*"/);
});

test("enactments: gated like every library route, tier-masked, private", () => {
  assert.match(enactmentsSource, /const gate = await libraryGate\(\);\s*if \(gate\) return gate;/);
  assert.match(enactmentsSource, /issuingInstrument: isSubscriber \? row\.issuing_instrument : null,/);
  assert.match(enactmentsSource, /gazetteIssueNumber: isSubscriber \? row\.gazette_issue_number : null,/);
  assert.match(enactmentsSource, /officialMetaLocked: !isSubscriber,/);
  assert.match(enactmentsSource, /\{ headers: \{ "Cache-Control": TIER_SHAPED_CACHE_CONTROL \} \}/);
  assert.match(enactmentsSource, /TIER_RANK\[await getUserTier\(userId\)\] \?\? 0\) >= TIER_RANK\.pro/);
});

test("enactments: upcoming stays > today; recent is [today-14, today], newest first — today belongs to recent", () => {
  // The window rules live in src/lib/library/enactmentFeed.ts (unit-tested
  // there). effective_date_gregorian is empty on every live law, so the route
  // must read the Hijri column through that helper, not filter on Gregorian.
  assert.ok(!enactmentsSource.includes('.gt("effective_date_gregorian"'));
  assert.ok(enactmentsSource.includes('likeYearClauses(["effective_date_hijri"], tokens)'));
  assert.ok(enactmentsSource.includes("const split = splitEnactments((data ?? []) as EnactmentRow[], now, LIST_LIMIT);"));
  // Backward compatible: `data` is still the upcoming list with daysRemaining.
  assert.ok(enactmentsSource.includes("daysRemaining: row.daysRemaining,"));
  assert.ok(enactmentsSource.includes("daysSinceEffective: row.daysSinceEffective,"));
  assert.match(enactmentsSource, /data: items,\s*recent: recentItems,/);
  // A failed read is an error, never a silently empty list.
  assert.match(enactmentsSource, /if \(error\) \{\s*console\.error\("\[library\/enactments\] query failed:"/);
});
