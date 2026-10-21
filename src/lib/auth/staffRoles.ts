/**
 * What each internal staff role may do in the admin console (owner answer
 * ٢١٠, option a). There are three roles: super_admin may do everything,
 * operations runs the day-to-day queues, and auditor only reads.
 *
 * Pure, with no imports, so `node --test` can load it through a relative `.ts`
 * import and every route gate and the admin nav share one matrix.
 *
 * The matrix is read-only at runtime, not just in its type. Each row is a
 * `FrozenSet`, a frozen wrapper around a private Set, so no caller can add an
 * action to a role. `Set.prototype.add.call(row, …)` throws as well, because a
 * row is not a real Set (`row instanceof Set` is false). A row also cannot
 * cross from a Server Component to a Client Component as a prop, so a client
 * file should import this module rather than receive rows.
 */
export type StaffRole = "super_admin" | "operations" | "auditor";

export type StaffAction =
  | "users.delete"
  | "users.change_type"
  | "users.suspend"
  | "staff.manage"
  | "settings.write"
  | "library.delete"
  | "content.delete"
  | "coupons.delete"
  | "subscriptions.write"
  | "entitlements.grant"
  | "entitlements.decide"
  | "credits.adjust"
  | "orders.manage"
  | "payments.read"
  | "payments.refund"
  | "verifications.decide"
  | "community.moderate"
  | "tickets.manage"
  | "broadcasts.send"
  | "read";

/** A Record over the union, so tsc rejects a missing or an extra action. */
const EVERY_ACTION: Readonly<Record<StaffAction, true>> = {
  "users.delete": true,
  "users.change_type": true,
  "users.suspend": true,
  "staff.manage": true,
  "settings.write": true,
  "library.delete": true,
  "content.delete": true,
  "coupons.delete": true,
  "subscriptions.write": true,
  "entitlements.grant": true,
  "entitlements.decide": true,
  "credits.adjust": true,
  "orders.manage": true,
  "payments.read": true,
  "payments.refund": true,
  "verifications.decide": true,
  "community.moderate": true,
  "tickets.manage": true,
  "broadcasts.send": true,
  read: true,
};

/**
 * A read-only view of a Set. The real Set sits in a private field, the
 * instance and the prototype are frozen, and `forEach` hands its callback this
 * view rather than the Set inside it. The ES2025 set methods return new Sets,
 * which the caller may change without touching the row.
 */
class FrozenSet<T> implements ReadonlySet<T> {
  readonly #inner: Set<T>;

  constructor(values: Iterable<T>) {
    this.#inner = new Set(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#inner.size;
  }

  has(value: T): boolean {
    return this.#inner.has(value);
  }

  forEach(
    callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.#inner) callbackfn.call(thisArg, value, value, this);
  }

  entries(): SetIterator<[T, T]> {
    return this.#inner.entries();
  }

  keys(): SetIterator<T> {
    return this.#inner.keys();
  }

  values(): SetIterator<T> {
    return this.#inner.values();
  }

  [Symbol.iterator](): SetIterator<T> {
    return this.#inner.values();
  }

  union<U>(other: ReadonlySetLike<U>): Set<T | U> {
    return this.#inner.union(other);
  }

  intersection<U>(other: ReadonlySetLike<U>): Set<T & U> {
    return this.#inner.intersection(other);
  }

  difference<U>(other: ReadonlySetLike<U>): Set<T> {
    return this.#inner.difference(other);
  }

  symmetricDifference<U>(other: ReadonlySetLike<U>): Set<T | U> {
    return this.#inner.symmetricDifference(other);
  }

  isSubsetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.#inner.isSubsetOf(other);
  }

  isSupersetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.#inner.isSupersetOf(other);
  }

  isDisjointFrom(other: ReadonlySetLike<unknown>): boolean {
    return this.#inner.isDisjointFrom(other);
  }
}
Object.freeze(FrozenSet.prototype);
Object.freeze(FrozenSet);

export const STAFF_MATRIX: Readonly<Record<StaffRole, ReadonlySet<StaffAction>>> =
  Object.freeze({
    super_admin: new FrozenSet(Object.keys(EVERY_ACTION) as StaffAction[]),
    operations: new FrozenSet<StaffAction>([
      "orders.manage",
      "verifications.decide",
      "community.moderate",
      "tickets.manage",
      "entitlements.decide",
      "read",
      "payments.read",
    ]),
    auditor: new FrozenSet<StaffAction>(["read", "payments.read"]),
  });

/**
 * Exact match only: 'Super_Admin', ' operations', a prototype key such as
 * 'constructor', and anything that is not a string all give null.
 */
export function toStaffRole(v: unknown): StaffRole | null {
  return v === "super_admin" || v === "operations" || v === "auditor" ? v : null;
}

/**
 * Fails closed. No role, a role outside the union and an action outside the
 * union all give false, super_admin included.
 */
export function staffCan(
  role: StaffRole | null | undefined,
  action: StaffAction,
): boolean {
  const known = toStaffRole(role);
  return known !== null && STAFF_MATRIX[known].has(action);
}
