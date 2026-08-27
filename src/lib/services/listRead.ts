/**
 * listRead.ts — "could not read" and "there is nothing" are different answers.
 *
 * ── THE DEFECT THIS EXISTS TO END ───────────────────────────────────────────
 *
 * Thirty-five readers in the service layer end in `catch { return [] }`, and
 * seventeen API routes answer a failed query with `{ data: [] }` and HTTP 200 —
 * several of them with a comment calling it "degrades gracefully". It does not
 * degrade gracefully. It converts a failure into a confident statement of fact:
 *
 *     a lawyer whose hearings query fails reads «لا توجد جلسات قادمة»
 *     and misses a court date.
 *
 * That is the single most damaging thing this platform can do, and it was found
 * on the lawyer dashboard in four stacked layers at once — a `.catch(() => 0)`
 * per query, an all-zero HTTP 200 from the route, an all-zero default from the
 * service, and no error branch on the page.
 *
 * ── THE CONTRACT ────────────────────────────────────────────────────────────
 *
 * A list read has THREE outcomes and a screen must be able to tell them apart:
 *
 *     loading      we have not asked yet
 *     unreadable   we asked and did not get an answer   → say so, offer retry
 *     empty        we asked, and there is nothing       → the honest empty state
 *
 * `ListRead<T>` is a discriminated union, so a caller cannot reach `items`
 * without first deciding what to do about failure. That is the whole point:
 * `return []` is easy to write by accident and impossible to write here.
 *
 * ── WHY NOT JUST THROW? ─────────────────────────────────────────────────────
 *
 * Throwing IS right where one failure should abort one action —
 * `createWorkflowRequest` was changed to throw for exactly that reason. But a
 * page assembling six independent lists wants five of them to render when the
 * sixth is unreadable, and try/catch around each call reintroduces the same
 * `catch { return [] }` at every call site. A value that carries its own
 * failure survives being put in an array, a Promise.all, or React state.
 *
 * Pure: no I/O, no React, no Supabase. Every branch is testable.
 */

export interface ListReadOk<T> {
  ok: true;
  items: T[];
  /**
   * The server's unfiltered count, or `null` when the endpoint does not report
   * one. NOT `items.length` — that is the point of it. A route that defaults to
   * 20 rows and a page that prints «إجمالي القضايا» disagree silently, and a
   * lawyer's 21st case simply does not exist on screen.
   */
  total: number | null;
  /** True when the server holds more rows than this read returned. */
  truncated: boolean;
}

export interface ListReadFailed {
  ok: false;
  /**
   * Deliberately one value. The screen says the same thing for a 500, a
   * dropped connection and an RLS refusal — «تعذّرت القراءة» — and a caller
   * that wants to distinguish them should look at the thrown error, not at a
   * taxonomy invented here that every call site would have to re-map to the
   * same sentence anyway.
   */
  ok_reason: "unreadable";
}

export type ListRead<T> = ListReadOk<T> | ListReadFailed;

/** A successful read. `total` defaults to the number of items actually returned. */
export function listOk<T>(items: T[], total?: number | null): ListRead<T> {
  const resolvedTotal = typeof total === "number" && Number.isFinite(total) ? total : null;
  return {
    ok: true,
    items,
    total: resolvedTotal,
    // Only claim truncation when the server actually said there is more. An
    // unknown total is not evidence of truncation, and a banner that says
    // "some rows are hidden" when none are is its own false statement.
    truncated: resolvedTotal !== null && resolvedTotal > items.length,
  };
}

/** A read that did not get an answer. */
export function listFailed<T>(): ListRead<T> {
  return { ok: false, ok_reason: "unreadable" };
}

/**
 * The shape every list endpoint in this app returns, or is being moved to.
 *
 * `degraded: true` is how a route says "this 200 is a failure, not an absence".
 * Two routes already emit it (see /api/v1/service-requests); the rest are being
 * brought onto it. Reading it here means a caller gets `ok: false` from a 200
 * without having to know that a particular endpoint lies.
 */
export interface ApiListResponse<T> {
  data?: T[] | null;
  total?: number | null;
  degraded?: boolean;
}

/**
 * Map an endpoint's body onto a `ListRead`.
 *
 * A body with `degraded: true`, or with no `data` array at all, is a failure —
 * NOT an empty list. A missing `data` key almost always means the response was
 * an error object, and rendering that as "you have nothing" is the defect.
 */
export function listFromApi<T>(body: ApiListResponse<T> | null | undefined): ListRead<T> {
  if (!body || body.degraded === true) return listFailed<T>();
  if (!Array.isArray(body.data)) return listFailed<T>();
  return listOk(body.data, body.total);
}

/**
 * What the screen should render. One function so that "loading" cannot be
 * confused with "empty" in one page and not another.
 *
 * `loading` wins over everything: a read that has not happened yet is not a
 * failure and is not an absence, and showing either one during the first paint
 * is how «لا توجد جلسات» flashes at a lawyer who does have hearings.
 */
export type ListViewState = "loading" | "unreadable" | "empty" | "ready";

export function listViewState<T>(
  loading: boolean,
  read: ListRead<T> | null | undefined,
): ListViewState {
  if (loading) return "loading";
  // Not yet attempted and not loading — nothing has been asked, so nothing can
  // be asserted. Treated as unreadable rather than empty for the same reason.
  if (!read) return "unreadable";
  if (!read.ok) return "unreadable";
  return read.items.length === 0 ? "empty" : "ready";
}

/** The items, or `[]` — for the `ready` branch ONLY, after `listViewState`. */
export function itemsOf<T>(read: ListRead<T> | null | undefined): T[] {
  return read && read.ok ? read.items : [];
}

/**
 * «يُعرض أحدث ٢٠ من ٤٧ — استخدم البحث للوصول إلى الباقي», or `null` when
 * nothing was cut.
 *
 * Arabic-Indic numerals, because every other number in this UI is. Returning
 * `null` rather than an empty string so a caller cannot render an empty banner
 * by forgetting to check.
 */
export function truncationNoticeAr<T>(read: ListRead<T> | null | undefined): string | null {
  if (!read || !read.ok || !read.truncated || read.total === null) return null;
  const shown = read.items.length.toLocaleString("ar-SA");
  const total = read.total.toLocaleString("ar-SA");
  return `يُعرض أحدث ${shown} من ${total} — استخدم البحث للوصول إلى الباقي.`;
}
