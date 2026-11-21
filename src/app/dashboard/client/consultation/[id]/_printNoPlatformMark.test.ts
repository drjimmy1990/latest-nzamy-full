/**
 * Q117 (batch l12; owner F01 #117 default): the client's printed and copied
 * consultation request carries no platform name or mark (decision ٤٤٢ extended
 * to the client copy). The calendar text was already white-label
 * (src/lib/calendar/calendarFeed.ts: only the hidden PRODID / UID host name it).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync("src/app/dashboard/client/consultation/[id]/page.tsx", "utf8").replace(/\r\n/g, "\n");

test("Q117: the copy text and the print window name no platform", () => {
  const from = src.indexOf("const handleCopyReport = () => {");
  const to = src.indexOf("printWindow.document.close();");
  assert.ok(from > 0 && to > from);
  const exported = src.slice(from, to).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  assert.equal(/نظامي|Nezamy|NZAMY/i.test(exported), false);
  assert.match(exported, /ليست رأياً قانونياً/);
});

test("Q117: the calendar file names no platform in what a calendar shows", () => {
  const ics = readFileSync("src/lib/calendar/hearingIcs.ts", "utf8");
  const visible = ics.split("\n").filter((l) => /SUMMARY|DESCRIPTION|LOCATION|X-WR-CALNAME/.test(l)).join("\n");
  assert.equal(/نظامي/.test(visible), false);
});
