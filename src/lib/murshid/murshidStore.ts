/**
 * murshidStore — SERVER ONLY. Reads «المرشد القضائي» data from
 * src/data/murshid/ with fs and keeps the public projection in memory.
 * ─────────────────────────────────────────────────────────────────────────────
 * The files are written by scripts/murshid-import.mjs, which keeps only what
 * these routes serve (the repository is public). The public projection below
 * is applied again on top, as a second layer.
 *
 * The 32 sector files are ~2 MB, so they are never imported by a client
 * component (a source-contract test pins that): the browser asks
 * /api/v1/murshid/* for the slice it shows. Read with fs rather than imported,
 * so the JSON is not compiled into a server chunk either; the deploy runs
 * `next start` from the repository folder (deploy.sh), so process.cwd() is the
 * repository root, as it is for `npm run test:unit`.
 *
 * A sector file that fails validateSectorFile is skipped and logged, not
 * served half-broken.
 */

import fs from "node:fs";
import path from "node:path";
import {
  searchEntries,
  sectorSummary,
  toPublicChannels,
  toPublicSector,
  validateSectorFile,
  type MurshidChannel,
  type MurshidSearchEntry,
  type MurshidSector,
  type MurshidSectorSummary,
} from "./murshidData.ts";
import { extractUserGuide, parseGuideBlocks, stripInternalNotes, type GuideBlock } from "./guideBlocks.ts";

export const MURSHID_DATA_DIR = path.join(process.cwd(), "src", "data", "murshid");
export const NAJIZ_GUIDE_FILE = "najiz-guide-2026-10-28.md";
/** The date the owner's package states for every file in it. */
export const MURSHID_SOURCE_DATE = "2026-10-28";

interface Loaded {
  sectors: MurshidSector[];
  index: MurshidSectorSummary[];
  entries: MurshidSearchEntry[];
}

let loaded: Loaded | null = null;
let channels: MurshidChannel[] | null = null;
let guide: GuideBlock[] | null = null;

function loadSectors(): Loaded {
  if (loaded) return loaded;
  const dir = path.join(MURSHID_DATA_DIR, "sectors");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^sector_\d+_.*\.json$/.test(f))
    .sort();
  const sectors: MurshidSector[] = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as unknown;
    const errors = validateSectorFile(raw);
    const sector = errors.length === 0 ? toPublicSector(raw) : null;
    if (!sector) {
      console.error(`[murshid] skipped ${f}: ${errors.slice(0, 5).join("; ")}`);
      continue;
    }
    sectors.push(sector);
  }
  sectors.sort((a, b) => a.no - b.no);
  loaded = { sectors, index: sectors.map(sectorSummary), entries: searchEntries(sectors) };
  return loaded;
}

export function getSectorIndex(): MurshidSectorSummary[] {
  return loadSectors().index;
}

export function getSector(no: number): MurshidSector | null {
  return loadSectors().sectors.find((s) => s.no === no) ?? null;
}

export function getSearchEntries(): MurshidSearchEntry[] {
  return loadSectors().entries;
}

export function getNationalChannels(): MurshidChannel[] {
  if (!channels) {
    const raw = JSON.parse(fs.readFileSync(path.join(MURSHID_DATA_DIR, "unified_channels.json"), "utf8")) as unknown;
    channels = toPublicChannels(raw);
  }
  return channels;
}

export function getNajizGuide(): GuideBlock[] {
  if (!guide) {
    const md = fs.readFileSync(path.join(MURSHID_DATA_DIR, NAJIZ_GUIDE_FILE), "utf8");
    // Already sliced and cleaned at import; repeated here as a second layer.
    guide = parseGuideBlocks(stripInternalNotes(extractUserGuide(md)).md);
  }
  return guide;
}
