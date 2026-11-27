"use client";

/**
 * Client hook: does the viewer have the full library? It asks GET
 * /api/v1/library/access once per mount; see ./libraryFullAccess.ts for how the
 * answer is read.
 *
 * For pages that do not load /api/library/init (whose `viewer.hasFullAccess`
 * carries the same answer): the /laws/subscribe redeem CTA and the /laws
 * invitation banner. While `loading` is true, show neither, so a subscriber
 * never sees them flash.
 *
 * It answers about the library's texts only. The library assistant has its own
 * rule (Pro+ or an admin, owner ٢٠٧), so never show or hide it on this.
 */

import { useEffect, useState } from "react";
import {
  LIBRARY_ACCESS_ENDPOINT,
  parseLibraryAccessResponse,
  parseLibraryAccountLocked,
  parseLibraryPointsLock,
  type LibraryAccessPointsLock,
} from "./libraryFullAccess";

export interface LibraryFullAccessState {
  hasFullAccess: boolean;
  loading: boolean;
}

export function useLibraryFullAccess(): LibraryFullAccessState {
  const [state, setState] = useState<LibraryFullAccessState>({ hasFullAccess: false, loading: true });
  useEffect(() => {
    let alive = true;
    fetch(LIBRARY_ACCESS_ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (res) => parseLibraryAccessResponse(res.ok, await res.json().catch(() => null)))
      .catch(() => false)
      .then((hasFullAccess) => {
        if (alive) setState({ hasFullAccess, loading: false });
      });
    return () => { alive = false; };
  }, []);
  return state;
}

/**
 * Owner item 9 (batch l8): is the library locked for the signed-in account's
 * type? `locked` stays false while loading and on any error (the server is
 * the enforcement; this only tidies the menu and hides the library banner).
 * `enabled: false` (a signed-out viewer) asks nothing.
 */
export function useLibraryAccountLocked(enabled = true): { locked: boolean; loading: boolean } {
  const [state, setState] = useState({ locked: false, loading: enabled });
  useEffect(() => {
    if (!enabled) {
      setState({ locked: false, loading: false });
      return;
    }
    let alive = true;
    fetch(LIBRARY_ACCESS_ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (res) => parseLibraryAccountLocked(res.ok, await res.json().catch(() => null)))
      .catch(() => false)
      .then((locked) => {
        if (alive) setState({ locked, loading: false });
      });
    return () => { alive = false; };
  }, [enabled]);
  return state;
}

// ─── LIVE-10 (batch l19): the locked-item note's one read per page ───────────
// A book or a precedent draws a LibraryLockedNote under EVERY locked block, so
// the note must not ask the access route once per block. One request per page
// view, shared by every note mounted within NOTE_READ_TTL_MS of it (a later
// mount — the reader scrolled on after a top-up — asks again).

export interface LibraryLockNoteState {
  /** The library is locked for this account's type (owner item 9). */
  accountLocked: boolean;
  /** A subscriber below the points minimum: the top-up notice replaces the subscribe button. */
  pointsLock: LibraryAccessPointsLock | null;
  loading: boolean;
}

const NOTE_READ_TTL_MS = 30_000;
let noteRead: { at: number; promise: Promise<Omit<LibraryLockNoteState, "loading">> } | null = null;

function readLockNoteState(): Promise<Omit<LibraryLockNoteState, "loading">> {
  const now = Date.now();
  if (noteRead && now - noteRead.at < NOTE_READ_TTL_MS) return noteRead.promise;
  const promise = fetch(LIBRARY_ACCESS_ENDPOINT, { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      return { accountLocked: parseLibraryAccountLocked(res.ok, body), pointsLock: parseLibraryPointsLock(res.ok, body) };
    })
    .catch(() => ({ accountLocked: false, pointsLock: null }));
  noteRead = { at: now, promise };
  return promise;
}

export function useLibraryLockNoteState(): LibraryLockNoteState {
  const [state, setState] = useState<LibraryLockNoteState>({ accountLocked: false, pointsLock: null, loading: true });
  useEffect(() => {
    let alive = true;
    readLockNoteState().then((answer) => {
      if (alive) setState({ ...answer, loading: false });
    });
    return () => { alive = false; };
  }, []);
  return state;
}
