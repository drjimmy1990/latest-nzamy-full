/**
 * plainDocx.ts — N01-21/22/23 (batch l11): any AI result as a plain .docx, for
 * every account that sees the result (clients included), with no letterhead.
 * The letterhead export (LetterheadExportBar, q345) stays where it was: this is
 * the result bar's own «تنزيل Word», built from the same hand-written package
 * (ooxml.ts, fflate) so there is one Word writer in the app.
 *
 * Pure: `node --test` runs plainDocx.test.ts against packageCheck.testkit.
 */
import { stripCitationMarkers } from "../ai/citationMarkers.ts";
import { blocksToBodyXml, minimalDocx, type DocBlock } from "./ooxml.ts";

/** «# عنوان» / «## عنوان» → a heading; «- بند» / «• بند» → a bullet; «**نص**» → the text. */
export function resultBlocks(text: string, title?: string | null): DocBlock[] {
  const blocks: DocBlock[] = [];
  const cleanTitle = (title ?? "").trim();
  if (cleanTitle) blocks.push({ kind: "title", text: cleanTitle });
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push({ kind: "list", items: bullets, ordered: false });
    bullets = [];
  };
  for (const raw of stripCitationMarkers(text).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const bullet = /^(?:[-*•]\s+)(.+)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1].trim());
      continue;
    }
    flush();
    if (heading) blocks.push({ kind: "heading", text: heading[1].trim() });
    else blocks.push({ kind: "para", text: line });
  }
  flush();
  return blocks;
}

/** The .docx bytes of an AI result. Throws nothing on odd text: xmlEscape drops what XML forbids. */
export function plainResultDocx(text: string, title?: string | null): Uint8Array {
  return minimalDocx(blocksToBodyXml(resultBlocks(text, title)));
}

/** A file name the three systems accept: no path or reserved characters, never empty. */
export function safeFilename(name: string, fallback = "nzamy-ai-result"): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || fallback;
}
