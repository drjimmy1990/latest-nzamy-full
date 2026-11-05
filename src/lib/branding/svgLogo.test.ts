/**
 * svgLogo.test.ts — q346: an SVG logo is vetted and rasterised to a PNG in the
 * browser; the server keeps accepting image bytes only. Two walls, each pinned:
 *   1. svgLogoRejectReason: what the browser refuses before it even draws;
 *   2. sniffLogoImage + looksLikeSvg: what the server refuses, whatever the
 *      browser did. This is the wall that decides what can be stored or served.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/branding/svgLogo.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeSvg, sniffLogoImage } from "./brandingVault.ts";
import { rasterSize, svgForRaster, svgIntrinsicSize, svgLogoRejectReason } from "./svgLogo.ts";

const BAD = "الشعار يحتوي عناصر غير مسموحة";
const utf8 = (s: string) => new TextEncoder().encode(s);

test("svgLogoRejectReason: a clean logo passes, a local reference passes", () => {
  assert.equal(svgLogoRejectReason('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), null);
  assert.equal(svgLogoRejectReason('<svg><use href="#a"/></svg>'), null);
  assert.equal(svgLogoRejectReason('<?xml version="1.0"?>\n<!-- logo --><svg><rect fill="url(#g)"/></svg>'), null);
  assert.equal(svgLogoRejectReason('<svg><image href="data:image/png;base64,AAAA"/></svg>'), null);
  assert.equal(svgLogoRejectReason('<svg font-family="x" version="1.1"><text>action = 3</text></svg>'), null, "«on» inside a word is not a handler");
});

test("svgLogoRejectReason: not an SVG root", () => {
  assert.equal(svgLogoRejectReason("hello"), "الملف ليس SVG");
  assert.equal(svgLogoRejectReason("<html><body><svg></svg></body></html>"), "الملف ليس SVG");
  assert.equal(svgLogoRejectReason("<svgfoo/>"), "الملف ليس SVG");
});

const HOSTILE: Array<[string, string]> = [
  ["script element", "<svg><script>alert(1)</script></svg>"],
  ["script, upper case", "<svg><SCRIPT>alert(1)</SCRIPT></svg>"],
  ["script, namespaced", '<svg xmlns:x="http://www.w3.org/2000/svg"><x:script>alert(1)</x:script></svg>'],
  ["event handler", '<svg onload="alert(1)"><rect/></svg>'],
  ["event handler, spaced and unquoted", "<svg onload = alert(1)><rect/></svg>"],
  ["event handler, after a slash", "<svg/onload=alert(1)>"],
  ["event handler, glued to a quote", '<svg><rect x="1"onclick="alert(1)"/></svg>'],
  ["foreignObject", "<svg><foreignObject><div>x</div></foreignObject></svg>"],
  ["foreignObject, other case", "<svg><foreignobject/></svg>"],
  ["foreignObject, namespaced", '<svg xmlns:s="http://www.w3.org/2000/svg"><s:foreignObject/></svg>'],
  ["external image", '<svg><image href="https://evil.example/x.png"/></svg>'],
  ["external image, single quote", "<svg><image href='https://evil.example/x.png'/></svg>"],
  ["external image, xlink", '<svg><image xlink:href="//evil.example/x.png"/></svg>'],
  ["external image, odd prefix", '<svg xmlns:q="http://www.w3.org/1999/xlink"><use q:href="https://evil.example/a#b"/></svg>'],
  ["external image, spaced", '<svg><image href = "https://evil.example/x.png"/></svg>'],
  ["relative file", '<svg><image href="x.png"/></svg>'],
  ["svg inside a data url", '<svg><image href="data:image/svg+xml;base64,AAAA"/></svg>'],
  ["html inside a data url", '<svg><a href="data:text/html,<b>x</b>"><rect/></a></svg>'],
  ["javascript url", '<svg><a href="javascript:alert(1)"><rect/></a></svg>'],
  ["javascript url, encoded", '<svg><a href="&#106;avascript:alert(1)"><rect/></a></svg>'],
  ["javascript url in an attribute", '<svg><set attributeName="fill" to="javascript:alert(1)"/></svg>'],
  ["animation of href", '<svg><a><animate attributeName="href" to="https://evil.example"/></a></svg>'],
  ["css url", '<svg><rect fill="url(https://evil.example/x)"/></svg>'],
  ["css import", '<svg><style>@import "https://evil.example/a.css";</style></svg>'],
  ["stylesheet instruction", '<?xml-stylesheet href="https://evil.example/a.css"?><svg/>'],
  ["doctype and entity", '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'],
  ["bare entity", '<svg><!ENTITY x "y"></svg>'],
  ["iframe", '<svg><iframe src="https://evil.example"/></svg>'],
];

for (const [name, svg] of HOSTILE) {
  test(`svgLogoRejectReason refuses: ${name}`, () => {
    assert.equal(svgLogoRejectReason(svg), BAD);
  });
}

test("svgLogoRejectReason: over 512,000 bytes is refused by size, in bytes not characters", () => {
  const pad = (n: number, ch = "a") => `<svg><desc>${ch.repeat(n)}</desc></svg>`;
  const shell = "<svg><desc></desc></svg>".length;
  assert.equal(svgLogoRejectReason(pad(512_000 - shell)), null);
  assert.equal(svgLogoRejectReason(pad(512_001 - shell)), "حجم ملف SVG أكبر من ٥٠٠ ك.ب");
  assert.equal(svgLogoRejectReason(pad(300_000, "ع")), "حجم ملف SVG أكبر من ٥٠٠ ك.ب", "Arabic letters are two bytes");
});

test("rasterSize: the longest side is scaled to the cap, keeping the shape", () => {
  assert.deepEqual(rasterSize(400, 100), { width: 1600, height: 400 });
  assert.deepEqual(rasterSize(100, 400), { width: 400, height: 1600 });
  assert.deepEqual(rasterSize(3200, 1600), { width: 1600, height: 800 });
  assert.deepEqual(rasterSize(400, 100, 1000), { width: 1000, height: 250 });
  assert.deepEqual(rasterSize(16000, 1), { width: 1600, height: 1 }, "the smallest side is at least 1");
  for (const [w, h] of [[0, 0], [-1, 5], [5, -1], [NaN, 3], [3, Infinity]]) {
    assert.deepEqual(rasterSize(w, h), { width: 1600, height: 1600 }, `${w}x${h}`);
  }
});

test("svgIntrinsicSize reads the root only: width and height, else the viewBox, else null", () => {
  assert.deepEqual(svgIntrinsicSize('<svg viewBox="0 0 300 100"></svg>'), { width: 300, height: 100 });
  assert.deepEqual(svgIntrinsicSize('<svg width="120px" height="40"></svg>'), { width: 120, height: 40 });
  assert.equal(svgIntrinsicSize("<svg></svg>"), null);
  assert.deepEqual(svgIntrinsicSize('<svg width="100%" height="100%" viewBox="0,0,50,25"></svg>'), { width: 50, height: 25 }, "percentages fall to the viewBox");
  assert.deepEqual(svgIntrinsicSize('<svg stroke-width="9" viewBox="0 0 8 4"/>'), { width: 8, height: 4 }, "stroke-width is not width");
  assert.equal(svgIntrinsicSize('<svg><rect width="9" height="9"/></svg>'), null, "a child's size is not the logo's");
  assert.equal(svgIntrinsicSize('<svg width="0" height="0"></svg>'), null);
});

test("svgForRaster gives the root the target size so a viewBox-only logo draws in every browser", () => {
  assert.equal(
    svgForRaster('<svg viewBox="0 0 300 100"><rect/></svg>', { width: 1600, height: 533 }, { width: 300, height: 100 }),
    '<svg width="1600" height="533" viewBox="0 0 300 100"><rect/></svg>',
  );
  assert.equal(
    svgForRaster('<svg width="120" height="40"><rect width="5"/></svg>', { width: 1600, height: 533 }, { width: 120, height: 40 }),
    '<svg width="1600" height="533" viewBox="0 0 120 40"><rect width="5"/></svg>',
    "the old size becomes the viewBox, or the drawing would not scale; a child's width stays",
  );
});

test("looksLikeSvg: after a BOM and whitespace, <svg or <?xml; never an image", () => {
  assert.equal(looksLikeSvg(utf8("﻿  <svg/>")), true);
  assert.equal(looksLikeSvg(utf8('<?xml version="1.0"?><svg/>')), true);
  assert.equal(looksLikeSvg(utf8("<SVG/>")), true);
  assert.equal(looksLikeSvg(utf8("<html></html>")), false);
  assert.equal(looksLikeSvg(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), false);
  assert.equal(looksLikeSvg(new Uint8Array(0)), false);
});

// ── The server's wall: nothing below can reach Storage, under any name ─────
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("the server refuses every hostile SVG by its bytes (the name and Content-Type are never read)", () => {
  for (const [name, svg] of HOSTILE) {
    assert.equal(sniffLogoImage(utf8(svg)), null, name);
    assert.equal(sniffLogoImage(utf8(`﻿  ${svg}`)), null, `${name} after a BOM`);
  }
});

test("the server refuses anything that is not an image", () => {
  for (const body of ["<html><script>alert(1)</script></html>", "%PDF-1.7", "PK\x03\x04", "GIF89a", "just text", ""]) {
    assert.equal(sniffLogoImage(utf8(body)), null, JSON.stringify(body));
  }
  assert.equal(sniffLogoImage(Uint8Array.of(0xff, 0xfe, 0x3c, 0x00, 0x73, 0x00)), null, "UTF-16 SVG");
});

test("a polyglot — image bytes first, active markup after — is refused too", () => {
  for (const tail of ['<svg onload="alert(1)">', "<SVG\n>", "<script>alert(1)</script>", "<ScRiPt src=x>"]) {
    const bytes = new Uint8Array([...PNG_HEAD, 0, 0, 0, 0, ...utf8(tail)]);
    assert.equal(sniffLogoImage(bytes), null, tail);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...utf8(tail)]);
    assert.equal(sniffLogoImage(jpeg), null, `jpeg ${tail}`);
    const webp = new Uint8Array([...utf8("RIFF"), 0, 0, 0, 0, ...utf8("WEBP"), ...utf8(tail)]);
    assert.equal(sniffLogoImage(webp), null, `webp ${tail}`);
  }
});

test("a real image is still accepted, as what its bytes say, so a rasterised logo goes through", () => {
  assert.deepEqual(sniffLogoImage(Uint8Array.from(PNG_HEAD)), { mime: "image/png", ext: "png" });
  assert.deepEqual(sniffLogoImage(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)), { mime: "image/jpeg", ext: "jpg" });
  // A stray "<svg" with no delimiter after it is just compressed data.
  assert.deepEqual(sniffLogoImage(new Uint8Array([...PNG_HEAD, ...utf8("<svgz")])), { mime: "image/png", ext: "png" });
});
