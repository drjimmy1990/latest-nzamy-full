import assert from "node:assert/strict";
import test from "node:test";
import {
  fileFolderOwner,
  isMissingFolderOwnerColumn,
  isOwnLicencePath,
  isPathInOwnerFolder,
  isRemovableWithRow,
  isShareServable,
} from "./storagePathOwnership.ts";

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

const LIVE = { id: 900, owner_user_id: U, storage_path: `${U}/1-own.pdf`, deleted_at: null };
const SHARE = { owner_id: U, document_id: "900", document_path: `${U}/1-own.pdf` };

test("isShareServable: the route's own share of the owner's live document", () => {
  assert.equal(isShareServable(SHARE, LIVE), true);
  assert.equal(isShareServable(SHARE, { ...LIVE, deleted_at: undefined }), true);
});

test("isShareServable: forged, moved, binned, foreign or missing documents are refused", () => {
  assert.equal(isShareServable(SHARE, null), false);
  assert.equal(isShareServable(SHARE, { ...LIVE, deleted_at: "2026-10-26T00:00:00Z" }), false);
  assert.equal(isShareServable({ ...SHARE, document_path: `${V}/1-secret.pdf` }, LIVE), false);
  assert.equal(isShareServable({ ...SHARE, document_id: "901" }, LIVE), false);
  assert.equal(isShareServable({ ...SHARE, document_id: null }, LIVE), false);
  assert.equal(isShareServable({ ...SHARE, owner_id: V }, LIVE), false);
  // a pre-65 attachments row pointing outside its owner's folder
  const forged = { ...LIVE, storage_path: `${V}/1-secret.pdf` };
  assert.equal(isShareServable({ ...SHARE, document_path: `${V}/1-secret.pdf` }, forged), false);
  // another user's document, shared by a case participant before 66
  const theirs = { ...LIVE, owner_user_id: V, storage_path: `${V}/1-case.pdf` };
  assert.equal(isShareServable({ ...SHARE, document_path: `${V}/1-case.pdf` }, theirs), false);
});

const F = "0f000000-0000-0000-0000-00000000000f";

test("fileFolderOwner: the recorded folder first, the writer otherwise", () => {
  assert.equal(fileFolderOwner(U, F), U);
  assert.equal(fileFolderOwner(null, F), F);
  assert.equal(fileFolderOwner(undefined, F), F);
  assert.equal(fileFolderOwner("", F), F);
  assert.equal(fileFolderOwner(null, null), null);
});

test("isShareServable: the firm owner's share of a document 20261026_70 moved to him from a member's folder (20261026_72)", () => {
  const moved = { id: 900, owner_user_id: F, folder_owner_id: U, storage_path: `${U}/1-own.pdf`, deleted_at: null };
  assert.equal(isShareServable({ ...SHARE, owner_id: F }, moved), true);
  // the member's old share of it stops working: the document is no longer his
  assert.equal(isShareServable(SHARE, moved), false);
  // without the recorded folder the move looks like a forgery and is refused
  assert.equal(isShareServable({ ...SHARE, owner_id: F }, { ...moved, folder_owner_id: null }), false);
  // a recorded folder that is not the path's is refused
  assert.equal(isShareServable({ ...SHARE, owner_id: F, document_path: `${V}/1-secret.pdf` },
                               { ...moved, storage_path: `${V}/1-secret.pdf` }), false);
});

test("isOwnLicencePath: only licences/<that lawyer>/<file>", () => {
  assert.equal(isOwnLicencePath(`licences/${U}/1730000000000-licence.png`, U), true);
  assert.equal(isOwnLicencePath(`licences/${V}/1-licence.png`, U), false);
  assert.equal(isOwnLicencePath(`${U}/1-licence.png`, U), false);
  assert.equal(isOwnLicencePath(`licences/${U}/../${V}/1-secret.pdf`, U), false);
  assert.equal(isOwnLicencePath(`licences/${U}`, U), false);
  assert.equal(isOwnLicencePath(`licences/${U}/`, U), false);
  assert.equal(isOwnLicencePath(null, U), false);
  assert.equal(isOwnLicencePath(`licences/${U}/1.png`, null), false);
});

// ── the delete paths: the bytes go with the row (final review, item 1) ──────
// MEMBER wrote the file in his folder; 20261026_70 moved the row to the firm
// OWNER; folder_owner_id (20261026_72) still names MEMBER.
const MEMBER = "a0000000-0000-0000-0000-0000000000a1";
const OWNER = "b0000000-0000-0000-0000-0000000000b1";

test("isRemovableWithRow: a document 70 moved to the firm owner is removed from the member's folder", () => {
  assert.equal(isRemovableWithRow(`${MEMBER}/1-firm.pdf`, MEMBER, OWNER), true);
  // The old rule (the row's current owner) kept it: the leak this closes.
  assert.equal(isPathInOwnerFolder(`${MEMBER}/1-firm.pdf`, OWNER), false);
});

test("isRemovableWithRow: a contract version whose uploader was deleted (uploaded_by null) is removed from his folder", () => {
  assert.equal(isRemovableWithRow(`${MEMBER}/contracts/c1/1-v.pdf`, MEMBER, null), true);
});

test("isRemovableWithRow: with no recorded folder the writer decides — a pre-65 forgery is kept", () => {
  assert.equal(isRemovableWithRow(`${MEMBER}/1-own.pdf`, null, MEMBER), true);
  assert.equal(isRemovableWithRow(`${MEMBER}/1-not-yours.pdf`, null, OWNER), false);
  assert.equal(isRemovableWithRow(`${MEMBER}/1-v.pdf`, null, null), false);
  assert.equal(isRemovableWithRow(`${MEMBER}/1-v.pdf`, undefined, null), false);
  assert.equal(isRemovableWithRow(`${MEMBER}/../${OWNER}/1.pdf`, MEMBER, MEMBER), false);
});

test("isMissingFolderOwnerColumn: only folder_owner_id missing lets a delete path retry without it", () => {
  assert.equal(isMissingFolderOwnerColumn({ code: "42703", message: "column attachments.folder_owner_id does not exist" }), true);
  assert.equal(
    isMissingFolderOwnerColumn({ code: "PGRST204", message: "Could not find the 'folder_owner_id' column of 'contract_versions' in the schema cache" }),
    true,
  );
  assert.equal(isMissingFolderOwnerColumn({ code: "42703", message: "column attachments.other does not exist" }), false);
  assert.equal(isMissingFolderOwnerColumn({ code: "42501", message: "permission denied for column folder_owner_id" }), false);
  assert.equal(isMissingFolderOwnerColumn({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(isMissingFolderOwnerColumn(null), false);
  assert.equal(isMissingFolderOwnerColumn({ code: "42703" }), false);
});
