/**
 * darkModeScan.ts — the source scanner behind darkModeGuard.test.ts: finds
 * class strings that paint a light surface, a light border or invisible text
 * while the site is in dark mode.
 *
 * What counts (each in one class string, i.e. one "…"/'…' literal or the
 * static text of one `…` template; every `${…}` is scanned on its own):
 *   - white:     `bg-white`, `bg-white/50`…`/100`, `bg-[#fff]`, `bg-[#ffffff]`
 *                with no `dark:bg-*` beside it;
 *   - panel:     a light hue surface (`bg-amber-50`, `bg-red-100`, `bg-zinc-50`…)
 *                with no `dark:bg-*`;
 *   - border:    a light hue border (`border-amber-200`, `border-zinc-200`…,
 *                opacity 40 % and up) with no `dark:border-*`;
 *   - invisible: `text-gray-100/200` or `text-slate-100/200` with no
 *                `dark:text-*`, and `dark:text-gray|slate-100/200` anywhere.
 * gray-50/100/200, slate-50…300 and emerald/sky-50/100 are NOT surfaces to
 * fix: globals.css redefines those tokens under `.dark`, so `bg-gray-50` is
 * already #161b22 there. That remap is also why gray/slate-100/200 TEXT is
 * invisible in dark mode (globals.css turns them into dark surface colours).
 *
 * Not counted: a variant-prefixed token (`hover:bg-white`, `print:bg-white`,
 * `dark:bg-white`); translucent overlays (`bg-white/10`, `bg-white/[0.03]`);
 * and a light-theme-only string — the else branch of an `isDark ? … : …`
 * ternary (or the then branch of `!isDark ? …`), `!isDark && "…"`, and the
 * value of a light key in a theme-split map (`light:`, `l:`, `bgLight:`,
 * `lightBadge:`), which the component only reads when the site is light.
 *
 * Pure (node:fs-free), so `node --test` loads it directly.
 */

export type DarkModeFindingKind = "white" | "panel" | "border" | "invisible";

export interface DarkModeFinding {
  file: string;
  line: number;
  kind: DarkModeFindingKind;
  text: string;
}

/** Comments blanked to spaces, so every offset and line number is the source's. */
export function stripComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? blank(line) : line))
    .join("\n");
}

/** Every string a class can live in, with the offset of its opening quote. */
export function classLiterals(code: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  function scan(from: number, to: number) {
    let i = from;
    while (i < to) {
      const c = code[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < to && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
        if (code[j] === c) out.push({ text: code.slice(i + 1, j), at: i });
        i = j + 1;
      } else if (c === "`") {
        let j = i + 1;
        let text = "";
        while (j < to && code[j] !== "`") {
          if (code[j] === "$" && code[j + 1] === "{") {
            let depth = 1;
            let k = j + 2;
            while (k < to && depth > 0) {
              if (code[k] === "{") depth++;
              else if (code[k] === "}") depth--;
              k++;
            }
            scan(j + 2, k - 1);
            text += " ";
            j = k;
          } else {
            text += code[j];
            j++;
          }
        }
        out.push({ text, at: i });
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  scan(0, code.length);
  return out;
}

// `D` is the one-letter isDark prop some tool pages pass down (`D ? "…" : "…"`)
const DARK_COND = /(?:\bisDark\w*|\bdark|\bD|\btheme\s*===?\s*["']dark["'])\s*\)?\s*$/;
const NOT_DARK_COND = /(?:!\s*\(?\s*(?:isDark\w*|dark|D)|\bisLight\w*|\btheme\s*===?\s*["']light["'])\s*\)?\s*$/;
// light:, l:, lightBadge:, bgLight:, badgeL:
const LIGHT_KEY = /(?:^|[\s{,(])(?:l|light|light[A-Z]\w*|[a-z]\w*Light|[a-z]\w*[a-z]L)\s*:\s*$/;
const OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** Names of local `(dark, light) => isDark ? dark : light` helpers in a file. */
function themeHelpers(code: string): Set<string> {
  const out = new Set<string>();
  const re = /\b(?:const|let)\s+(\w+)\s*=\s*\(\s*(\w+)\s*(?::\s*string)?\s*,\s*(\w+)\s*(?::\s*string)?\s*\)\s*(?::\s*string\s*)?=>\s*\(?\s*isDark\s*\?\s*(\w+)\s*:\s*(\w+)/g;
  for (const m of code.matchAll(re)) if (m[4] === m[2] && m[5] === m[3]) out.add(m[1]);
  return out;
}
let lastCode = "";
let lastHelpers = new Set<string>();
function helpersOf(code: string): Set<string> {
  if (code !== lastCode) {
    lastCode = code;
    lastHelpers = themeHelpers(code);
  }
  return lastHelpers;
}

/** True when the `,` at `comma` separates the two arguments of a theme helper call. */
function secondHelperArg(code: string, comma: number): boolean {
  const helpers = helpersOf(code);
  if (helpers.size === 0) return false;
  let i = comma - 1;
  for (let steps = 0; i >= 0 && steps < 2000; steps++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i - 1;
      while (j >= 0 && !(code[j] === c && code[j - 1] !== "\\")) j--;
      i = j - 1;
      continue;
    }
    if (c in OPEN) {
      let depth = 1;
      let j = i - 1;
      while (j >= 0 && depth > 0) {
        if (code[j] === c) depth++;
        else if (code[j] === OPEN[c]) depth--;
        j--;
      }
      i = j;
      continue;
    }
    if (c === "(") {
      const name = /(\w+)\s*$/.exec(code.slice(Math.max(0, i - 40), i));
      return !!name && helpers.has(name[1]);
    }
    if (c === "," || c === ";" || c === "{" || c === "[") return false;
    i--;
  }
  return false;
}

/**
 * True when the literal at `at` only renders in the light theme: walking back
 * through the expression it sits in, it is in the else branch of a ternary on
 * isDark (or the then branch of one on !isDark / isLight), behind
 * `!isDark &&`, or the value of a light key of a theme-split map.
 */
export function lightOnly(code: string, at: number): boolean {
  const head = code.slice(Math.max(0, at - 80), at);
  if (LIGHT_KEY.test(head)) return true;
  if (/!\s*(?:isDark\w*|dark)\s*&&\s*$/.test(head)) return true;
  let i = at - 1;
  let colons = 0;
  for (let steps = 0; i >= 0 && steps < 6000; steps++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i - 1;
      while (j >= 0 && !(code[j] === c && code[j - 1] !== "\\")) j--;
      i = j - 1;
      continue;
    }
    if (c in OPEN) {
      let depth = 1;
      let j = i - 1;
      while (j >= 0 && depth > 0) {
        if (code[j] === c) depth++;
        else if (code[j] === OPEN[c]) depth--;
        j--;
      }
      i = j;
      continue;
    }
    // `(` is crossed: `isDark ? (a || "…") : (b || "…")` is still the ternary
    if (c === ",") return colons === 0 && secondHelperArg(code, i);
    if (c === "[" || c === "{" || c === ";") return false;
    if (c === "=" && !"=!<>".includes(code[i - 1]) && code[i + 1] !== "=" && code[i + 1] !== ">") return false;
    if (c === ":") {
      colons++;
    } else if (c === "?" && code[i + 1] !== "." && code[i + 1] !== "?" && code[i - 1] !== "?") {
      const cond = code.slice(Math.max(0, i - 60), i);
      if (colons > 0) {
        colons--;
        if (DARK_COND.test(cond) && !NOT_DARK_COND.test(cond)) return true;
      } else if (NOT_DARK_COND.test(cond)) {
        return true;
      }
    }
    i--;
  }
  return false;
}

const HUES = "amber|red|zinc|green|yellow|orange|blue|rose|purple|indigo|violet|teal|cyan|pink|lime|fuchsia|neutral|stone";
const tok = (body: string) => new RegExp(`(?<![\\w:/\\[-])${body}(?![\\w/\\-\\]])`);

export const WHITE = /(?<![\w:/[-])bg-(?:white(?:\/(?:[5-9]\d|100))?|\[#fff(?:fff)?\])(?![\w\-\]]|\/(?:\d|\[))/i;
export const LIGHT_PANEL = tok(`bg-(?:${HUES})-(?:50|100|200)(?:\\/\\d+)?`);
export const LIGHT_BORDER = tok(`border-(?:${HUES}|emerald|sky)-(?:100|200)(?:\\/(?:[4-9]\\d|100))?`);
export const INVISIBLE_TEXT = /(?<![\w:/[-])text-(?:gray|slate)-(?:100|200)(?![\w/-])/;
export const INVISIBLE_DARK_TEXT = /(?<![\w-])dark:text-(?:gray|slate)-(?:100|200)(?![\w/-])/;
const HAS = (prop: string) => new RegExp(`(?<![\\w-])dark:${prop}-`);
const HAS_DARK_BG = HAS("bg");
const HAS_DARK_BORDER = HAS("border");
const HAS_DARK_TEXT = HAS("text");

/** An arbitrary near-white background, `bg-[#f9fafb]`: every channel 0xE0 or more. */
export function hasLightHexBg(text: string): boolean {
  for (const m of text.matchAll(/(?<![\w:/[-])bg-\[#([0-9a-f]{3}|[0-9a-f]{6})\](?![\w/-])/gi)) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    const channels = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
    if (Math.min(...channels) >= 0xe0) return true;
  }
  return false;
}

/** The kinds a single class string is flagged for (light-theme-only context aside). */
export function classFindings(text: string): DarkModeFindingKind[] {
  const out: DarkModeFindingKind[] = [];
  if ((WHITE.test(text) || hasLightHexBg(text)) && !HAS_DARK_BG.test(text)) out.push("white");
  if (LIGHT_PANEL.test(text) && !HAS_DARK_BG.test(text)) out.push("panel");
  if (LIGHT_BORDER.test(text) && !HAS_DARK_BORDER.test(text)) out.push("border");
  if ((INVISIBLE_TEXT.test(text) && !HAS_DARK_TEXT.test(text)) || INVISIBLE_DARK_TEXT.test(text)) out.push("invisible");
  return out;
}

export function scanSource(file: string, source: string): DarkModeFinding[] {
  const code = stripComments(source);
  const out: DarkModeFinding[] = [];
  for (const { text, at } of classLiterals(code)) {
    const kinds = classFindings(text);
    if (kinds.length === 0 || lightOnly(code, at)) continue;
    const line = code.slice(0, at).split("\n").length;
    for (const kind of kinds) out.push({ file, line, kind, text });
  }
  return out;
}
