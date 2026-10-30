/**
 * taskWrites.ts — ordering and rollback for the tasks page's optimistic writes.
 * ─────────────────────────────────────────────────────────
 * CODE-F11 (owner review of 0d5273ea): every handler computed its request
 * payload INSIDE a `setTasks(prev => …)` updater and read it on the next
 * line. React only runs an updater eagerly when the component has no pending
 * work; otherwise it runs at render time, after the handler has returned. On
 * those clicks `next` was still undefined, so a ticked step sent nothing
 * (LIVE-F26: 1/1 on screen, 0/1 after a reload, no error), un-ticking a done
 * task sent the default "done", and `previous` was undefined so no rollback
 * ever ran. Two quick edits of one row also raced: an older answer could
 * land after a newer edit and roll it back to a value the server never had.
 *
 * The rules now:
 *   • the payload is computed from the current list OUTSIDE any updater;
 *   • writes to one task are sent one after the other, in click order
 *     (`enqueue`), so the server ends on the last thing the lawyer did;
 *   • every write takes a version per field (`begin`); a failure rolls back
 *     only the fields it is still the latest write for (`ownedFields`), and
 *     rolls them back to the last value the SERVER confirmed — not to the
 *     value on screen at click time, which may itself be an unconfirmed
 *     optimistic value.
 *
 * Pure apart from promises: no React, no I/O.
 */

export interface WriteToken<F extends string = string> {
  rowId: string;
  versions: ReadonlyMap<F, number>;
}

export interface RowWriteQueue {
  /** Claim the next version of each field of `rowId`. */
  begin<F extends string>(rowId: string, fields: readonly F[]): WriteToken<F>;
  /** The fields of `token` that no later write has claimed since. */
  ownedFields<F extends string>(token: WriteToken<F>): F[];
  /** Run `job` after every earlier job for `rowId` has settled (success or not). */
  enqueue<T>(rowId: string, job: () => Promise<T>): Promise<T>;
}

export function createRowWriteQueue(): RowWriteQueue {
  const versions = new Map<string, number>();
  const tails = new Map<string, Promise<unknown>>();
  const key = (rowId: string, field: string) => `${rowId}\u0000${field}`;

  return {
    begin<F extends string>(rowId: string, fields: readonly F[]): WriteToken<F> {
      const out = new Map<F, number>();
      for (const field of fields) {
        const k = key(rowId, field);
        const v = (versions.get(k) ?? 0) + 1;
        versions.set(k, v);
        out.set(field, v);
      }
      return { rowId, versions: out };
    },
    ownedFields<F extends string>(token: WriteToken<F>): F[] {
      const owned: F[] = [];
      for (const [field, v] of token.versions) {
        if (versions.get(key(token.rowId, field)) === v) owned.push(field);
      }
      return owned;
    },
    enqueue<T>(rowId: string, job: () => Promise<T>): Promise<T> {
      const prev = tails.get(rowId) ?? Promise.resolve();
      const run = prev.then(job, job);
      // The chain must not reject, or the next job would see a rejection.
      const tail = run.then(() => undefined, () => undefined);
      tails.set(rowId, tail);
      void tail.then(() => { if (tails.get(rowId) === tail) tails.delete(rowId); });
      return run;
    },
  };
}

/** `current` with `fields` put back to their values in `confirmed`. */
export function revertFields<T extends object>(current: T, confirmed: T, fields: readonly (keyof T)[]): T {
  if (fields.length === 0) return current;
  const out = { ...current };
  for (const f of fields) out[f] = confirmed[f];
  return out;
}

/** `confirmed` with the fields of `patch` the server just accepted. */
export function confirmFields<T extends object>(confirmed: T, patch: Partial<T>): T {
  return { ...confirmed, ...patch };
}
