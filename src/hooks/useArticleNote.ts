/**
 * useArticleNote — the single writer for a law-page sticky note, voice memo
 * and highlight strokes (Phase 6, item 151). ResearchWorkspace.tsx is its
 * only caller; every localStorage/network access for this feature happens
 * here so the component never touches either directly.
 *
 * Signed-in (isLoggedIn && isSupabaseMode): hydrates from getArticleNote(),
 * saves through saveArticleNote() on an 800ms debounce, one row per pageId.
 * A field is only written once its value differs from the last value this
 * hook actually got the server to confirm (lastSavedSerialRef) — that one
 * check is what stops a viewport-resize's harmless position re-clamp, or
 * the render right after hydration lands, from re-PUTting unchanged data.
 *
 * Signed-out: byte-identical to the pre-Phase-6 behaviour — same keys, same
 * synchronous localStorage writes on every change, no debounce, no network.
 *
 * Migration (first signed-in load of a pageId): if the server has NO row yet
 * and local keys exist, they are read, the audio (if any) is decoded and
 * uploaded, and everything is sent in ONE saveArticleNote call — so a signed
 * row only ever appears fully formed, never half-migrated. Local keys are
 * removed ONLY after that call succeeds; any failure (read or migrate) is
 * swallowed, writes stay disabled for the rest of this page's session
 * (canWrite stays false even though hydrated is already true), and the
 * local keys are left untouched for the next signed-in visit to retry.
 * A local audio memo (base64 data URL) is genuinely large — several hundred
 * KB is normal for a one-minute clip — which is exactly why it lived in
 * localStorage in the first place and exactly why it has to move.
 *
 * canWrite vs hydrated: `hydrated` only means the initial read settled, one
 * way or another — it does NOT mean it is safe to persist a new change.
 * `canWrite` is the write-readiness signal: debounced text/position/strokes
 * saves already gate on it internally (writesEnabledRef), and the caller
 * MUST gate the mic/delete-audio controls on it too, because
 * saveRecordedAudio/clearAudio talk to the server directly — recording a
 * memo while canWrite is false would create the row with only audioPath
 * set, and the still-unmigrated local note text and strokes would never be
 * offered again (getArticleNote(pageId) now returns non-null, so the
 * `if (serverNote)` branch is taken forever after).
 */

"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useUser } from "@/hooks/useUser";
import { isSupabaseMode } from "@/lib/services/api";
import {
  getArticleNote,
  saveArticleNote,
  uploadNoteAudio,
  getNoteAudioUrl,
  type ArticleNote,
} from "@/lib/services/articleNotesService";
import {
  hasLocalArticleNoteData,
  buildMigrationPayload,
  parseDataUrl,
  serializeNotePayload,
  type LocalArticleNoteRaw,
  type NoteSavePayload,
} from "@/lib/services/articleNoteLocalMigration";

export interface ArticleNoteStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  opacity: number;
  w?: number;
  h?: number;
  isRelative?: boolean;
  blockId?: string;
}

const SAVE_DEBOUNCE_MS = 800;
const DEFAULT_POS = { x: 100, y: 100 };

function localKey(kind: "text" | "pos" | "show" | "audio" | "strokes", pageId: string): string {
  switch (kind) {
    case "text": return `sticky_note_text_${pageId}`;
    case "pos": return `sticky_note_pos_${pageId}`;
    case "show": return `sticky_note_show_${pageId}`;
    case "audio": return `sticky_note_audio_${pageId}`;
    case "strokes": return `highlighter_strokes_${pageId}`;
  }
}

function readLocalRaw(pageId: string): LocalArticleNoteRaw {
  return {
    noteText: localStorage.getItem(localKey("text", pageId)),
    position: localStorage.getItem(localKey("pos", pageId)),
    show: localStorage.getItem(localKey("show", pageId)),
    audioDataUrl: localStorage.getItem(localKey("audio", pageId)),
    strokes: localStorage.getItem(localKey("strokes", pageId)),
  };
}

function clearLocalRaw(pageId: string) {
  localStorage.removeItem(localKey("text", pageId));
  localStorage.removeItem(localKey("pos", pageId));
  localStorage.removeItem(localKey("show", pageId));
  localStorage.removeItem(localKey("audio", pageId));
  localStorage.removeItem(localKey("strokes", pageId));
}

function writeLocalRaw(pageId: string, payload: NoteSavePayload) {
  localStorage.setItem(localKey("strokes", pageId), JSON.stringify(payload.strokes));
  localStorage.setItem(localKey("text", pageId), payload.noteText);
  localStorage.setItem(localKey("pos", pageId), JSON.stringify(payload.position ?? DEFAULT_POS));
  localStorage.setItem(localKey("show", pageId), payload.isVisible ? "true" : "false");
}

/** The local base64 recording, decoded into an uploadable Blob. null on anything unparsable. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    const binary = atob(parsed.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: parsed.mime });
  } catch {
    return null;
  }
}

export interface UseArticleNoteResult {
  /** True once this pageId's initial read (local or server) has settled — success or failure. Not a render gate. */
  hydrated: boolean;
  /**
   * True once it is safe to persist a change for this pageId — i.e. once
   * hydration finished on the success path (existing row, empty page, or a
   * completed migration). False while `hydrated` is already true but the
   * signed-in read or migration failed: text/position/strokes are already
   * gated on this internally (writesEnabledRef), but saveRecordedAudio and
   * clearAudio talk to the server directly, so callers MUST also check this
   * before offering the mic/delete-audio controls — otherwise a first
   * audio-only save creates the row and the still-unmigrated local note
   * text and strokes become permanently unreachable.
   */
  canWrite: boolean;
  signedIn: boolean;

  noteText: string;
  setNoteText: (v: string) => void;
  notePos: { x: number; y: number };
  setNotePos: Dispatch<SetStateAction<{ x: number; y: number }>>;
  showNote: boolean;
  setShowNote: Dispatch<SetStateAction<boolean>>;
  strokes: ArticleNoteStroke[];
  setStrokes: Dispatch<SetStateAction<ArticleNoteStroke[]>>;
  /** Same as setStrokes([]) but also drops the guest-mode localStorage key, matching the old "مسح الكل" behaviour. */
  clearStrokes: () => void;

  /** True when a memo exists for this page — signed-in: audioPath !== null; guest: the local data URL is set. */
  hasAudio: boolean;
  isUploadingAudio: boolean;
  isFetchingAudioUrl: boolean;
  /** Only meaningful when !signedIn — the guest data URL to hand straight to <audio src>. */
  guestAudioDataUrl: string | null;
  /** Records a finished memo: uploads + saves (signed-in) or base64-encodes into local state (guest). */
  saveRecordedAudio: (blob: Blob) => Promise<void>;
  clearAudio: () => Promise<void>;
  /** Signed-in only: mints a fresh short-lived playback URL. Call this on every play, never cache it. */
  fetchAudioPlaybackUrl: () => Promise<string | null>;
}

export function useArticleNote(pageId: string): UseArticleNoteResult {
  const { isLoggedIn } = useUser();
  const signedIn = isLoggedIn && isSupabaseMode;

  const [hydrated, setHydrated] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePos, setNotePos] = useState(DEFAULT_POS);
  const [showNote, setShowNote] = useState(false);
  const [strokes, setStrokes] = useState<ArticleNoteStroke[]>([]);
  const [guestAudioDataUrl, setGuestAudioDataUrl] = useState<string | null>(null);
  const [remoteAudioPath, setRemoteAudioPath] = useState<string | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isFetchingAudioUrl, setIsFetchingAudioUrl] = useState(false);

  // Refs so the debounce/gate logic never needs to be a render dependency.
  const writesEnabledRef = useRef(false);
  const lastSavedSerialRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ pageId: string; payload: NoteSavePayload } | null>(null);

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;
    void saveArticleNote({
      pageId: pending.pageId,
      noteText: pending.payload.noteText,
      position: pending.payload.position,
      isVisible: pending.payload.isVisible,
      strokes: pending.payload.strokes,
    }).catch(err => {
      console.error("[useArticleNote] debounced save failed:", err);
    });
  }, []);

  // ── Hydrate (+ one-time migrate) whenever the page or sign-in state changes ──
  useEffect(() => {
    let cancelled = false;
    writesEnabledRef.current = false;
    lastSavedSerialRef.current = null;
    setHydrated(false);
    setCanWrite(false);
    // Close a note left open from the PREVIOUS pageId synchronously, before
    // the (possibly async, signed-in) re-hydration below — the fiqh reader
    // changes pageId while this component stays mounted (a new block), and
    // leaving the popup open would let a keystroke aimed at the new block
    // land in the old block's in-memory state right up until it gets
    // overwritten by the new block's server data.
    setShowNote(false);

    const applyPayload = (p: NoteSavePayload, audioPath: string | null) => {
      if (cancelled) return;
      setNoteText(p.noteText);
      setNotePos(p.position ?? DEFAULT_POS);
      setShowNote(p.isVisible);
      setStrokes(p.strokes as ArticleNoteStroke[]);
      setRemoteAudioPath(audioPath);
      lastSavedSerialRef.current = serializeNotePayload(p);
      writesEnabledRef.current = true;
      setCanWrite(true);
      setHydrated(true);
    };

    const noteToPayload = (note: ArticleNote): NoteSavePayload => ({
      noteText: note.noteText,
      position: note.position,
      isVisible: note.isVisible,
      strokes: note.strokes,
    });

    async function hydrateSignedIn() {
      let serverNote: ArticleNote | null;
      try {
        serverNote = await getArticleNote(pageId);
      } catch (err) {
        // getArticleNote() throws on a read failure — that is not "no note".
        // Keep the defaults on screen but never enable writes for this
        // pageId's session: a save now would blank a row we could not read.
        console.error("[useArticleNote] getArticleNote failed:", err);
        if (!cancelled) setHydrated(true);
        return;
      }
      if (cancelled) return;

      if (serverNote) {
        applyPayload(noteToPayload(serverNote), serverNote.audioPath);
        return;
      }

      // No row yet — migrate local leftovers, if any, in one shot.
      const raw = readLocalRaw(pageId);
      if (!hasLocalArticleNoteData(raw)) {
        applyPayload({ noteText: "", position: null, isVisible: false, strokes: [] }, null);
        return;
      }

      try {
        const patch = buildMigrationPayload(raw);
        let audioPath: string | undefined;
        if (raw.audioDataUrl) {
          const blob = dataUrlToBlob(raw.audioDataUrl);
          if (!blob) throw new Error("تعذّر قراءة التسجيل الصوتي المحلي");
          audioPath = await uploadNoteAudio(pageId, blob);
        }
        const saved = await saveArticleNote({ pageId, audioPath, ...patch });
        if (cancelled) return;
        clearLocalRaw(pageId);
        applyPayload(noteToPayload(saved), saved.audioPath);
      } catch (err) {
        // Any failure here (blob decode, upload, or the save itself) leaves
        // every local key untouched so the next signed-in visit retries the
        // whole migration — never a half-written row missing its audio.
        console.error("[useArticleNote] migration failed, will retry next visit:", err);
        if (cancelled) return;
        const patch = buildMigrationPayload(raw);
        setNoteText(patch.noteText ?? "");
        setNotePos(patch.position ?? DEFAULT_POS);
        setShowNote(patch.isVisible ?? false);
        setStrokes((patch.strokes as ArticleNoteStroke[]) ?? []);
        setRemoteAudioPath(null);
        // writesEnabledRef stays false — this session shows the local data
        // but cannot save over it.
        setHydrated(true);
      }
    }

    function hydrateGuest() {
      const raw = readLocalRaw(pageId);
      const patch = buildMigrationPayload(raw);
      const payload: NoteSavePayload = {
        noteText: patch.noteText ?? "",
        position: patch.position ?? null,
        isVisible: patch.isVisible ?? false,
        strokes: (patch.strokes as ArticleNoteStroke[]) ?? [],
      };
      setGuestAudioDataUrl(raw.audioDataUrl);
      applyPayload(payload, null);
    }

    if (signedIn) {
      void hydrateSignedIn();
    } else {
      hydrateGuest();
    }

    return () => {
      cancelled = true;
      // A pageId can change while this component stays mounted (the fiqh
      // reader's pageId includes the active block). Flush whatever was
      // pending for the OLD pageId before the next hydrate resets state,
      // or the last few seconds of edits are silently dropped.
      flushPendingSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, signedIn]);

  // ── Persist on change ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    const payload: NoteSavePayload = { noteText, position: notePos, isVisible: showNote, strokes };

    if (!signedIn) {
      // Byte-identical to the pre-Phase-6 behaviour: write straight to
      // localStorage on every change, no debounce.
      writeLocalRaw(pageId, payload);
      return;
    }

    if (!writesEnabledRef.current) return;
    const serial = serializeNotePayload(payload);
    if (serial === lastSavedSerialRef.current) return; // nothing actually changed since the last confirmed save
    lastSavedSerialRef.current = serial;
    pendingSaveRef.current = { pageId, payload };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteText, notePos, showNote, strokes, hydrated, signedIn, pageId]);
  // Unmount is covered too: the hydrate effect above's own cleanup runs on
  // unmount as well as on a pageId/signedIn change, and it already flushes.

  const clearStrokes = useCallback(() => {
    setStrokes([]);
    if (!signedIn) localStorage.removeItem(localKey("strokes", pageId));
  }, [signedIn, pageId]);

  const saveRecordedAudio = useCallback(async (blob: Blob) => {
    if (!signedIn) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(blob);
      });
      setGuestAudioDataUrl(dataUrl);
      return;
    }
    if (!writesEnabledRef.current) {
      // A signed-in read or migration is still pending/failed for this
      // pageId (hydrated can already be true here). Saving audio alone
      // would create the row with the local note text and strokes still
      // stuck in localStorage, never migrated — see canWrite's doc comment.
      throw new Error("لا يمكن حفظ التسجيل الصوتي قبل اكتمال مزامنة الملاحظة مع الخادم");
    }
    setIsUploadingAudio(true);
    try {
      const key = await uploadNoteAudio(pageId, blob);
      const saved = await saveArticleNote({ pageId, audioPath: key });
      setRemoteAudioPath(saved.audioPath);
    } finally {
      setIsUploadingAudio(false);
    }
  }, [signedIn, pageId]);

  const clearAudio = useCallback(async () => {
    if (!signedIn) {
      setGuestAudioDataUrl(null);
      return;
    }
    if (!writesEnabledRef.current) {
      throw new Error("لا يمكن حذف التسجيل الصوتي قبل اكتمال مزامنة الملاحظة مع الخادم");
    }
    const saved = await saveArticleNote({ pageId, audioPath: null });
    setRemoteAudioPath(saved.audioPath);
  }, [signedIn, pageId]);

  const fetchAudioPlaybackUrl = useCallback(async () => {
    if (!signedIn) return guestAudioDataUrl;
    setIsFetchingAudioUrl(true);
    try {
      return await getNoteAudioUrl(pageId);
    } finally {
      setIsFetchingAudioUrl(false);
    }
  }, [signedIn, pageId, guestAudioDataUrl]);

  return {
    hydrated,
    canWrite,
    signedIn,
    noteText,
    setNoteText,
    notePos,
    setNotePos,
    showNote,
    setShowNote,
    strokes,
    setStrokes,
    clearStrokes,
    hasAudio: signedIn ? remoteAudioPath !== null : guestAudioDataUrl !== null,
    isUploadingAudio,
    isFetchingAudioUrl,
    guestAudioDataUrl,
    saveRecordedAudio,
    clearAudio,
    fetchAudioPlaybackUrl,
  };
}
