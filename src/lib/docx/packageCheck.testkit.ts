/**
 * packageCheck.testkit.ts — test helper, imported only by *.test.ts. No Word
 * runs in CI, so this checks what Word itself is strict about: every part is
 * well-formed XML, every relationship and content-type override points at a part
 * that exists, every r:id resolves in its own part's rels, every prefix is
 * declared, drawing ids are unique, and the children of rPr, pPr and sectPr come
 * in schema order (ECMA-376 §17.3.2.28, §17.3.1.26, §17.6.17).
 */
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

const NAME = "[A-Za-z_][\\w.-]*(?::[A-Za-z_][\\w.-]*)?";
const TAG = new RegExp(`^<(/?)(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*)\\s*(/?)>`);
const ENTITY = /^&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/;
const FORBIDDEN_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/;

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** A strict little parser: throws on anything a conforming XML 1.0 parser would refuse. */
export function parseXml(source: string, label = "xml"): XmlElement {
  let i = source.indexOf("<?xml") === 0 ? source.indexOf("?>") + 2 : 0;
  assert.ok(!FORBIDDEN_CHARS.test(source), `${label}: a character XML 1.0 forbids`);
  const root: XmlElement = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlElement[] = [root];
  while (i < source.length) {
    if (source[i] === "<") {
      const m = TAG.exec(source.slice(i));
      assert.ok(m, `${label}: a broken tag at ${i}: ${source.slice(i, i + 60)}`);
      const [whole, closing, name, rawAttrs, selfClosing] = m;
      if (closing) {
        const open = stack.pop();
        assert.equal(open?.name, name, `${label}: </${name}> closes <${open?.name}>`);
      } else {
        const attrs: Record<string, string> = {};
        for (const a of rawAttrs.matchAll(new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g"))) {
          assert.ok(!(a[1] in attrs), `${label}: <${name}> repeats ${a[1]}`);
          attrs[a[1]] = unescape(a[2] ?? a[3] ?? "");
        }
        const el: XmlElement = { name, attrs, children: [], text: "" };
        stack[stack.length - 1].children.push(el);
        if (!selfClosing) stack.push(el);
      }
      i += whole.length;
    } else {
      const next = source.indexOf("<", i);
      const raw = source.slice(i, next === -1 ? source.length : next);
      for (const at of raw.matchAll(/&/g)) {
        assert.ok(ENTITY.test(raw.slice(at.index)), `${label}: a raw & at ${i + at.index}: ${raw.slice(at.index, at.index + 20)}`);
      }
      assert.ok(!raw.includes(">") , `${label}: a raw > in text: ${raw.slice(0, 60)}`);
      stack[stack.length - 1].text += unescape(raw);
      i += raw.length;
    }
  }
  assert.equal(stack.length, 1, `${label}: <${stack[stack.length - 1].name}> is never closed`);
  const tops = root.children;
  assert.equal(tops.length, 1, `${label}: exactly one root element`);
  assert.equal(root.text.trim(), "", `${label}: text outside the root`);
  return tops[0];
}

export function walk(el: XmlElement, visit: (e: XmlElement) => void): void {
  visit(el);
  for (const c of el.children) walk(c, visit);
}

/** All the text of every <w:t> under `el`, in order. */
export function runText(el: XmlElement): string {
  let out = "";
  walk(el, (e) => { if (e.name === "w:t") out += e.text; });
  return out;
}

const RPR_ORDER = ["w:rStyle", "w:rFonts", "w:b", "w:bCs", "w:i", "w:iCs", "w:color", "w:sz", "w:szCs", "w:rtl", "w:cs", "w:lang"];
const PPR_ORDER = ["w:pStyle", "w:keepNext", "w:pBdr", "w:bidi", "w:spacing", "w:ind", "w:jc", "w:rPr"];
const SECT_ORDER = ["w:headerReference", "w:footerReference", "w:pgSz", "w:pgMar", "w:cols", "w:bidi", "w:docGrid"];

function assertOrder(el: XmlElement, order: string[], part: string): void {
  let last = -1;
  for (const c of el.children) {
    const at = order.indexOf(c.name);
    assert.ok(at >= 0, `${part}: <${c.name}> is not expected in <${el.name}>`);
    assert.ok(at >= last, `${part}: <${c.name}> is out of schema order in <${el.name}>`);
    last = at;
  }
}

const PACKAGE_RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Throws unless the zip is a package Word's strict reader would take. Returns the unzipped entries. */
export function assertPackageOpens(bytes: Uint8Array): Record<string, Uint8Array> {
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  for (const required of ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]) {
    assert.ok(names.includes(required), `missing ${required}`);
  }

  const parts: Record<string, XmlElement> = {};
  for (const name of names) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) parts[name] = parseXml(strFromU8(files[name]), name);
  }

  // [Content_Types]: every part is typed, every Override exists, no macros.
  const types = parts["[Content_Types].xml"];
  assert.equal(types.name, "Types");
  const defaults = new Set(types.children.filter((c) => c.name === "Default").map((c) => c.attrs.Extension.toLowerCase()));
  const overrides = types.children.filter((c) => c.name === "Override").map((c) => c.attrs.PartName);
  for (const o of overrides) assert.ok(names.includes(o.replace(/^\//, "")), `Override for a missing part ${o}`);
  for (const name of names) {
    if (name === "[Content_Types].xml") continue;
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    assert.ok(overrides.includes(`/${name}`) || defaults.has(ext), `${name} has no content type`);
  }
  assert.ok(!/macroEnabled/i.test(strFromU8(files["[Content_Types].xml"])), "macro content type");

  // Relationships: every internal target exists; ids are unique in their file.
  const relsOf = (part: string): Map<string, string> => {
    const slash = part.lastIndexOf("/");
    const relName = `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
    const map = new Map<string, string>();
    const rels = parts[relName];
    if (!rels) return map;
    assert.equal(rels.attrs.xmlns, PACKAGE_RELS_NS, relName);
    for (const r of rels.children) {
      assert.ok(!map.has(r.attrs.Id), `${relName}: repeated id ${r.attrs.Id}`);
      map.set(r.attrs.Id, r.attrs.Target);
      if (r.attrs.TargetMode !== "External") {
        const target = r.attrs.Target.startsWith("/") ? r.attrs.Target.slice(1) : `${part.slice(0, slash + 1)}${r.attrs.Target}`;
        assert.ok(names.includes(target), `${relName}: ${r.attrs.Id} points at a missing ${target}`);
      }
    }
    return map;
  };
  const root = parts["_rels/.rels"];
  assert.ok(root.children.some((r) => r.attrs.Target === "word/document.xml" && /officeDocument$/.test(r.attrs.Type)), "_rels/.rels names the main part");

  const docPrIds = new Set<string>();
  for (const part of names.filter((n) => /^word\/[^/]+\.xml$/.test(n))) {
    const el = parts[part];
    const rels = relsOf(part);
    const declared = new Set(Object.keys(el.attrs).filter((a) => a.startsWith("xmlns:")).map((a) => a.slice(6)));
    walk(el, (e) => {
      const checkPrefix = (n: string) => {
        const colon = n.indexOf(":");
        if (colon === -1) return;
        const prefix = n.slice(0, colon);
        if (prefix === "xmlns" || prefix === "xml") return;
        assert.ok(declared.has(prefix) || `xmlns:${prefix}` in e.attrs, `${part}: prefix ${prefix} is not declared (<${e.name}>)`);
      };
      checkPrefix(e.name);
      Object.keys(e.attrs).forEach(checkPrefix);
      for (const attr of ["r:id", "r:embed"]) {
        if (attr in e.attrs) assert.ok(rels.has(e.attrs[attr]), `${part}: ${attr}="${e.attrs[attr]}" is not in this part's rels`);
      }
      if (e.name === "wp:docPr") {
        assert.ok(!docPrIds.has(e.attrs.id), `drawing id ${e.attrs.id} is used twice`);
        docPrIds.add(e.attrs.id);
      }
      if (e.name === "w:rPr") assertOrder(e, RPR_ORDER, part);
      if (e.name === "w:pPr") assertOrder(e, PPR_ORDER, part);
      if (e.name === "w:sectPr") assertOrder(e, SECT_ORDER, part);
      if (e.name === "w:pgMar") {
        for (const a of ["w:top", "w:right", "w:bottom", "w:left", "w:header", "w:footer", "w:gutter"]) assert.ok(a in e.attrs, `${part}: pgMar lacks ${a}`);
      }
    });
  }

  // document.xml: a body whose last child is the section.
  const doc = parts["word/document.xml"];
  assert.equal(doc.name, "w:document");
  const body = doc.children.find((c) => c.name === "w:body");
  assert.ok(body, "no <w:body>");
  assert.equal(body.children[body.children.length - 1]?.name, "w:sectPr", "the body ends with <w:sectPr>");
  return files;
}
