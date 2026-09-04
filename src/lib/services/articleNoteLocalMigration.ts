/**
 * articleNoteLocalMigration.ts — pure helpers for the one-time move of a
 * signed-in reader's sticky note off the browser and onto
 * law_article_notes (Phase 6, item 151 — see articleNotesService.ts).
 *
 * Everything here is pure: string in, value out, no localStorage, no
 * Supabase, no fetch. useArticleNote.ts (the hook that actually reads the
 * browser and calls the service) is the only non-pure caller. Keeping the
 * parsing/decision logic here means the "does this page have local data
 * worth migrating" and "what does base64 audio actually contain" questions
 * are answered by code a test can run directly, instead of by inline
 * try/catch scattered through a hook that also does I/O.
 */

/** The five localStorage keys ResearchWorkspace has ever written for a pageId, read as raw strings. */
export interface LocalArticleNoteRaw {
  noteText: string | null;
  /** raw JSON, from `sticky_note_pos_<pageId>` */
  position: string | null;
  /** raw "true" | "false", from `sticky_note_show_<pageId>` */
  show: string | null;
  /** a `data:audio/...;base64,...` URL, from `sticky_note_audio_<pageId>` */
  audioDataUrl: string | null;
  /** raw JSON array, from `highlighter_strokes_<pageId>` */
  strokes: string | null;
}

/** True when any of the five keys actually holds something — an all-empty page has nothing to migrate. */
export function hasLocalArticleNoteData(raw: LocalArticleNoteRaw): boolean {
  return !!(
    (raw.noteText && raw.noteText.length > 0) ||
    raw.audioDataUrl ||
    (raw.strokes && raw.strokes !== "[]")
  );
}

export interface MigrationPayload {
  noteText?: string;
  position?: { x: number; y: number } | null;
  isVisible?: boolean;
  strokes?: unknown[];
}

function parseJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Turns the raw localStorage strings into the ArticleNoteInput fields worth
 * sending. A field with nothing usable in it (unparsable JSON, an absent
 * key) is simply omitted — saveArticleNote/mergeArticleNoteFields already
 * treat an omitted field as "leave it alone", which for a brand-new row
 * means the column default, exactly what a never-set local key implied.
 */
export function buildMigrationPayload(raw: LocalArticleNoteRaw): MigrationPayload {
  const payload: MigrationPayload = {};

  if (raw.noteText) payload.noteText = raw.noteText;

  const position = parseJsonSafe<{ x: number; y: number }>(raw.position);
  if (position && typeof position.x === "number" && typeof position.y === "number") {
    payload.position = position;
  }

  if (raw.show === "true" || raw.show === "false") {
    payload.isVisible = raw.show === "true";
  }

  const strokes = parseJsonSafe<unknown[]>(raw.strokes);
  if (Array.isArray(strokes)) payload.strokes = strokes;

  return payload;
}

/** A `data:<mime>;base64,<data>` URL split into its parts, or null when it isn't one. */
export interface ParsedDataUrl {
  mime: string;
  base64: string;
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:([^;,]*)(?:;charset=[^;,]+)?;base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  return { mime: mime || "application/octet-stream", base64 };
}

// ─── Save-payload equality — lets the debounced writer no-op on an unchanged note ──

export interface NoteSavePayload {
  noteText: string;
  position: { x: number; y: number } | null;
  isVisible: boolean;
  strokes: unknown[];
}

/** A stable string for a save payload, fixed key order, so two equal payloads always serialize identically. */
export function serializeNotePayload(p: NoteSavePayload): string {
  return JSON.stringify({
    noteText: p.noteText,
    position: p.position,
    isVisible: p.isVisible,
    strokes: p.strokes,
  });
}
