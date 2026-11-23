/**
 * listenVoice.test.ts — owner Q182 (batch l13): «استمع للإجابة», free, the
 * browser's speech synthesis; the voice an admin setting (default: the
 * browser's first ar-SA voice).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/listenVoice.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LISTEN_COPY,
  LISTEN_VOICE_DEFAULT,
  LISTEN_VOICE_NAME_MAX,
  LISTEN_VOICE_SETTING,
  SPEECH_CHUNK_MAX,
  arabicVoices,
  listenVoiceSettingIssue,
  parseListenVoice,
  pickVoice,
  speechChunks,
} from "./listenVoice.ts";

const V = (name: string, lang: string) => ({ name, lang });
const VOICES = [V("Google US English", "en-US"), V("Maged", "ar-EG"), V("Microsoft Hamed", "ar-SA"), V("Microsoft Zariyah", "ar-SA"), V("Tarik", "ar_SA")];

test("the setting: {voice} parsed, the default is the empty name (the first ar-SA voice)", () => {
  assert.equal(LISTEN_VOICE_SETTING, "listen_voice");
  assert.equal(LISTEN_VOICE_DEFAULT, "");
  assert.equal(parseListenVoice({ voice: "Microsoft Zariyah" }), "Microsoft Zariyah");
  assert.equal(parseListenVoice({ voice: "  Maged " }), "Maged");
  for (const bad of [null, undefined, "Maged", [], {}, { voice: 5 }, { voice: "x".repeat(LISTEN_VOICE_NAME_MAX + 1) }, { voice: "a\u0007b" }]) {
    assert.equal(parseListenVoice(bad), "", JSON.stringify(bad));
  }
});

test("the admin validator: exactly {voice: string}, at most 120 characters, no control characters", () => {
  assert.equal(listenVoiceSettingIssue({ voice: "" }), null);
  assert.equal(listenVoiceSettingIssue({ voice: "Microsoft Hamed - Arabic (Saudi Arabia)" }), null);
  for (const bad of [null, "x", [], { voice: 1 }, { voice: "a", extra: 1 }, { name: "a" }, { voice: "x".repeat(121) }, { voice: "a\nb" }]) {
    assert.notEqual(listenVoiceSettingIssue(bad), null, JSON.stringify(bad));
  }
});

test("pickVoice: the admin's voice when present, else the first ar-SA, else any Arabic, else null", () => {
  assert.equal(pickVoice(VOICES, "Microsoft Zariyah")?.name, "Microsoft Zariyah");
  assert.equal(pickVoice(VOICES, "microsoft zariyah")?.name, "Microsoft Zariyah", "case-insensitive second try");
  assert.equal(pickVoice(VOICES, "")?.name, "Microsoft Hamed", "the default: the browser's FIRST ar-SA voice");
  assert.equal(pickVoice(VOICES, "Not On This Device")?.name, "Microsoft Hamed");
  assert.equal(pickVoice([V("Tarik", "ar_SA"), V("Maged", "ar-EG")], "")?.name, "Tarik", "ar_SA (Android) is ar-SA");
  assert.equal(pickVoice([V("en", "en-US"), V("Maged", "ar-EG")], "")?.name, "Maged");
  assert.equal(pickVoice([V("en", "en-US"), V("Arabic", "ar")], "")?.name, "Arabic");
  assert.equal(pickVoice([V("en", "en-US"), V("Armenian", "hy-AM"), V("ar-ish", "arn-CL")], ""), null, "arn (Mapudungun) is not Arabic");
  assert.equal(pickVoice([], "Maged"), null);
});

test("arabicVoices: the admin's list — Arabic only, ar-SA first, no duplicates", () => {
  assert.deepEqual(arabicVoices([...VOICES, V("Maged", "ar-EG")]).map((v) => v.name), ["Microsoft Hamed", "Microsoft Zariyah", "Tarik", "Maged"]);
});

test("speechChunks: read as a lawyer reads it, markers out, pieces at most 220 characters, nothing lost", () => {
  const chunks = speechChunks("يستحق العامل المكافأة وفق م/84 [S1]. وتُحسب على الأجر الأخير [S2].\n**ملاحظة**: راجع محامياً.");
  assert.ok(chunks.length >= 1);
  const all = chunks.join(" ");
  assert.match(all, /المادة الرابعة والثمانين/);
  assert.doesNotMatch(all, /\[S\d\]|\*\*/);
  assert.match(all, /راجع محامياً/);
  const long = Array.from({ length: 40 }, (_, i) => `جملة رقم ${i} في نص طويل جداً، تتكرر للتجربة`).join("، ") + ".";
  const parts = speechChunks(long);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= SPEECH_CHUNK_MAX, `${p.length}`);
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long.replace(/\s+/g, " "), "every word kept, in order");
  assert.deepEqual(speechChunks(""), []);
  assert.deepEqual(speechChunks(undefined as never), []);
});

test("copy: the owner's button words, Arabic only", () => {
  assert.equal(LISTEN_COPY.listen, "استمع للإجابة");
  for (const t of Object.values(LISTEN_COPY)) assert.doesNotMatch(t, /[A-Za-z]/);
});

test("source contract: the button speaks in the browser only (free), reads the voice setting, cancels on unmount", () => {
  const btn = readFileSync("src/components/ai/ListenButton.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.match(btn, /window\.speechSynthesis/);
  assert.match(btn, /new SpeechSynthesisUtterance\(/);
  assert.match(btn, /pickVoice\(voices, wanted\)/);
  assert.match(btn, /speechChunks\(text\)/);
  assert.match(btn, /fetch\("\/api\/v1\/ai\/listen-voice"/);
  assert.doesNotMatch(btn, /\/api\/v1\/ai\/runs|runClient|useAiRun/, "listening charges nothing and starts no run");
  assert.match(btn, /return \(\) => \{[^}]*stopOwned\(\)/);
  const route = readFileSync("src/app/api/v1/ai/listen-voice/route.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(route, /\.eq\("key", LISTEN_VOICE_SETTING\)/);
  assert.match(route, /parseListenVoice\(/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  // the two places the owner named
  assert.match(readFileSync("src/app/laws/research/_components/ResearchAnswerActions.tsx", "utf8"), /<ListenButton text=\{text\}/);
  assert.match(readFileSync("src/components/chatbot/SiteAssistantWidget.tsx", "utf8"), /<ListenButton text=\{m\.text\}/);
  // the admin may set it (validated + audited by the settings route)
  const settings = readFileSync("src/app/api/v1/admin/settings/route.ts", "utf8");
  assert.match(settings, /"listen_voice",/);
  assert.match(settings, /listen_voice: listenVoiceSettingIssue,/);
});
