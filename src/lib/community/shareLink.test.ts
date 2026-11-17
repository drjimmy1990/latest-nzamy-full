import assert from "node:assert/strict";
import test from "node:test";
import { shareOrCopyLink } from "./shareLink.ts";

const URL_ = "https://example.test/community/0f8fad5b-d9cb-469f-a165-70867728950e";

test("the share sheet is used when the browser has one", async () => {
  const calls: unknown[] = [];
  const out = await shareOrCopyLink(URL_, "سؤال", { share: async (d) => { calls.push(d); } });
  assert.equal(out, "shared");
  assert.deepEqual(calls, [{ title: "سؤال", url: URL_ }]);
});

test("closing the share sheet is not an error and copies nothing", async () => {
  let copied = false;
  const out = await shareOrCopyLink(URL_, "t", {
    share: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); },
    clipboard: { writeText: async () => { copied = true; } },
  });
  assert.equal(out, "cancelled");
  assert.equal(copied, false);
});

test("no share sheet → the link is copied; a refused share falls back to the copy", async () => {
  let copied = "";
  assert.equal(await shareOrCopyLink(URL_, "t", { clipboard: { writeText: async (s) => { copied = s; } } }), "copied");
  assert.equal(copied, URL_);
  const out = await shareOrCopyLink(URL_, "t", {
    share: async () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); },
    clipboard: { writeText: async () => {} },
  });
  assert.equal(out, "copied");
});

test("neither available (or the clipboard refuses) → manual, never a claimed copy", async () => {
  assert.equal(await shareOrCopyLink(URL_, "t", {}), "manual");
  assert.equal(await shareOrCopyLink(URL_, "t", undefined), "manual");
  assert.equal(
    await shareOrCopyLink(URL_, "t", { clipboard: { writeText: async () => { throw new Error("denied"); } } }),
    "manual",
  );
});
