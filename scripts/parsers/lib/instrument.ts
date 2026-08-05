/**
 * instrument.ts — classify a decree/circular into its real Saudi instrument type.
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS REPLACES
 *
 * parse-decrees.ts detectDecreeType() was a chain of loose substring tests
 * ending in `return "cabinet"`, and the DB CHECK allowed only three values
 * (royal | cabinet | circular), so seed-library.ts clamped everything else.
 *
 * Measured over the clean 2,080-file corpus (after the exclusion fix):
 * **707 of 2,077 typed documents — 34% — were stored under a wrong or
 * under-specified instrument.**
 *
 * The specific legal errors:
 *   • أمر سامي (Supreme Order, 105) was stored as `royal` via a loose
 *     `.includes("أمر")` test. A Supreme Order is a distinct instrument from a
 *     Royal Decree.
 *   • أمر ملكي (Royal Order, 26) was conflated with مرسوم ملكي (Royal Decree,
 *     286) — also distinct instruments.
 *   • قرار وزاري (Ministerial Decision, 15) was parsed "ministerial", which the
 *     CHECK could not store, so the clamp turned it into `circular`.
 *   • قواعد / مبادئ / لائحة / معايير / دليل / سياسة … (≈190 SAMA-style
 *     rulebooks) all hit the catch-all and were asserted to be Cabinet
 *     Decisions — a fabricated legal classification.
 *   • type "قرار" (362) is genuinely ambiguous on its own and was blanket-typed
 *     `cabinet`; `issuing_instrument` resolves 75% of them (see below).
 *
 * DESIGN
 * Exact-match table keyed on the real frontmatter strings measured in the
 * corpus — no substring guessing. Unrecognised values return "unknown" and are
 * COUNTED AND REPORTED; they are never asserted to be some plausible instrument.
 */

/** Instrument types actually present in the corpus, plus an explicit unknown. */
export type InstrumentType =
  | "royal_decree"        // مرسوم ملكي
  | "royal_order"         // أمر ملكي
  | "supreme_order"       // أمر سامي
  | "supreme_directive"   // توجيه سامي
  | "cabinet_decision"    // قرار مجلس الوزراء
  | "ministerial_decision"// قرار وزاري
  | "economic_council_decision" // قرار المجلس الاقتصادي الأعلى
  | "administrative_decision"   // قرار إداري
  | "decision"            // قرار — issuer not determinable from the source
  | "circular"            // تعميم
  | "rules"               // قواعد
  | "principles"          // مبادئ
  | "regulation"          // لائحة
  | "standards"           // معايير
  | "guide"               // دليل / دليل إرشادي
  | "policy"              // سياسة
  | "instructions"        // تعليمات
  | "organization"        // تنظيم
  | "interpretation"      // تفسير
  | "decree"              // مرسوم (unqualified)
  | "law"                 // نظام
  | "unknown";

export const INSTRUMENT_TYPES: readonly InstrumentType[] = [
  "royal_decree", "royal_order", "supreme_order", "supreme_directive",
  "cabinet_decision", "ministerial_decision", "economic_council_decision",
  "administrative_decision", "decision", "circular", "rules", "principles",
  "regulation", "standards", "guide", "policy", "instructions", "organization",
  "interpretation", "decree", "law", "unknown",
];

/** Arabic display label. The verbatim source string is stored separately. */
export const INSTRUMENT_LABEL_AR: Record<InstrumentType, string> = {
  royal_decree: "مرسوم ملكي",
  royal_order: "أمر ملكي",
  supreme_order: "أمر سامي",
  supreme_directive: "توجيه سامي",
  cabinet_decision: "قرار مجلس الوزراء",
  ministerial_decision: "قرار وزاري",
  economic_council_decision: "قرار المجلس الاقتصادي الأعلى",
  administrative_decision: "قرار إداري",
  decision: "قرار",
  circular: "تعميم",
  rules: "قواعد",
  principles: "مبادئ",
  regulation: "لائحة",
  standards: "معايير",
  guide: "دليل",
  policy: "سياسة",
  instructions: "تعليمات",
  organization: "تنظيم",
  interpretation: "تفسير",
  decree: "مرسوم",
  law: "نظام",
  unknown: "غير محدد",
};

export const INSTRUMENT_LABEL_EN: Record<InstrumentType, string> = {
  royal_decree: "Royal Decree",
  royal_order: "Royal Order",
  supreme_order: "Supreme Order",
  supreme_directive: "Supreme Directive",
  cabinet_decision: "Cabinet Decision",
  ministerial_decision: "Ministerial Decision",
  economic_council_decision: "Economic Council Decision",
  administrative_decision: "Administrative Decision",
  decision: "Decision",
  circular: "Circular",
  rules: "Rules",
  principles: "Principles",
  regulation: "Regulation",
  standards: "Standards",
  guide: "Guide",
  policy: "Policy",
  instructions: "Instructions",
  organization: "Organization",
  interpretation: "Interpretation",
  decree: "Decree",
  law: "Law",
  unknown: "Unspecified",
};

/**
 * EXACT match on the frontmatter `type:` string. Every key here was measured in
 * the corpus; the trailing comment is its count at the time of writing.
 */
const TYPE_MAP: Record<string, InstrumentType> = {
  "تعميم": "circular",                          // 873
  "مرسوم ملكي": "royal_decree",                 // 286
  "قرار مجلس الوزراء": "cabinet_decision",      // 211
  "قواعد": "rules",                             // 118
  "أمر سامي": "supreme_order",                  // 105
  "أمر ملكي": "royal_order",                    // 26
  "مبادئ": "principles",                        // 25
  "لائحة": "regulation",                        // 15
  "قرار وزاري": "ministerial_decision",         // 15
  "معايير": "standards",                        // 14
  "دليل": "guide",                              // 10
  "دليل إرشادي": "guide",
  "سياسة": "policy",                            // 3
  "قرار مجلس": "cabinet_decision",              // 3
  "توجيه سامي": "supreme_directive",            // 2
  "مرسوم": "decree",                            // 2
  "تفسير": "interpretation",                    // 2
  "قرار المجلس الاقتصادي الأعلى": "economic_council_decision", // 1
  "قرار إداري": "administrative_decision",      // 1
  "نظام": "law",                                // 1
  "تعليمات": "instructions",                    // 1
  "تنظيم": "organization",                      // 1
};

/**
 * `type: "قرار"` (362 files) is ambiguous — it names the FORM (a decision) but
 * not the issuing authority. `issuing_instrument` resolves 75% of them, and a
 * cross-check against the title found 187 agreements and ZERO contradictions,
 * which is what justifies trusting it as the document's own instrument rather
 * than a cited one. The rest stay the generic "decision" — accurate, if coarse.
 */
const QUALIFIER_MAP: Array<{ match: RegExp; type: InstrumentType }> = [
  { match: /أمر\s*سامي|الأمر\s*السامي/, type: "supreme_order" },       // 160
  { match: /مجلس\s*الوزراء/, type: "cabinet_decision" },                // 75
  { match: /أمر\s*ملكي/, type: "royal_order" },                         // 38
  { match: /وزاري|قرار\s*وزير/, type: "ministerial_decision" },         // 19
  { match: /مرسوم\s*ملكي/, type: "royal_decree" },                      // 1
];

export interface InstrumentClassification {
  type: InstrumentType;
  /** The verbatim source string, preserved for display and citation. */
  instrumentAr: string;
  /** Which signal decided it — makes the result auditable. */
  basis: "type" | "qualifier" | "decree_type" | "none";
}

/**
 * Classify a decree/circular.
 *
 * @param meta parsed frontmatter
 */
export function classifyInstrument(meta: Record<string, unknown>): InstrumentClassification {
  const raw = typeof meta.type === "string" ? meta.type.trim() : "";

  // 1. Exact match on the measured type strings.
  const direct = TYPE_MAP[raw];
  if (direct) {
    // "قرار" alone is a form, not an authority — refine it below.
    if (raw !== "قرار") return { type: direct, instrumentAr: raw, basis: "type" };
  }

  // 2. The ambiguous "قرار" bucket, refined by the cited issuing instrument.
  if (raw === "قرار") {
    const qual = typeof meta.issuing_instrument === "string" ? meta.issuing_instrument : "";
    for (const { match, type } of QUALIFIER_MAP) {
      if (match.test(qual)) return { type, instrumentAr: raw, basis: "qualifier" };
    }
    // Genuinely a decision whose issuer the source does not state.
    return { type: "decision", instrumentAr: raw, basis: "type" };
  }

  // 3. Three files carry no `type:` at all but do carry `decree_type:`.
  if (!raw) {
    const dt = typeof meta.decree_type === "string" ? meta.decree_type.trim() : "";
    const viaDecreeType = TYPE_MAP[dt];
    if (viaDecreeType) return { type: viaDecreeType, instrumentAr: dt, basis: "decree_type" };
  }

  // 4. Unrecognised. Reported and counted — never asserted to be a real
  //    instrument, which is what the old `return "cabinet"` did for 207 files.
  return { type: "unknown", instrumentAr: raw, basis: "none" };
}
