/**
 * The shared draft cart (draftCartStore.ts): one cart per tab for every
 * useDraftCart() caller — the reader page and the FloatingButtons FAB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftCartStore, DRAFT_CART_SAVE_ERROR, EMPTY_DRAFT_CART, type DraftCartDeps } from "./draftCartStore.ts";

type Entry = Parameters<DraftCartDeps["putCart"]>[0][number];

const entry = (id: string): Entry => ({
  articleId: id,
  articleNum: id,
  articleTitle: `مادة ${id}`,
  articleText: "نص",
  lawName: "نظام",
  lawSlug: "law",
  isArticleAdded: true,
  isExecRegAdded: false,
  principles: [],
  precedents: [],
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const ids = (cart: Entry[]) => cart.map((e) => e.articleId);

function harness(opts: {
  supabaseMode?: boolean;
  server?: Entry[] | null; // null = anonymous visitor
  local?: Entry[];
  gets?: Array<Promise<{ ok: boolean; json: unknown }>>;
  putOk?: boolean;
  puts?: Array<Promise<boolean>>;
} = {}) {
  const puts: string[][] = [];
  let local = opts.local ?? [];
  let localWrites = 0;
  let removed = 0;
  const answer = () => ({
    ok: true,
    json: { data: { user_id: opts.server === null ? null : "u1", items: (opts.server ?? []).map((e) => ({ payload: e })) } },
  });
  const store = createDraftCartStore({
    supabaseMode: opts.supabaseMode ?? true,
    fetchCart: async () => (opts.gets?.length ? opts.gets.shift()! : answer()),
    putCart: async (items) => {
      puts.push(ids(items));
      if (opts.puts?.length) return opts.puts.shift()!;
      return opts.putOk ?? true;
    },
    readLocal: () => local,
    writeLocal: (items) => { local = items; localWrites += 1; },
    removeLocal: () => { local = []; removed += 1; },
  });
  return { store, puts, local: () => local, localWrites: () => localWrites, removed: () => removed };
}

test("two callers (the page and the FAB) see one cart: a removal in the FAB keeps the page's addition", async () => {
  const h = harness({ server: [entry("a1")] });
  let pageRenders = 0;
  let fabRenders = 0;
  h.store.subscribe(() => { fabRenders += 1; });   // FloatingButtons, mounted first
  h.store.subscribe(() => { pageRenders += 1; });  // the reader page
  await h.store.hydrate();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["a1"]);

  // the page adds a scoped-search hit
  h.store.setCart((prev) => [...prev, entry("hit-7")]);
  // the FAB's drawer removes a1 — it must see hit-7, not a stale copy
  h.store.setCart((prev) => prev.filter((e) => e.articleId !== "a1"));
  await tick();

  assert.deepEqual(ids(h.store.getSnapshot().cart), ["hit-7"]);
  assert.deepEqual(h.puts, [["a1", "hit-7"], ["hit-7"]]);
  assert.ok(pageRenders > 0 && fabRenders > 0);
});

test("a signed-in hydrate loads the server cart and never writes localStorage", async () => {
  const h = harness({ server: [entry("a1"), entry("a2")], local: [entry("stale")] });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["a1", "a2"]);
  h.store.setCart((prev) => prev.slice(1));
  await tick();
  assert.deepEqual(h.puts, [["a2"]]);
  assert.equal(h.localWrites(), 0);
});

test("first signed-in hydrate with an empty server cart pushes the local draft once, then clears it", async () => {
  const h = harness({ server: [], local: [entry("l1")] });
  h.store.subscribe(() => {});
  h.store.subscribe(() => {}); // a second caller does not migrate twice
  await h.store.hydrate();
  assert.deepEqual(h.puts, [["l1"]]);
  assert.equal(h.removed(), 1);
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["l1"]);
});

test("a failed migration keeps localStorage and reports the save error", async () => {
  const h = harness({ server: [], local: [entry("l1")], putOk: false });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  assert.equal(h.removed(), 0);
  assert.equal(h.store.getSnapshot().saveError, DRAFT_CART_SAVE_ERROR);
  h.store.clearSaveError();
  assert.equal(h.store.getSnapshot().saveError, null);
});

test("an anonymous visitor's cart lives in localStorage only", async () => {
  const h = harness({ server: null, local: [entry("l1")] });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["l1"]);
  h.store.setCart((prev) => [...prev, entry("l2")]);
  assert.deepEqual(ids(h.local()), ["l1", "l2"]);
  assert.deepEqual(h.puts, []);
});

test("demo mode: localStorage only, no request at all", async () => {
  const h = harness({ supabaseMode: false, local: [entry("d1")] });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  h.store.setCart([]);
  assert.deepEqual(h.local(), []);
  assert.deepEqual(h.puts, []);
});

test("a change made while the GET is in flight lands on top of the server cart — never saved over it", async () => {
  const get = deferred<{ ok: boolean; json: unknown }>();
  const h = harness({ gets: [get.promise] });
  h.store.subscribe(() => {});
  h.store.setCart((prev) => [...prev, entry("new")]); // clicked before the cart loaded
  assert.deepEqual(h.puts, []); // nothing saved yet: the server cart is unknown
  get.resolve({ ok: true, json: { data: { user_id: "u1", items: [{ payload: entry("old") }] } } });
  await tick();
  await tick();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["old", "new"]);
  assert.deepEqual(h.puts, [["old", "new"]]);
});

test("a hydrate (a page mounting) while a save is in flight does not roll the cart back", async () => {
  const put = deferred<boolean>();
  const h = harness({ server: [entry("a1")], puts: [put.promise] });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  h.store.setCart((prev) => [...prev, entry("a2")]);
  // another reader mounts and re-reads the server, which still holds [a1]
  h.store.subscribe(() => {});
  await h.store.hydrate();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["a1", "a2"]);
  put.resolve(true);
  await tick();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["a1", "a2"]);
  assert.equal(h.store.getSnapshot().saveError, null);
});

test("a failed GET for a signed-in tab keeps the cart (no fall back to a stale local copy)", async () => {
  const h = harness({
    server: [entry("a1")],
    local: [entry("stale")],
    gets: [Promise.resolve({ ok: true, json: { data: { user_id: "u1", items: [{ payload: entry("a1") }] } } }), Promise.reject(new Error("offline"))],
  });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  await h.store.hydrate();
  assert.deepEqual(ids(h.store.getSnapshot().cart), ["a1"]);
});

test("a failed save is reported; a later successful one clears it", async () => {
  const h = harness({ server: [], puts: [Promise.resolve(false), Promise.resolve(true)] });
  h.store.subscribe(() => {});
  await h.store.hydrate();
  h.store.setCart([entry("x")]);
  await tick();
  assert.equal(h.store.getSnapshot().saveError, DRAFT_CART_SAVE_ERROR);
  h.store.setCart([entry("x"), entry("y")]);
  await tick();
  assert.equal(h.store.getSnapshot().saveError, null);
});

test("the server snapshot is one constant empty cart (useSyncExternalStore)", () => {
  const h = harness();
  assert.equal(h.store.getServerSnapshot(), EMPTY_DRAFT_CART);
  assert.equal(h.store.getServerSnapshot(), h.store.getServerSnapshot());
  assert.deepEqual(EMPTY_DRAFT_CART, { cart: [], saveError: null });
});
