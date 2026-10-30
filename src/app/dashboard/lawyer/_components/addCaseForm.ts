/**
 * addCaseForm — AddCaseModal's decisions, kept out of the component so
 * `node --test` can check them (CODE-F19, CODE-F30, CODE-F34).
 */

/**
 * The success screen's status line, from the status the SERVER saved
 * (CODE-F19). It used to say «تم إدراجها في قائمة قضاياك النشطة» whatever
 * came back — while the row is born `pending_assignment`, which the cases
 * board files under «انتظار», not «نشطة». The board's column names are the
 * ones workflowToCase (src/constants/lawyerCasesData.ts) gives each status.
 */
const SAVED_STATUS: Record<string, { label: string; board: string }> = {
  pending_assignment: { label: "بانتظار الإسناد", board: "انتظار" },
  draft:              { label: "مسودة",          board: "انتظار" },
  pending_payment:    { label: "بانتظار السداد",  board: "انتظار" },
  in_review:          { label: "قيد المراجعة",    board: "نشطة" },
  assigned:           { label: "نشطة",           board: "نشطة" },
  completed:          { label: "مكتملة",         board: "مغلقة" },
  cancelled:          { label: "ملغاة",          board: "أرشيف" },
};

export function caseSavedStatusLine(status: string | null | undefined): string {
  const known = status ? SAVED_STATUS[status] : undefined;
  if (!known) return "حُفظت القضية، ولم يُعِد الخادم حالتها — راجعها في قائمة قضاياك.";
  return `حالتها كما حفظها النظام: «${known.label}»، وتظهر في قائمة قضاياك ضمن «${known.board}».`;
}

export type AddCaseDraft = {
  selectedClientId: string;
  clientName: string;
  title: string;
  courtChoice: string;
  courtOther: string;
  priority: string;
  description: string;
};

/** True when closing would throw away something the lawyer typed or picked (CODE-F34). */
export function isAddCaseDirty(d: AddCaseDraft): boolean {
  return Boolean(
    d.selectedClientId ||
    d.clientName.trim() ||
    d.title.trim() ||
    d.courtChoice ||
    d.courtOther.trim() ||
    d.description.trim() ||
    d.priority !== "normal",
  );
}

/**
 * A card already carrying the typed name (CODE-F30): offered back to the
 * lawyer so typing a known موكّل's name does not quietly make a second card.
 */
export function cardNamed<T extends { id: string; name: string }>(cards: readonly T[], typed: string): T | null {
  const want = typed.trim().replace(/\s+/g, " ");
  if (!want) return null;
  return cards.find((c) => c.name.trim().replace(/\s+/g, " ") === want) ?? null;
}
