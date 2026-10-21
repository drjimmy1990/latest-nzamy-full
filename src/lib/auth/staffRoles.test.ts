import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_MATRIX,
  staffCan,
  toStaffRole,
  type StaffAction,
  type StaffRole,
} from "./staffRoles.ts";

// Written out here from the task brief, not imported from the module, so the
// test checks the matrix against the requirement rather than against itself.
// A Record over the union makes tsc reject a missing or an extra action.
const EVERY_ACTION: Record<StaffAction, true> = {
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
const ACTIONS = Object.keys(EVERY_ACTION) as StaffAction[];

const OPERATIONS_ROW: StaffAction[] = [
  "orders.manage",
  "verifications.decide",
  "community.moderate",
  "tickets.manage",
  "entitlements.decide",
  "read",
  "payments.read",
];

const ROLES: StaffRole[] = ["super_admin", "operations", "auditor"];

const sorted = (row: Iterable<string>) => [...row].sort();

test("the staff matrix includes the two payment actions", () => {
  assert.equal(ACTIONS.length, 20);
});
test("only the super admin can refund; all staff roles may read payments", () => {
  for (const role of ROLES) {
    assert.equal(staffCan(role,"payments.read"),true);
    assert.equal(staffCan(role,"payments.refund"),role === "super_admin");
  }
});

test("the matrix has exactly the three staff roles", () => {
  assert.deepEqual(Object.keys(STAFF_MATRIX).sort(), [...ROLES].sort());
});

test("super_admin can do every action", () => {
  for (const action of ACTIONS) {
    assert.equal(staffCan("super_admin", action), true, action);
  }
  assert.equal(STAFF_MATRIX.super_admin.size, ACTIONS.length);
  assert.deepEqual(sorted(STAFF_MATRIX.super_admin), sorted(ACTIONS));
});

test("operations holds exactly its six actions", () => {
  assert.deepEqual(sorted(STAFF_MATRIX.operations), sorted(OPERATIONS_ROW));
  assert.equal(STAFF_MATRIX.operations.size, OPERATIONS_ROW.length);
  for (const action of ACTIONS) {
    assert.equal(
      staffCan("operations", action),
      OPERATIONS_ROW.includes(action),
      action,
    );
  }
});

test("operations cannot delete, change settings, manage staff, grant or adjust credits", () => {
  for (const action of [
    "users.delete",
    "library.delete",
    "content.delete",
    "settings.write",
    "staff.manage",
    "entitlements.grant",
    "credits.adjust",
  ] as const) {
    assert.equal(staffCan("operations", action), false, action);
  }
});

test("operations may decide an entitlement request but not grant one", () => {
  assert.equal(staffCan("operations", "entitlements.decide"), true);
  assert.equal(staffCan("operations", "entitlements.grant"), false);
});

test("auditor holds only read actions", () => {
  assert.deepEqual(sorted(STAFF_MATRIX.auditor), ["payments.read", "read"]);
  assert.equal(STAFF_MATRIX.auditor.size, 2);
  for (const action of ACTIONS) {
    assert.equal(staffCan("auditor", action), action === "read" || action === "payments.read", action);
  }
});

test("with no role, nothing is allowed", () => {
  assert.equal(staffCan(null, "read"), false);
  assert.equal(staffCan(undefined, "read"), false);
  for (const action of ACTIONS) {
    assert.equal(staffCan(null, action), false, action);
    assert.equal(staffCan(undefined, action), false, action);
  }
});

test("a role outside the union fails closed and never throws", () => {
  for (const junk of [
    "Super_Admin",
    " operations",
    "auditor ",
    "admin",
    "",
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
  ]) {
    assert.equal(staffCan(junk as StaffRole, "read"), false, junk);
  }
});

test("an action outside the union is denied, even to super_admin", () => {
  for (const role of ROLES) {
    assert.equal(staffCan(role, "users.nuke" as StaffAction), false, role);
    assert.equal(staffCan(role, "" as StaffAction), false, role);
  }
});

test("toStaffRole returns the role only for an exact string match", () => {
  for (const role of ROLES) assert.equal(toStaffRole(role), role);
  for (const v of [
    "Super_Admin",
    "SUPER_ADMIN",
    " operations",
    "operations ",
    "auditor\n",
    "super-admin",
    "admin",
    "",
    "constructor",
    "__proto__",
    "toString",
    null,
    undefined,
    0,
    1,
    true,
    {},
    ["auditor"],
    { toString: () => "auditor" },
    new String("auditor"),
  ]) {
    assert.equal(toStaffRole(v), null, String(v));
  }
});

test("the matrix object cannot be changed", () => {
  assert.equal(Object.isFrozen(STAFF_MATRIX), true);
  assert.throws(() => {
    // @ts-expect-error the matrix is read-only
    STAFF_MATRIX.auditor = new Set<StaffAction>(ACTIONS);
  }, TypeError);
  assert.throws(() => {
    // @ts-expect-error a role row cannot be removed
    delete STAFF_MATRIX.operations;
  }, TypeError);
  assert.equal(staffCan("auditor", "users.delete"), false);
  assert.equal(staffCan("operations", "read"), true);
});

test("a row cannot be changed by any route", () => {
  for (const role of ROLES) {
    const row = STAFF_MATRIX[role];
    const before = sorted(row);

    assert.throws(() => {
      // @ts-expect-error a ReadonlySet has no add
      row.add("users.delete");
    }, TypeError);
    assert.throws(() => {
      // @ts-expect-error a ReadonlySet has no delete
      row.delete("read");
    }, TypeError);
    assert.throws(() => {
      // @ts-expect-error a ReadonlySet has no clear
      row.clear();
    }, TypeError);
    // The native Set methods refuse a receiver that is not a real Set.
    assert.throws(() => Set.prototype.add.call(row, "users.delete"), TypeError);
    assert.throws(() => Set.prototype.clear.call(row), TypeError);
    // Shadowing a method on the row, or on its prototype, is refused.
    assert.equal(Object.isFrozen(row), true);
    assert.throws(() => {
      row.has = () => true;
    }, TypeError);
    const proto: { has?: unknown } = Object.getPrototypeOf(row);
    assert.equal(Object.isFrozen(proto), true);
    assert.throws(() => {
      proto.has = () => true;
    }, TypeError);

    assert.deepEqual(sorted(row), before, role);
  }
  assert.equal(staffCan("auditor", "users.delete"), false);
  assert.equal(staffCan("auditor", "read"), true);
});

test("what a row hands out is a copy that cannot reach back", () => {
  const row = STAFF_MATRIX.auditor;

  const spread = [...row] as string[];
  spread.push("users.delete");

  const union = row.union(new Set<StaffAction>(["users.delete"]));
  assert.equal(union instanceof Set, true);
  union.add("staff.manage");
  const difference = row.difference(new Set<StaffAction>());
  difference.add("credits.adjust");

  let seen: ReadonlySet<StaffAction> | undefined;
  row.forEach((_value, _again, set) => {
    seen = set;
  });
  assert.equal(seen, row, "forEach passes the row, not the Set inside it");

  assert.deepEqual(sorted(row), ["payments.read", "read"]);
  assert.equal(staffCan("auditor", "users.delete"), false);
  assert.equal(staffCan("auditor", "staff.manage"), false);
  assert.equal(staffCan("auditor", "credits.adjust"), false);
});

test("a row reads like a set", () => {
  const row = STAFF_MATRIX.operations;
  assert.equal(row.has("tickets.manage"), true);
  assert.equal(row.has("users.delete"), false);
  assert.deepEqual(sorted(row.keys()), sorted(OPERATIONS_ROW));
  assert.deepEqual(sorted(row.values()), sorted(OPERATIONS_ROW));
  assert.deepEqual(
    [...row.entries()].map(([a, b]) => `${a}=${b}`).sort(),
    sorted(OPERATIONS_ROW).map((a) => `${a}=${a}`),
  );
  assert.equal(row.isSubsetOf(STAFF_MATRIX.super_admin), true);
  assert.equal(STAFF_MATRIX.auditor.isSubsetOf(row), true);
  assert.equal(STAFF_MATRIX.super_admin.isSupersetOf(row), true);
  assert.equal(row.isDisjointFrom(new Set<StaffAction>(["users.delete"])), true);
  assert.deepEqual(
    sorted(row.intersection(STAFF_MATRIX.auditor)),
    ["payments.read", "read"],
  );
  assert.deepEqual(
    sorted(STAFF_MATRIX.auditor.symmetricDifference(row)),
    sorted(OPERATIONS_ROW.filter((a) => a !== "read" && a !== "payments.read")),
  );
});
