"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
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
 * The persisted graph itself (`case_graphs`) shipped 2026-09-03 — `caseId`
 * below is what makes this board load and autosave for real now, the same
 * as the lawyer case file. This component took no props before; the id has
 * to come from its own caller, `firm/cases/[id]/page.tsx`, which itself does
 * not read `[id]` from the URL for anything else on that page today — a
 * separate, larger finding (that whole page is a static mock regardless of
 * which case is opened), flagged but out of scope for this table.
 */
const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false },
);

// T18-P1-32 (batch l11): the named boards of the case map, as on the lawyer case file.
const CaseBoardSwitcher = dynamic(() => import("@/app/dashboard/business/kanban/CaseBoardSwitcher"), { ssr: false });

export default function LegalCanvas({ caseId }: { caseId?: string }) {
  const { isDark } = useTheme();
  const [board, setBoard] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  return (
    <div className="space-y-2">
      {caseId && <CaseBoardSwitcher caseId={caseId} value={board} onChange={setBoard} onRenamed={() => setRev((n) => n + 1)} isDark={isDark} />}
      <div className="overflow-hidden rounded-2xl" style={{ height: "580px" }}>
        <CaseGraphView key={`${board ?? "main"}:${rev}`} isDark={isDark} isGlobal={false} caseId={caseId} boardId={board} enableCaseImport />
      </div>
    </div>
  );
}
