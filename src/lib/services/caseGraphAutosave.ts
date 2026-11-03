/**
 * caseGraphAutosave.ts — CODE-F24 (owner's 30-Oct package): the case board's
 * autosave, as a pure controller `node --test` can load.
 *
 * What it replaces (CaseGraphView, before): the debounce cleared its pending
 * change the moment it fired, BEFORE the server answered. A failed save was
 * therefore forgotten — the chip said «تعذّر الحفظ … سيُعاد المحاولة مع أي
 * تعديل جديد», i.e. never, unless the lawyer happened to touch the board
 * again — and closing the board after a failure flushed nothing. Every save
 * was also a blind full replace, so a colleague's (or another tab's) newer
 * board was overwritten without a word.
 *
 * The rules here:
 * - every change bumps a local revision; the board stays dirty until the
 *   server confirms THAT revision (an older confirmation never clears a newer
 *   change);
 * - network errors, 5xx and 429 retry on their own with a backoff;
 * - a conflict (409: the saved board changed since we read it) and a refusal
 *   (4xx, demo mode) stop the loop — the board keeps the change and asks;
 * - the unsent change lives in a local draft until it is confirmed (owner:
 *   «مسودة محلية للمستخدم») — the one place a case board touches the
 *   browser's storage, and only for work the server has not acknowledged.
 *
 * Pure: relative imports only, no React, no fetch.
 */

export type SaveErrorKind = "retryable" | "conflict" | "fatal";

/** What `send` throws so the controller can tell a blip from a refusal. */
export class GraphSaveError extends Error {
  readonly kind: SaveErrorKind;
  constructor(message: string, kind: SaveErrorKind) {
    super(message);
    this.name = "GraphSaveError";
    this.kind = kind;
  }
}

/** HTTP status → how the autosave treats it. */
export function kindForStatus(status: number): SaveErrorKind {
  if (status === 409) return "conflict";
  if (status === 429 || status === 408 || status >= 500) return "retryable";
  return "fatal";
}

function kindOf(err: unknown): SaveErrorKind {
  if (err && typeof err === "object" && "kind" in err) {
    const k = (err as { kind: unknown }).kind;
    if (k === "retryable" || k === "conflict" || k === "fatal") return k;
  }
  // fetch rejects with a TypeError when the network is down — retry that.
  return "retryable";
}

/**
 * Key-order-insensitive JSON, for "is what the server holds what we sent?".
 * jsonb does not keep object key order, so a plain JSON.stringify compare
 * would call every round-trip a difference.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type AutosaveStatus =
  | "idle"
  | "pending"   // changed, waiting out the debounce
  | "saving"
  | "saved"
  | "retrying"  // the last attempt failed; another is scheduled
  | "conflict"  // stopped: the saved board changed since we read it
  | "error";    // stopped: refused (permission, demo mode, bad request)

export interface AutosaveDeps<P> {
  /** Persist `payload`; resolve when the server confirmed it. Throws GraphSaveError (or anything → retryable). */
  send(payload: P): Promise<void>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  onStatus(status: AutosaveStatus, message?: string): void;
  /** The unacknowledged change, kept outside the page. Optional. */
  draft?: { write(payload: P): void; clear(): void };
}

export const DEBOUNCE_MS = 1500;
export const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000] as const;

export class GraphAutosave<P> {
  private rev = 0;
  private confirmedRev = 0;
  private latest: P | null = null;
  private timer: unknown = null;
  private sending = false;
  private attempt = 0;
  private stopped: "conflict" | "fatal" | null = null;
  private disposed = false;
  private readonly deps: AutosaveDeps<P>;
  private readonly debounceMs: number;

  constructor(deps: AutosaveDeps<P>, debounceMs: number = DEBOUNCE_MS) {
    this.deps = deps;
    this.debounceMs = debounceMs;
  }

  /** A change the server has not confirmed yet exists. */
  get dirty(): boolean {
    return this.rev !== this.confirmedRev;
  }

  get stoppedBy(): "conflict" | "fatal" | null {
    return this.stopped;
  }

  /** The board changed. While stopped, the change is kept (and drafted) but not sent. */
  change(payload: P): void {
    if (this.disposed) return;
    this.rev += 1;
    this.latest = payload;
    if (this.stopped) {
      this.writeDraft();
      return;
    }
    this.attempt = 0;
    this.arm(this.debounceMs);
    this.status("pending");
  }

  /** Send the newest unconfirmed change now (the debounce fired, or a retry is due). */
  async send(): Promise<void> {
    this.disarm();
    if (this.disposed || this.sending || this.stopped || !this.dirty || this.latest === null) return;
    this.sending = true;
    const rev = this.rev;
    const payload = this.latest;
    this.writeDraft();
    this.status(this.attempt > 0 ? "retrying" : "saving");
    try {
      await this.deps.send(payload);
      this.sending = false;
      if (rev > this.confirmedRev) this.confirmedRev = rev;
      this.attempt = 0;
      if (this.disposed) return;
      if (!this.dirty) {
        this.deps.draft?.clear();
        this.status("saved");
      } else if (this.timer === null) {
        // a change arrived while this one was in flight and its debounce
        // already ran out (send() returned early): send it now.
        void this.send();
      }
    } catch (err) {
      this.sending = false;
      if (this.disposed) return;
      const kind = kindOf(err);
      const message = err instanceof Error ? err.message : undefined;
      if (kind === "retryable") {
        const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
        this.attempt += 1;
        this.arm(delay);
        this.status("retrying", message);
      } else {
        this.stopped = kind;
        this.status(kind === "conflict" ? "conflict" : "error", message);
      }
    }
  }

  /**
   * After a conflict, "keep mine": the caller has re-read the saved board (so
   * `send` now builds on its version) — send the local board over it.
   */
  resume(): void {
    if (this.disposed) return;
    this.stopped = null;
    this.attempt = 0;
    void this.send();
  }

  /** After a conflict, "load the saved copy": drop the unsent change. */
  discard(): void {
    this.disarm();
    this.confirmedRev = this.rev;
    this.latest = null;
    this.stopped = null;
    this.attempt = 0;
    this.deps.draft?.clear();
    if (!this.disposed) this.status("idle");
  }

  /** The page is hiding: make sure the unsent change is in the draft. */
  persistDraft(): void {
    if (this.dirty) this.writeDraft();
  }

  /**
   * The board is going away (closing fullscreen, switching tab, another case).
   * Whatever is unconfirmed — still in the debounce, or failed and waiting to
   * retry — goes out once now; the draft stays until the server confirms it.
   * Nothing is sent after a conflict or a refusal: that change stays a draft.
   */
  dispose(): Promise<void> {
    this.disarm();
    const pending = this.dirty && !this.stopped && this.latest !== null ? this.latest : null;
    if (pending !== null) this.writeDraft();
    this.disposed = true;
    if (pending === null) return Promise.resolve();
    return this.deps.send(pending).then(
      () => this.deps.draft?.clear(),
      () => undefined, // the draft keeps it; the next visit offers it back
    );
  }

  private writeDraft(): void {
    if (this.latest !== null) this.deps.draft?.write(this.latest);
  }

  private arm(ms: number): void {
    this.disarm();
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.send();
    }, ms);
  }

  private disarm(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private status(s: AutosaveStatus, message?: string): void {
    if (!this.disposed) this.deps.onStatus(s, message);
  }
}
