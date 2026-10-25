/**
 * ONE draft cart («مسودة التجميع») per browser tab, shared by every
 * useDraftCart() caller (N2.6 review).
 *
 * Before this module each useDraftCart() call kept its own copy: the global
 * FloatingButtons FAB (root layout) and the reader page each hydrated their
 * own state. An item added on the page never reached the FAB's copy, and
 * since a save replaces the WHOLE cart (PUT /api/v1/drafts/cart, or the
 * localStorage key), removing something in the FAB's drawer wrote its stale
 * copy back — the page's additions were gone. Now every caller reads and
 * writes this one store.
 *
 * Persistence is unchanged (item 94):
 *   - demo mode, or supabase mode with no signed-in user → localStorage only;
 *   - supabase mode, signed in → the server is the store: no localStorage
 *     write, the PUT is awaited, a failure is exposed as `saveError`;
 *   - first hydrate as a signed-in user with an empty server cart and a
 *     non-empty local draft → the draft is pushed once, then cleared locally.
 *
 * Hydration runs when a caller subscribes (each reader page mount re-reads
 * the server, as each instance used to), one at a time. A change made while
 * a hydrate is in flight is applied when it ends, on top of what it read —
 * so it is neither overwritten by the GET's answer nor saved over a server
 * cart this tab has not read yet (a save replaces the whole cart). A hydrate
 * that starts after a change and answers before that change's save lands is
 * dropped.
 *
 * Dependency-free apart from a type (node --test loads it:
 * draftCartStore.test.ts); the browser globals are injected.
 */

import type { CartEntry } from "@/components/laws/DraftDrawer";
import { extractCartUserId, isCurrentSequence, shouldMigrateLocalDraft } from "./draftCartSync.ts";

/** Shown by consumers when a signed-in user's cart change failed to reach
 *  the server — item 94: the server is the store in supabase mode, so a
 *  failed sync is real data loss, not a silent fallback. */
export const DRAFT_CART_SAVE_ERROR = "تعذّر حفظ السلة على الخادم";

export interface DraftCartState {
  cart: CartEntry[];
  saveError: string | null;
}

export interface DraftCartDeps {
  supabaseMode: boolean;
  /** GET /api/v1/drafts/cart → { ok, json }; throws on a network failure. */
  fetchCart: () => Promise<{ ok: boolean; json: unknown }>;
  /** PUT /api/v1/drafts/cart with the whole cart → whether it was saved. */
  putCart: (items: CartEntry[]) => Promise<boolean>;
  readLocal: () => CartEntry[];
  writeLocal: (items: CartEntry[]) => void;
  removeLocal: () => void;
}

/** Reconstruct a CartEntry from a law_draft_carts row (prefer the jsonb payload). */
export function rowToEntry(row: Record<string, unknown>): CartEntry {
  if (row.payload && typeof row.payload === "object") {
    return row.payload as CartEntry;
  }
  // Legacy row (no payload) — minimal reconstruction.
  return {
    articleId: String(row.article_number ?? ""),
    articleNum: String(row.article_number ?? ""),
    articleTitle: String(row.article_title ?? ""),
    articleText: "",
    lawName: "",
    lawSlug: String(row.law_slug ?? ""),
    isArticleAdded: true,
    isExecRegAdded: false,
    principles: [],
    precedents: [],
  };
}

/** Map a CartEntry to a PUT item (queryable columns + full payload). */
export function entryToItem(e: CartEntry) {
  return {
    law_slug: e.lawSlug,
    article_number: e.articleNum,
    article_title: e.articleTitle,
    payload: e,
  };
}

export const EMPTY_DRAFT_CART: DraftCartState = Object.freeze({ cart: [], saveError: null }) as DraftCartState;

export function createDraftCartStore(deps: DraftCartDeps) {
  let state: DraftCartState = EMPTY_DRAFT_CART;
  const listeners = new Set<() => void>();
  // Whether this tab's session is an authenticated supabase user — only that
  // case makes the server the store.
  let signedIn = false;
  // Monotonic guard: only the most recently issued save / migration may write
  // `saveError` or clear localStorage.
  let seq = 0;
  // Bumped by every local change: a hydrate that started before one is stale.
  let edits = 0;
  // Server saves still in flight: a GET answered meanwhile may predate them.
  let savesInFlight = 0;
  let hydrating: Promise<void> | null = null;

  const emit = (next: DraftCartState) => {
    state = next;
    for (const l of listeners) l();
  };

  async function hydrateOnce(): Promise<void> {
    const startedAt = edits;
    const stale = () => edits !== startedAt || savesInFlight > 0;
    if (savesInFlight > 0) return; // what we hold is newer than the server's copy
    if (deps.supabaseMode) {
      let res: { ok: boolean; json: unknown } | null = null;
      try {
        res = await deps.fetchCart();
      } catch {
        res = null; // offline / network failure
      }
      const userId = res?.ok ? extractCartUserId(res.json) : null;
      if (res?.ok && userId) {
        signedIn = true;
        if (stale()) return;
        const items =
          ((res.json as { data?: { items?: Record<string, unknown>[] } }).data?.items) ?? [];
        if (items.length > 0) {
          emit({ ...state, cart: items.map(rowToEntry) });
          return;
        }
        const local = deps.readLocal();
        if (shouldMigrateLocalDraft(items.length, local.length)) {
          emit({ ...state, cart: local });
          seq += 1;
          const mine = seq;
          const ok = await deps.putCart(local);
          if (!isCurrentSequence(mine, seq)) return;
          if (ok) deps.removeLocal();
          // Leave localStorage in place as a safety net; report it.
          else emit({ ...state, saveError: DRAFT_CART_SAVE_ERROR });
        } else if (state.cart.length > 0) {
          // The server says the cart is empty (emptied in another tab).
          emit({ ...state, cart: [] });
        }
        return;
      }
      if (res?.ok) {
        signedIn = false; // an anonymous answer: localStorage is the store
      } else if (signedIn) {
        return; // a failed GET for a signed-in tab: keep what it holds
      }
    }
    // demo mode, or supabase mode with no signed-in user (anonymous/offline).
    if (stale()) return;
    const local = deps.readLocal();
    if (local.length > 0 || state.cart.length > 0) emit({ ...state, cart: local });
  }

  function hydrate(): Promise<void> {
    if (!hydrating) {
      hydrating = hydrateOnce().finally(() => {
        hydrating = null;
      });
    }
    return hydrating;
  }

  return {
    getSnapshot: (): DraftCartState => state,
    getServerSnapshot: (): DraftCartState => EMPTY_DRAFT_CART,
    /** Each new subscriber (a mounted useDraftCart) re-reads the stored cart. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      void hydrate();
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate,
    setCart(updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])): void {
      if (hydrating) {
        const run = () => apply(updater);
        void hydrating.then(run, run); // the edit lands even if the hydrate failed
        return;
      }
      apply(updater);
    },
    clearSaveError(): void {
      if (state.saveError !== null) emit({ ...state, saveError: null });
    },
  };

  function apply(updater: CartEntry[] | ((prev: CartEntry[]) => CartEntry[])): void {
    const next = typeof updater === "function" ? updater(state.cart) : updater;
    edits += 1;
    emit({ ...state, cart: next });

    if (deps.supabaseMode && signedIn) {
      seq += 1;
      const mine = seq;
      savesInFlight += 1;
      void deps.putCart(next).then(
        (ok) => {
          savesInFlight -= 1;
          if (!isCurrentSequence(mine, seq)) return; // superseded by a newer save
          emit({ ...state, saveError: ok ? null : DRAFT_CART_SAVE_ERROR });
        },
        () => {
          savesInFlight -= 1;
          if (isCurrentSequence(mine, seq)) emit({ ...state, saveError: DRAFT_CART_SAVE_ERROR });
        },
      );
      return;
    }
    // demo mode, or supabase mode without a signed-in user: localStorage is the store.
    deps.writeLocal(next);
  }
}

export type DraftCartStore = ReturnType<typeof createDraftCartStore>;
