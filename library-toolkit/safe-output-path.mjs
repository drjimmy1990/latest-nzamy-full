/** Resolve a prospective fresh output through existing symlinked ancestors. */
import fs from "node:fs";
import path from "node:path";

function entryExists(candidate) {
  try { fs.lstatSync(candidate); return true; }
  catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function contains(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/** The test ZIP keeps web/ beside corpus/, sample/, and its manifest. */
export function protectedPackageRoot(webRoot) {
  const web = path.resolve(webRoot);
  const parent = path.dirname(web);
  if (path.basename(web) === "web"
    && entryExists(path.join(parent, "MANIFEST.json"))
    && entryExists(path.join(parent, "corpus"))
    && entryExists(path.join(parent, "sample"))) {
    return parent;
  }
  return web;
}

export function assertFreshExternalOutput(outputPath, protectedRoots) {
  const output = path.resolve(outputPath);
  if (entryExists(output)) throw new Error(`Output already exists: ${output}`);

  let existingAncestor = path.dirname(output);
  while (!entryExists(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error(`No existing output ancestor: ${output}`);
    existingAncestor = parent;
  }
  const ancestorStat = fs.statSync(existingAncestor);
  if (!ancestorStat.isDirectory()) throw new Error(`Output ancestor is not a directory: ${existingAncestor}`);
  const prospectiveReal = path.resolve(fs.realpathSync(existingAncestor), path.relative(existingAncestor, output));

  for (const rootPath of protectedRoots) {
    const rootReal = fs.realpathSync(path.resolve(rootPath));
    if (contains(rootReal, prospectiveReal) || contains(prospectiveReal, rootReal)) {
      throw new Error(`Output overlaps protected root after realpath: ${output}`);
    }
  }
  return output;
}
