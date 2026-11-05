/**
 * What an attachment preview can show. The mime decides for PDF and images; a
 * Word or text file goes through textKindOf, the same rule the AI file checks use.
 * SVG and HTML are never "image" or "pdf", whatever the file is called.
 *
 * Server code only: textExtract pulls in fflate. The modal renders the kind in
 * the route's reply and never imports this.
 *
 * Pure: `node --test` runs it.
 */
import { textKindOf } from "../ai/textExtract.ts";

export type PreviewKind = "pdf" | "image" | "text" | "none";

const IMAGE_MIMES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export function previewKindOf(mime: string | null, name: string | null): PreviewKind {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (IMAGE_MIMES.has(m)) return "image";
  const text = textKindOf(mime, name);
  return text === "docx" || text === "txt" || text === "md" ? "text" : "none";
}
