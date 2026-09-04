/**
 * articleNoteInput.ts — the one place that decides whether a PUT body for
 * /api/v1/library/notes (ArticleNoteInput, articleNotesService.ts) is safe
 * to write, plus the pure merge that turns a validated patch into the full
 * row the DB write needs. Pure — no Supabase, no Next — so the route and
 * its test can both import it.
 *
 * ArticleNoteInput makes every field but pageId optional — that is a PATCH
 * contract, not "send the full note or get defaults". validateArticleNoteInput
 * honors that: a field the caller does not mention is simply absent from the
 * returned patch (not defaulted), so `saveArticleNote({ pageId, audioPath })`
 * — the call uploadNoteAudio()'s docblock implies happens right after a
 * recording finishes — carries only audioPath. mergeArticleNoteFields then
 * layers that patch onto the caller's existing note (read by the route
 * under RLS) so noteText/strokes/position/isVisible survive untouched; a
 * brand-new note (existing === null) falls back to the same defaults the
 * `law_article_notes` columns themselves carry. `PUT { pageId }` alone on an
 * existing note is therefore a no-op, not a reset — that is the point of a
 * patch, not a regression.
 *
 * Same pattern as src/lib/services/preferencesMerge.ts +
 * src/app/api/v1/settings/preferences/route.ts (validate patch → RLS read →
 * pure merge → upsert) for the same reason: a jsonb blob and a flat set of
 * columns are both "a value the client would otherwise fully replace".
 */

/** The five columns of a note that are not the (user_id, page_id) key. */
export interface ArticleNoteFields {
  noteText: string;
  audioPath: string | null;
  strokes: unknown[];
  position: { x: number; y: number } | null;
  isVisible: boolean;
}

/** The column defaults `law_article_notes` itself carries — used only for a brand-new note. */
export const ARTICLE_NOTE_DEFAULTS: ArticleNoteFields = {
  noteText: "",
  audioPath: null,
  strokes: [],
  position: null,
  isVisible: true,
};

/**
 * A validated PUT body. Only the keys the caller actually sent are present
 * (beyond the always-required pageId) — absence means "leave this column
 * alone", explicit `null` (audioPath, position) means "clear this column".
 */
export interface ArticleNotePatch extends Partial<ArticleNoteFields> {
  pageId: string;
}

export type ArticleNoteValidation =
  | { ok: true; value: ArticleNotePatch }
  | { ok: false; error: string };

const MAX_NOTE_TEXT = 20000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** null, or exactly {x, y} with finite-number coordinates — nothing else. */
export function isValidNotePosition(v: unknown): v is { x: number; y: number } | null {
  if (v === null) return true;
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== 2 || !("x" in v) || !("y" in v)) return false;
  return isFiniteNumber(v.x) && isFiniteNumber(v.y);
}

/** null, or a string confined to this caller's own notes folder in the `documents` bucket. */
export function isValidAudioPath(v: unknown, userId: string): v is string | null {
  if (v === null) return true;
  if (typeof v !== "string") return false;
  return v.startsWith(`${userId}/notes/`);
}

/**
 * Validates one PUT body against ArticleNoteInput. `userId` comes from the
 * authenticated session (assertRole), never from the body — the caller
 * cannot forge someone else's notes folder into audioPath.
 *
 * Returns a PATCH: a field left out of `body` is left out of `value` too
 * (mergeArticleNoteFields decides what happens to the column). A field
 * present in `body` — including an explicit `null` for audioPath/position —
 * is always validated and, if valid, present in `value` with that value.
 */
export function validateArticleNoteInput(body: unknown, userId: string): ArticleNoteValidation {
  if (!isPlainObject(body)) {
    return { ok: false, error: "بيانات غير صالحة" };
  }

  const { pageId } = body;
  if (typeof pageId !== "string" || pageId.length < 1 || pageId.length > 200) {
    return { ok: false, error: "معرّف الصفحة مطلوب (١ إلى ٢٠٠ حرف)" };
  }

  const value: ArticleNotePatch = { pageId };

  if (body.noteText !== undefined) {
    if (typeof body.noteText !== "string" || body.noteText.length > MAX_NOTE_TEXT) {
      return { ok: false, error: "نص الملاحظة غير صالح (٢٠٬٠٠٠ حرف كحد أقصى)" };
    }
    value.noteText = body.noteText;
  }

  if (body.strokes !== undefined) {
    if (!Array.isArray(body.strokes)) {
      return { ok: false, error: "بيانات الرسم غير صالحة" };
    }
    value.strokes = body.strokes;
  }

  if (body.position !== undefined) {
    if (!isValidNotePosition(body.position)) {
      return { ok: false, error: "موضع الملاحظة غير صالح" };
    }
    value.position = body.position as { x: number; y: number } | null;
  }

  if (body.isVisible !== undefined) {
    if (typeof body.isVisible !== "boolean") {
      return { ok: false, error: "قيمة الظهور غير صالحة" };
    }
    value.isVisible = body.isVisible;
  }

  if (body.audioPath !== undefined) {
    if (!isValidAudioPath(body.audioPath, userId)) {
      return { ok: false, error: "مسار التسجيل الصوتي غير صالح" };
    }
    value.audioPath = body.audioPath as string | null;
  }

  return { ok: true, value };
}

/**
 * Layers a validated patch onto the caller's existing note fields (read by
 * the route under RLS), or onto the column defaults when `existing` is null
 * (no note for this pageId yet). A field the patch does not mention keeps
 * `existing`'s value — never resets to the default — so a partial save
 * (e.g. only audioPath, right after uploadNoteAudio()) cannot silently wipe
 * the rest of the note.
 */
export function mergeArticleNoteFields(
  existing: ArticleNoteFields | null,
  patch: ArticleNotePatch,
): ArticleNoteFields {
  const base = existing ?? ARTICLE_NOTE_DEFAULTS;
  return {
    noteText: patch.noteText !== undefined ? patch.noteText : base.noteText,
    audioPath: patch.audioPath !== undefined ? patch.audioPath : base.audioPath,
    strokes: patch.strokes !== undefined ? patch.strokes : base.strokes,
    position: patch.position !== undefined ? patch.position : base.position,
    isVisible: patch.isVisible !== undefined ? patch.isVisible : base.isVisible,
  };
}
