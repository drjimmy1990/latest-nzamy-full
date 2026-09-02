"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";

/**
 * LegalCanvas — now a thin wrapper over the REAL case-graph canvas.
 *
 * ── WHAT WAS HERE, AND WHY IT WAS THE WORST KIND OF MOCK ────────────────────
 *
 * `MOCK_NODES` and `MOCK_EDGES`: a complete, invented commercial dispute,
 * rendered on the «canvas» tab of every firm case file.
 *
 *     المحكمة التجارية بالرياض        a named court
 *     شركة الأفق للمقاولات (المدعي)   a named plaintiff company
 *     مؤسسة النور (المدعى عليه)       a named defendant
 *     سلمان العتيبي (محامي)           a named lawyer
 *     مطالبة مالية (١.٢ مليون)        a 1.2 MILLION riyal claim
 *
 * …wired together with real-sounding relations («يطالب بـ», «منظورة أمام»,
 * «مستند داعم»).
 *
 * The component took NO PROPS. Not a fallback for a case with no graph — the
 * SAME fabricated dispute on every case file a firm opened, over whatever real
 * case header sat above it. A partner opening case A and case B saw identical
 * parties and an identical seven-figure claim, and nothing on screen said it
 * was sample data. Matrix row 2 ordered these deleted; the LAWYER case file did
 * delete them (see the note at lawyer/cases/[id]/page.tsx:1283) and this file,
 * on the firm surface, kept its own copy. The same half-fix this wave keeps
 * finding: the shape was closed on one screen and left alive on its sibling.
 *
 * ── WHY A RE-EXPORT AND NOT AN EMPTY DIV ───────────────────────────────────
 *
 * Because the honest version already exists and is already mounted next door.
 * `CaseGraphView` is the canvas the lawyer case file uses: a real editable
 * board with its own empty state, written for exactly this situation —
 * «An empty board is now the honest starting point for a case file». It starts
 * blank and the user builds the map, instead of being handed someone else's.
 *
 * Loaded with `ssr: false` for the same reason the lawyer page does: the canvas
 * measures the DOM.
 *
 * The persisted graph itself (`case_graphs`) is Phase 1 of the build plan, so
 * what a firm draws here still does not survive a reload — that is a missing
 * table, not a licence to seed the board with a fake case in the meantime.
 */
const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false },
);

export default function LegalCanvas() {
  const { isDark } = useTheme();
  return (
    <div className="overflow-hidden rounded-2xl" style={{ height: "580px" }}>
      <CaseGraphView isDark={isDark} isGlobal={false} />
    </div>
  );
}
