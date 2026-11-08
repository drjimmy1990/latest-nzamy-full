import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { serializeJsonLd } from "../lib/library/libraryMetadata.ts";

const SOURCE = readFileSync("src/components/ArticleJsonLd.tsx", "utf8");

test("blog JSON-LD is written through serializeJsonLd, never raw JSON.stringify", () => {
  assert.match(SOURCE, /import \{ serializeJsonLd \} from "@\/lib\/library\/libraryMetadata";/);
  assert.match(SOURCE, /dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(b\) \}\}/);
  assert.doesNotMatch(SOURCE, /__html: JSON\.stringify/);
});

test("serializeJsonLd keeps a title with markup inside the script element", () => {
  const title = "عنوان </script><b>x</b> & \u2028";
  const out = serializeJsonLd({ headline: title });
  assert.doesNotMatch(out, /[<>&\u2028]/);
  assert.equal(JSON.parse(out).headline, title);
});
