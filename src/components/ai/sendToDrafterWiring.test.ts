/**
 * sendToDrafterWiring.test.ts — N1.8 «إرسال النص المفرغ للصائغ القانوني».
 * The handoff logic is unit-tested in src/lib/ai/transcriptHandoff.test.ts;
 * this file checks how the .tsx files (which node --test cannot load) use it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../../lib/ui/darkModeScan.ts";

const SRC = join(import.meta.dirname, "../..");
const code = (rel: string) => stripComments(readFileSync(join(SRC, rel), "utf8"));

const BUTTON = "components/ai/SendToDrafterButton.tsx";
const DRAFT = "app/ai/draft/page.tsx";
const GATED = ["app/ai/transcriber/page.tsx", "app/ai/analyze/_components/AttachmentSqueezer.tsx"];

test("the button writes the session handoff, then opens the drafter in the same tab", () => {
  const body = code(BUTTON);
  assert.match(body, /from "@\/lib\/ai\/transcriptHandoff"/);
  assert.match(body, /writeTranscriptHandoff\(sessionStorageOrNull\(\), text, sourceLabel\)/);
  assert.match(body, /router\.push\(DRAFTER_TRANSCRIPT_URL\)/);
  assert.ok(body.indexOf("writeTranscriptHandoff(") < body.indexOf("router.push("), "write before navigating");
  assert.match(body, /if \(!result\.ok\)[\s\S]*?return;/, "a failed write must not navigate to an empty drafter");
  assert.match(body, /إرسال النص المفرّغ للصائغ القانوني/);
});

test("the button is disabled when there is no text, and is a real accessible button", () => {
  const body = code(BUTTON);
  assert.match(body, /const canSend = canSendToDrafter\(text\)/);
  assert.match(body, /disabled=\{!canSend\}/);
  assert.match(body, /aria-disabled=\{!canSend\}/);
  assert.match(body, /type="button"/);
  assert.match(body, /role="alert"/);
});

test("the transcript never touches localStorage or a new tab", () => {
  for (const rel of [BUTTON, DRAFT, "components/draft/TranscriptHandoffNotice.tsx", "lib/ai/transcriptHandoff.ts"]) {
    const body = code(rel);
    assert.ok(!body.includes("localStorage"), `${rel} uses localStorage`);
    assert.ok(!body.includes("_blank"), `${rel} opens a new tab (sessionStorage is per tab)`);
  }
});

test("the drafter consumes ?from=transcript in an effect, prefills the facts, and never submits", () => {
  const body = code(DRAFT);
  assert.match(body, /searchParams\.get\("from"\) === TRANSCRIPT_FROM_PARAM/);
  const effect = body.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[fromTranscript, setCaseText\]\);/);
  assert.ok(effect, "the consume effect is missing");
  const e = effect[0];
  assert.match(e, /consumeTranscriptHandoff\(sessionStorageOrNull\(\)\)/);
  assert.match(e, /if \(!fromTranscript\) \{\s*[\s\S]*?discardTranscriptHandoff\(sessionStorageOrNull\(\)\);\s*return;/,
    "a visit without ?from=transcript must drop a leftover transcript");
  assert.match(e, /if \(!handoff\) return;/, "nothing to consume must change nothing");
  assert.match(e, /setCaseText\(handoff\.text\)/);
  assert.match(e, /setPreMode\("draft"\)/);
  for (const forbidden of ["submitOrder", "nextStep", "setStep("]) {
    assert.ok(!e.includes(forbidden), `the consume effect must not call ${forbidden}`);
  }
  // Consumed only in the effect, never during render.
  assert.equal(body.split("consumeTranscriptHandoff(").length - 1, 1);
  assert.match(body, /<TranscriptHandoffNotice\b[\s\S]*?onDismiss=\{\(\) => setTranscriptNotice\(null\)\}/);
});

test("the notice tells the user to review the text and can be dismissed", () => {
  const body = code("components/draft/TranscriptHandoffNotice.tsx");
  assert.match(body, /هذا نص مُفرَّغ أُرسل من/);
  assert.match(body, /راجعه وعدّله قبل الصياغة/);
  assert.match(body, /role="status"/);
  assert.match(body, /aria-label="إخفاء التنبيه"/);
});

test("the gated «قريباً» tools still do not render the button", () => {
  for (const rel of GATED) {
    const body = code(rel);
    assert.ok(!body.includes("SendToDrafterButton"), `${rel} mounts SendToDrafterButton while gated`);
    assert.ok(!body.includes("transcriptHandoff"), `${rel} writes a handoff while gated`);
    assert.match(body, /<DashboardComingSoon\b/, `${rel} is no longer «قريباً»`);
    // …while the raw source carries the note that the button is ready to mount.
    assert.match(readFileSync(join(SRC, rel), "utf8"), /SendToDrafterButton\.tsx/);
  }
});

test("neither the drafter nor the gated tools import the button", () => {
  // Mounting it is the enabling change for a real transcript tool.
  const importers = [DRAFT, ...GATED].filter((rel) => /from "@\/components\/ai\/SendToDrafterButton"/.test(code(rel)));
  assert.deepEqual(importers, []);
});
