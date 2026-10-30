"use client";

/**
 * useFolderLibrarySearch — the fetch half of the «إدارة المحتوى» picker
 * (owner notes ٠٤ §٢ and ٠٥ §٢.٢). The pure half, and why, is
 * folderLibrarySearch.ts.
 *
 * - Before typing: each tab shows the library's own first rows, read once
 *   per page load from /api/library/init and kept in a module cache (the
 *   SmartFolders widget and the reader pages' modal share it).
 * - Typing: debounced (DEBOUNCE_MS), the previous request aborted, then
 *   POST /api/library/search on the tab's section. The precedents tab also
 *   filters the whole collections list by title, so a collection the search's
 *   first page did not name is still found.
 * - A closed library (503 from libraryGate), a failed or timed-out search,
 *   and «no match» are three different answers: `status` says which.
 */

import { useEffect, useRef, useState } from "react";
import type { LibraryDoc } from "./SmartFolderTypes";
import {
  DEBOUNCE_MS,
  DEFAULT_ROWS_PER_TAB,
  DOC_TYPE_ORDER,
  INIT_SECTION_FOR_TYPE,
  SEARCH_LIMIT_SINGLE_SECTION,
  SEARCH_SECTION_FOR_TAB,
  filterDocsByTitle,
  interleaveDefaults,
  isSearchableQuery,
  mapInitRowsToDocs,
  mapSearchResultsToDocs,
  mergeDocLists,
  type FolderDocType,
  type FolderPickerTab,
} from "./folderLibrarySearch";

export type FolderSearchStatus = "idle" | "loading" | "ready" | "error" | "closed";

export interface FolderLibrarySearchState {
  docs: LibraryDoc[];
  status: FolderSearchStatus;
  /** true while the query is 1 character: the list shows the defaults and a hint. */
  queryTooShort: boolean;
  /** true when the list is the defaults (no query), so the heading can say «أحدث المحتوى». */
  showingDefaults: boolean;
}

class LibraryClosedError extends Error {}

/** Per-type default rows, one request each, reused for the page's lifetime. */
const defaultsCache = new Map<FolderDocType, Promise<LibraryDoc[]>>();

function loadDefaults(type: FolderDocType): Promise<LibraryDoc[]> {
  const cached = defaultsCache.get(type);
  if (cached) return cached;
  const section = INIT_SECTION_FOR_TYPE[type];
  const p = fetch(`/api/library/init?section=${section}&limit=${DEFAULT_ROWS_PER_TAB}`)
    .then(async res => {
      if (res.status === 503) throw new LibraryClosedError();
      if (!res.ok) throw new Error(`init ${section} ${res.status}`);
      const body = await res.json();
      const block = body?.[section];
      if (!block || block.degraded) throw new Error(`init ${section} degraded`);
      return mapInitRowsToDocs(section, block.data);
    })
    .catch(err => {
      // Never cache a failure: the next open tries again.
      defaultsCache.delete(type);
      throw err;
    });
  defaultsCache.set(type, p);
  return p;
}

/** The whole collections list as id → title, for principle hits and title filtering. */
async function collectionTitles(): Promise<Map<string, string>> {
  try {
    const all = await loadDefaults("precedent");
    return new Map(all.map(d => [d.slug, d.title]));
  } catch {
    return new Map();
  }
}

async function runSearch(query: string, tab: FolderPickerTab, signal: AbortSignal): Promise<LibraryDoc[]> {
  const section = SEARCH_SECTION_FOR_TAB[tab];
  const wantsCollections = tab === "all" || tab === "precedent";
  const [res, titles] = await Promise.all([
    fetch("/api/library/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        section,
        page: 1,
        // section=all returns a fixed 6-row preview per section whatever the limit.
        limit: section === "all" ? 10 : SEARCH_LIMIT_SINGLE_SECTION,
      }),
      signal,
    }),
    wantsCollections ? collectionTitles() : Promise.resolve(new Map<string, string>()),
  ]);
  if (res.status === 503) {
    const body = await res.json().catch(() => null);
    if (body?.libraryClosed) throw new LibraryClosedError();
    throw new Error("search unavailable");
  }
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = await res.json();
  const hits = mapSearchResultsToDocs(body?.results, titles);
  if (!wantsCollections) return hits;
  const byTitle = filterDocsByTitle(
    Array.from(titles, ([slug, title]) => ({ slug, title, titleEn: title, catId: "SA-00", type: "precedent" as const })),
    query,
  );
  const merged = mergeDocLists(hits, byTitle);
  // «الكل» keeps the four types together, in the tab order.
  return tab === "all"
    ? DOC_TYPE_ORDER.flatMap(t => merged.filter(d => d.type === t))
    : merged.filter(d => d.type === "precedent");
}

export function useFolderLibrarySearch(
  query: string,
  tab: FolderPickerTab,
  enabled: boolean,
): FolderLibrarySearchState {
  const [state, setState] = useState<FolderLibrarySearchState>({
    docs: [],
    status: "idle",
    queryTooShort: false,
    showingDefaults: true,
  });
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    const trimmed = query.trim();
    const searching = isSearchableQuery(trimmed);
    const controller = new AbortController();
    setState(prev => ({
      docs: prev.docs,
      status: "loading",
      queryTooShort: trimmed.length > 0 && !searching,
      showingDefaults: !searching,
    }));

    const settle = (docs: LibraryDoc[]) => {
      if (seq.current !== mine) return;
      setState({ docs, status: "ready", queryTooShort: trimmed.length > 0 && !searching, showingDefaults: !searching });
    };
    const fail = (err: unknown) => {
      if (seq.current !== mine || controller.signal.aborted) return;
      console.warn("[useFolderLibrarySearch] library read failed:", err);
      setState({
        docs: [],
        status: err instanceof LibraryClosedError ? "closed" : "error",
        queryTooShort: false,
        showingDefaults: !searching,
      });
    };

    if (!searching) {
      const types: FolderDocType[] = tab === "all" ? [...DOC_TYPE_ORDER] : [tab];
      Promise.allSettled(types.map(t => loadDefaults(t))).then(settled => {
        const byType: Partial<Record<FolderDocType, LibraryDoc[]>> = {};
        let failures = 0;
        let closed = false;
        settled.forEach((s, i) => {
          if (s.status === "fulfilled") byType[types[i]] = s.value;
          else {
            failures += 1;
            if (s.reason instanceof LibraryClosedError) closed = true;
          }
        });
        if (failures === types.length) {
          fail(closed ? new LibraryClosedError() : new Error("defaults unavailable"));
          return;
        }
        settle(tab === "all" ? interleaveDefaults(byType) : (byType[tab] ?? []).slice(0, DEFAULT_ROWS_PER_TAB));
      });
      return () => controller.abort();
    }

    const timer = window.setTimeout(() => {
      runSearch(trimmed, tab, controller.signal).then(settle, fail);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab, enabled]);

  return state;
}
