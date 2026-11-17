/**
 * citationStatus.ts — the status pill of a cited library text (owner N06-35).
 *
 * The library decides an article's status, never the model: retrieval stores
 * the row's own status in the run's source map (SourceRef.status), and the
 * citation carries it from there. Only the three statuses the owner named get
 * a pill; anything else (suspended, added, merged, an undeclared status, a
 * principle, a run stored before the field existed) gets none — owner ٢٥٩:
 * never a «سارية» the source did not state.
 *
 * Pure, no imports, so `node --test` runs it.
 */

export type CitedStatus = "active" | "amended" | "repealed";

/** The stored status when it is one with a pill, else undefined. */
export function citedStatus(raw: unknown): CitedStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  return s === "active" || s === "amended" || s === "repealed" ? s : undefined;
}

export interface StatusPill {
  emoji: string;
  label: string;
  /** Read to a screen reader in place of the emoji. */
  spoken: string;
  tone: "ok" | "caution" | "danger";
}

const PILLS: Record<CitedStatus, StatusPill> = {
  active: { emoji: "🟢", label: "سارية", spoken: "الحالة: سارية", tone: "ok" },
  amended: { emoji: "🟡", label: "معدّلة", spoken: "الحالة: معدّلة — راجع التعديل", tone: "caution" },
  repealed: { emoji: "🔴", label: "ملغاة", spoken: "الحالة: ملغاة — لا يُستشهد بها", tone: "danger" },
};

/** The pill for a stored status, or null (no pill) when there is none to state. */
export function statusPill(raw: unknown): StatusPill | null {
  const s = citedStatus(raw);
  return s ? PILLS[s] : null;
}
