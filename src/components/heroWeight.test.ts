/**
 * Owner package 25-Nov, annex 09 (Core Web Vitals): A-68 the hero video
 * downloaded 2.26 MB on every visit (`autoPlay` overrides preload="none");
 * A-69 a full-screen fixed noise layer; A-70 the tab icon weighed 552 KB (a
 * 1024 px JPEG inside an SVG, labelled image/png) and /icon.png was the same
 * JPEG under a .png name.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/heroWeight.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";

const hero = readFileSync(new URL("./Hero.tsx", import.meta.url), "utf8");
const pub = (name: string) => new URL(`../../public/${name}`, import.meta.url);

test("A-68: the background video has no autoPlay and no src until the visitor interacts", () => {
  const video = hero.match(/<video\b[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(video, "the background <video> is found");
  assert.doesNotMatch(video, /autoPlay/);
  assert.match(video, /preload="none"/);
  assert.match(video, /poster="\/hero-poster\.webp"/);
  assert.match(video, /src=\{bgVideoOn \? "\/hero-bg\.mp4" : undefined\}/);
  assert.doesNotMatch(hero, /<source src="\/hero-bg\.mp4"/);
  // Only a real interaction starts it, and never with reduced motion / data saver.
  assert.match(hero, /\["pointerdown", "keydown", "touchstart"\]/);
  assert.match(hero, /prefers-reduced-motion: reduce/);
  assert.match(hero, /saveData/);
  assert.ok(statSync(pub("hero-poster.webp")).size < 60_000, "the poster stays small");
});

test("A-69: no full-screen feTurbulence layer", () => {
  // The JSX comment that says why may name it; the markup may not.
  const code = hero.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(code, /feTurbulence/);
});

test("A-70: the tab icons are small, and each file is what its name says", () => {
  const svg = readFileSync(pub("icon.svg"), "utf8");
  assert.ok(statSync(pub("icon.svg")).size < 20_000, `icon.svg is ${statSync(pub("icon.svg")).size} B`);
  assert.match(svg, /viewBox="0 0 512 512"/);
  assert.match(svg, /href="data:image\/webp;base64,UklGR/); // a real WebP (RIFF) payload, labelled as one
  const png = readFileSync(pub("icon.png"));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "icon.png is a PNG");
  assert.ok(png.length < 60_000, `icon.png is ${png.length} B`);
});
