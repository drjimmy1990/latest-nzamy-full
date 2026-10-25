import assert from "node:assert/strict";
import test from "node:test";
import { isPathInOwnerFolder } from "./storagePathOwnership.ts";

const U = "c0000000-0000-0000-0000-00000000000c";
const V = "70000000-0000-0000-0000-00000000007a";

test("isPathInOwnerFolder: the app's own key shapes pass", () => {
  assert.equal(isPathInOwnerFolder(`${U}/1730000000000-claim.pdf`, U), true);
  assert.equal(isPathInOwnerFolder(`${U}/1730000000000-copy-claim.pdf`, U), true);
  assert.equal(isPathInOwnerFolder(`${U}/contracts/ct1/1730000000000-contract.pdf`, U), true);
  assert.equal(isPathInOwnerFolder(`${U}/notes/page_1-1730000000000.webm`, U), true);
  // `..` inside a name is not a traversal (uploadDocumentFile lets dots through).
  assert.equal(isPathInOwnerFolder(`${U}/report..final.pdf`, U), true);
});

test("isPathInOwnerFolder: another user's folder, traversal and malformed keys are refused", () => {
  assert.equal(isPathInOwnerFolder(`${V}/1-secret.pdf`, U), false);
  assert.equal(isPathInOwnerFolder(`${U}/../${V}/1-secret.pdf`, U), false);
  assert.equal(isPathInOwnerFolder(`${U}/./a.pdf`, U), false);
  assert.equal(isPathInOwnerFolder(`${U}//a.pdf`, U), false);
  assert.equal(isPathInOwnerFolder(`/${U}/a.pdf`, U), false);
  assert.equal(isPathInOwnerFolder(`${U}/`, U), false);
  assert.equal(isPathInOwnerFolder(U, U), false);
  assert.equal(isPathInOwnerFolder(`${U}x/a.pdf`, U), false);
});

test("isPathInOwnerFolder: a missing owner or path is refused", () => {
  assert.equal(isPathInOwnerFolder(`${U}/a.pdf`, null), false);
  assert.equal(isPathInOwnerFolder(`${U}/a.pdf`, ""), false);
  assert.equal(isPathInOwnerFolder(null, U), false);
  assert.equal(isPathInOwnerFolder("", U), false);
  assert.equal(isPathInOwnerFolder(42, U), false);
});
