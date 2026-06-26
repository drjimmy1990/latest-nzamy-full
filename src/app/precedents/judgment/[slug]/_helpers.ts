import { CartEntry } from "@/components/laws/DraftDrawer";

export function getSelectedTextWithin(containerId: string): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const selectedText = selection.toString().trim();
  if (!selectedText) return "";
  const container = document.getElementById(containerId);
  if (!container) return "";
  const range = selection.getRangeAt(0);
  if (container.contains(range.commonAncestorContainer)) {
    return selectedText;
  }
  return "";
}

export function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g,   "$1");
}

export const FOLDER_COLORS = [
  { id: "emerald", hex: "#10b981" },
  { id: "sky",     hex: "#0ea5e9" },
  { id: "amber",   hex: "#f59e0b" },
  { id: "rose",    hex: "#f43f5e" },
  { id: "violet",  hex: "#8b5cf6" },
  { id: "slate",   hex: "#64748b" },
  { id: "orange",  hex: "#f97316" },
  { id: "teal",    hex: "#14b8a6" },
];

export async function handleCopyDraft(cart: any[]): Promise<boolean> {
  if (cart.length === 0) return false;
  const base = (name: string) => name.replace(/\s*ولوائحه التنفيذية.*/, "").trim();
  const plainParts = cart.map(e => {
    const parts: string[] = [];
    if (e.isArticleAdded) {
      const bn = base(e.lawName);
      parts.push(`${e.articleNum} من (${bn}):\n"${e.articleText}"`);
      if (e.execReg) parts.push(`${e.execReg.ref} من اللائحة التنفيذية ل (${bn}):\n"${e.execReg.text}"`);
    }
    return parts.join("\n\n");
  }).filter(Boolean).join("\n\n" + "═".repeat(40) + "\n\n");
  const htmlParts = cart.map(e => {
    const parts: string[] = [];
    if (e.isArticleAdded) {
      const bn = base(e.lawName);
      parts.push(`<b>${e.articleNum} من (${bn}):</b><br>“${e.articleText.replace(/\n/g, "<br>")}”`);
      if (e.execReg) parts.push(`<b>${e.execReg.ref} من اللائحة التنفيذية ل (${bn}):</b><br>“${e.execReg.text.replace(/\n/g, "<br>")}”`);
    }
    return parts.join("<br><br>");
  }).filter(Boolean).join(`<br><br>${"═".repeat(40)}<br><br>`);
  try {
    const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${htmlParts}</p></body></html>`;
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([full], { type: "text/html" }), "text/plain": new Blob([plainParts], { type: "text/plain" }) }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plainParts);
  }
  return true;
}
