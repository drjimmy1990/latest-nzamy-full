/**
 * S5-B9: button choices are radio groups and required dropzones take the
 * keyboard. The .tsx files cannot load under `node --test`, so this reads them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("StepIdentify: four radio groups, of which three are required (ruling R11: the legal branch is optional)", () => {
  const src = read("draft/steps/StepIdentify.tsx");
  assert.equal((src.match(/role="radiogroup"/g) ?? []).length, 4);
  assert.equal((src.match(/role="radiogroup"[^>]*aria-required="true"/g) ?? []).length, 3);
  assert.match(src, /role="radio"/);
  assert.match(src, /aria-checked=\{/);
  // Every radiogroup is named by its visible label.
  assert.equal((src.match(/role="radiogroup"[^>]*aria-labelledby=\{/g) ?? []).length, 4);
});

test("StepIdentify: «أخرى» and the committees sit in the legal branch's one group, and its text field keeps its keys", () => {
  const src = read("draft/steps/StepIdentify.tsx");
  const open = src.search(/<div role="radiogroup" aria-labelledby=\{branchLabelId\}/);
  const close = src.indexOf("{/* /radiogroup: legal branch */}");
  assert.ok(open > 0 && close > open);
  const group = src.slice(open, close);
  assert.match(group, /aria-checked=\{isOther\}/);
  assert.match(group, /LEGAL_BRANCHES_COMMITTEES\.map/);
  assert.match(src, /if \(index === -1\) return;/, "a key pressed in the «أخرى» text field is not a radio move");
});

test("the required dropzones take the keyboard", () => {
  for (const rel of ["contracts/steps/review/StepRUpload.tsx", "draft/steps/StepCase.tsx"]) {
    const src = read(rel);
    assert.match(src, /role="button"[\s\S]{0,120}tabIndex=\{0\}/, rel);
    assert.match(src, /onKeyDown=/, rel);
  }
});

test("StepCase: a chosen file's own buttons are not nested inside the dropzone button", () => {
  const src = read("draft/steps/StepCase.tsx");
  const dropzone = src.slice(src.indexOf('role="button"'), src.indexOf("ارفع ملف القضية") + 40);
  assert.doesNotMatch(dropzone, /<button|AttachmentPreviewButton/);
});
