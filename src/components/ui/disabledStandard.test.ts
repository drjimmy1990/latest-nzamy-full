/**
 * Owner decision ١٣ (2026-10-06): every disabled button at 50% opacity with a
 * not-allowed cursor, and a tooltip giving the reason. Source checks — the
 * CSS and the .tsx files cannot be loaded by `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("globals.css: disabled buttons are 50% / not-allowed, and the unlayered rule beats the utilities", () => {
  const css = read("app/globals.css");
  const at = css.indexOf("Disabled buttons — one look everywhere (owner decision ١٣");
  assert.ok(at > 0, "the block is present");
  const block = css.slice(at);
  // 1. the default, inside @layer base
  assert.match(block, /@layer base \{\n  button:disabled,[\s\S]*?\{\n    opacity: 0\.5;\n    cursor: not-allowed;\n  \}\n\}/);
  // 2. unlayered: the cursor on every disabled button …
  assert.match(block, /\n\nbutton:disabled,\nbutton\[aria-disabled="true"\],[\s\S]*?\{\n  cursor: not-allowed;\n\}/);
  // … and 0.5 over every per-button `disabled:opacity-NN` variant.
  assert.match(block, /\nbutton:disabled\[class\*="disabled:opacity-"\],[\s\S]*?\{\n  opacity: 0\.5;\n\}/);
});

test("DisabledReason: hover + keyboard tooltip, scoped to its own named group", () => {
  const src = read("components/ui/DisabledReason.tsx");
  assert.match(src, /if \(!reason\) return <>\{children\}<\/>;/);
  assert.match(src, /role="tooltip"/);
  assert.match(src, /aria-describedby=\{id\}/);
  assert.match(src, /tabIndex=\{0\}/);
  assert.match(src, /group\/dr/);
  assert.match(src, /group-hover\/dr:opacity-100/);
  assert.match(src, /group-focus-visible\/dr:opacity-100/);
  // An unnamed `group-hover:` would open on any outer `group` card's hover.
  assert.doesNotMatch(src, /group-hover:opacity/);
});

test("the shared Button shows its disabledReason only while disabled and not loading", () => {
  const src = read("components/ui/Button.tsx");
  assert.match(src, /disabledReason\?: string;/);
  assert.match(src, /<DisabledReason reason=\{disabled && !loading \? disabledReason : null\}/);
  assert.match(src, /isInert \? "opacity-50 cursor-not-allowed"/);
});

test("buttons disabled for a reason the screen does not show next to them carry it as a tooltip", () => {
  for (const p of [
    "app/settings/components/tabs/InvoiceTab.tsx",
    "app/settings/components/tabs/ProfileTab.tsx",
    "app/settings/components/tabs/EntitySettingsTab.tsx",
    "components/consultation/steps/StepConfirm.tsx",
  ]) {
    const src = read(p);
    assert.match(src, /import DisabledReason from "@\/components\/ui\/DisabledReason";/, p);
    assert.match(src, /<DisabledReason\b/, p);
    assert.equal((src.match(/<DisabledReason\b/g) ?? []).length, (src.match(/<\/DisabledReason>/g) ?? []).length, `${p}: balanced`);
  }
});
