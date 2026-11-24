/**
 * «التشريعات الفرعية» as a TAB (owner spec 06, 23 Nov, batch l14): the
 * permanent «التشريعات الفرعية (N)» box is gone from the law page; under the
 * tabs, the chosen tab's options — «الكل», then every sub-legislation by name:
 *
 *   1. the regulations MERGED into this file, in the order of the index the
 *      route builds for every viewer (`regulationIndex`). One with a card in
 *      `regulationInstruments` filters the view on that instrument; one whose
 *      every article is withheld by the paywall is still named («locked»).
 *      Old payloads without instruments use the names read off the articles.
 *   2. the documents LINKED by their own `parent_law_id`
 *      (`subLegislation.children`, already in the owner's order: the executive
 *      regulation first, then the newest) — each opens its own page.
 *
 * The first REG_OPTIONS_SHOWN, then «عرض المزيد» (owner file 16 §7); a chosen
 * one always stays visible. Pure, so the order is tested without a browser.
 */

/** Owner file 16 §7: two or three entries, then «عرض المزيد». */
export const REG_OPTIONS_SHOWN = 3;

export type RegulationOption =
  /** Filters the view: selectedRegName = key. */
  | { kind: "merged"; key: string; label: string }
  /** Every article of it is behind the paywall: named, opens the upgrade. */
  | { kind: "locked"; key: string; label: string }
  /** A separate file in the library: opens its page. */
  | { kind: "linked"; key: string; slug: string; label: string; status?: string };

export interface RegulationOptionsInput {
  instruments?: ReadonlyArray<{ ref: string; label?: string }> | null;
  index?: ReadonlyArray<{ name: string; entries: ReadonlyArray<{ card: readonly [number, number] | [number, number] | null }> }> | null;
  /** Names read off the articles — used only when there are no instruments and no index. */
  legacyNames?: readonly string[] | null;
  children?: ReadonlyArray<{ slug: string; title?: string; status?: string }> | null;
}

export function regulationOptions(input: RegulationOptionsInput): RegulationOption[] {
  const instruments = input.instruments ?? [];
  const index = input.index ?? [];
  const out: RegulationOption[] = [];
  const seen = new Set<string>();
  const push = (o: RegulationOption) => {
    if (seen.has(o.key)) return;
    seen.add(o.key);
    out.push(o);
  };

  if (instruments.length > 0 || index.length > 0) {
    const used = new Set<number>();
    for (const group of index) {
      const name = (group.name ?? "").trim();
      const card = group.entries.find((e) => e.card != null)?.card ?? null;
      const inst = card ? instruments[card[0]] : undefined;
      if (card && inst) {
        used.add(card[0]);
        push({ kind: "merged", key: inst.ref, label: (inst.label || inst.ref).trim() || name });
      } else if (name) {
        push({ kind: "locked", key: `locked:${name}`, label: name });
      }
    }
    // Defensive: an instrument the index did not name still gets its chip.
    instruments.forEach((inst, i) => {
      if (used.has(i)) return;
      push({ kind: "merged", key: inst.ref, label: (inst.label || inst.ref).trim() });
    });
  } else {
    for (const raw of input.legacyNames ?? []) {
      const name = (raw ?? "").trim();
      if (name) push({ kind: "merged", key: name, label: name });
    }
  }

  for (const child of input.children ?? []) {
    if (!child?.slug) continue;
    push({ kind: "linked", key: `child:${child.slug}`, slug: child.slug, label: (child.title || child.slug).trim(), status: child.status });
  }
  return out;
}

/**
 * The row is drawn when there is a choice to make: two or more entries, or
 * any linked document (it is the only way into that file from this page).
 */
export function showRegulationOptions(options: readonly RegulationOption[]): boolean {
  return options.length >= 2 || options.some((o) => o.kind === "linked");
}

/** «الكل» leads the row when at least one entry is part of this file. */
export function hasAllOption(options: readonly RegulationOption[]): boolean {
  return options.some((o) => o.kind !== "linked");
}

/** The entries on screen: the first REG_OPTIONS_SHOWN, plus the chosen one. */
export function visibleRegulationOptions(
  options: readonly RegulationOption[],
  showAll: boolean,
  selectedKey: string | null,
): RegulationOption[] {
  return options.filter((o, i) => showAll || i < REG_OPTIONS_SHOWN || o.key === selectedKey);
}
