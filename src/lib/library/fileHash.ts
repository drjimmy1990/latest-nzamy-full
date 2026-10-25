/**
 * SHA-256 of a file's raw bytes, streamed (N2.7, the owner's «الميثاق» ٣:
 * «تقرير الفروق … مرتبط ببصمات المصادر (SHA-256)»).
 *
 * scripts/library-rows-diff.mjs records the hash of every JSONL file it
 * compared in rows-diff-report.json, so a report names exactly the bytes it
 * judged: if a rows file changes after the diff, its hash no longer matches
 * and the verdict does not carry over. The bytes are hashed as they are on
 * disk — never re-serialized — so the same file gives the same hash anywhere.
 *
 * Node built-ins only: node:test and the .mjs script both load it.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export interface FileHash {
  sha256: string;
  bytes: number;
}

export function sha256OfFile(file: string): Promise<FileHash> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let bytes = 0;
    createReadStream(file)
      .on("data", (chunk: string | Buffer) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        bytes += buf.length;
        hash.update(buf);
      })
      .on("error", reject)
      .on("end", () => resolve({ sha256: hash.digest("hex"), bytes }));
  });
}

/** Hashes of `<dir>/<table>.jsonl` for each table whose file exists; a missing file is absent from the map. */
export async function hashRowFiles(
  dir: string,
  tables: readonly string[],
  exists: (file: string) => boolean,
  join: (...parts: string[]) => string,
): Promise<Record<string, FileHash>> {
  const out: Record<string, FileHash> = {};
  for (const t of tables) {
    const file = join(dir, `${t}.jsonl`);
    if (exists(file)) out[`${t}.jsonl`] = await sha256OfFile(file);
  }
  return out;
}
