/** Locate pinned, read-only test evidence in a delivered ZIP or its source workspace. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const isDeveloperBundle = fs.existsSync(path.join(packageRoot, "MANIFEST.json"));

function selectBundled(relative: string[], sourceWorkspacePath: string): string {
  if (!isDeveloperBundle) return sourceWorkspacePath;
  const bundled = path.join(packageRoot, ...relative);
  if (!fs.existsSync(bundled)) {
    throw new Error(`Developer bundle is incomplete: ${relative.join("/")}`);
  }
  return bundled;
}

export function historicalParseFile(name: string, sourceWorkspacePath: string): string {
  return selectBundled(["evidence", "historical-parse", name], sourceWorkspacePath);
}

export function corpusFile(relative: string[], sourceWorkspacePath: string): string {
  return selectBundled(["corpus", "01_المكتبة_القانونية", ...relative], sourceWorkspacePath);
}
