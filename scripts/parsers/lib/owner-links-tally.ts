/**
 * owner-links-tally.ts — how many of the owner's links (src/lib/library/ownerLinks.ts)
 * name exactly one law of this parse run, with the same strict rules the
 * graph watchdog applies (src/lib/ai/graphOwnerLinks.ts). Printed by the laws
 * parser, so the owner sees on his own run which links make a graph link and
 * which name nothing (or several laws) and need a fix in his files.
 */
import type { OwnerLink } from "../../../src/lib/library/ownerLinks";
import { buildOwnerLinkIndex, resolveOwnerLinkTarget, type OwnerLinkLaw } from "../../../src/lib/ai/graphOwnerLinks";

export interface TallyLaw {
  slug: string;
  title: string;
  law_status?: string | null;
  instrument_id?: string | null;
  law_guid?: string | null;
  issuance_decree?: string | null;
  owner_links?: OwnerLink[] | null;
}

export interface OwnerLinkTally {
  links: number;
  resolved: number;
  /** "<law slug> · <kind> · <what it names> — not found | names several laws" */
  unresolved: string[];
  summary: string;
}

/** Which way a title tie leans for each kind (the same as the watchdog). */
const PREFER: Record<OwnerLink["kind"], "repealed" | "in_force" | null> = {
  superseded_by: "in_force",
  repealed_by: "in_force",
  supersedes: "repealed",
  repeals: "repealed",
  affects: null,
  related: null,
};

const describe = (l: OwnerLink) => l.slug ?? l.id ?? l.guid ?? l.name ?? "";

export function tallyOwnerLinks(laws: readonly TallyLaw[]): OwnerLinkTally {
  const idx = buildOwnerLinkIndex<OwnerLinkLaw>(
    laws.map((l) => ({
      slug: l.slug,
      title: l.title,
      status: l.law_status ?? null,
      instrumentId: l.instrument_id || null,
      lawGuid: l.law_guid || null,
      issuingInstrument: l.issuance_decree || null,
    })),
  );
  const byKind = new Map<string, number>();
  let links = 0;
  let resolved = 0;
  const unresolved: string[] = [];
  for (const law of laws) {
    for (const link of law.owner_links ?? []) {
      links++;
      byKind.set(link.kind, (byKind.get(link.kind) ?? 0) + 1);
      const r = resolveOwnerLinkTarget(link, idx, PREFER[link.kind]);
      if (r.law) resolved++;
      else unresolved.push(`${law.slug} · ${link.kind} · ${describe(link)} — ${r.why === "ambiguous" ? "names several laws" : "not found"}`);
    }
  }
  const kinds = [...byKind].map(([k, n]) => `${k} ${n}`).join(", ") || "none";
  return {
    links,
    resolved,
    unresolved,
    summary: `owner links: ${links} (${kinds}); ${resolved} name exactly one library law, ${unresolved.length} do not`,
  };
}
