"use client";

/**
 * The «add to the draft» mark of the library readers (owner lib02, «New 2»,
 * batch l12): the old «+» read as a cross next to the article text. A bookmark
 * (BookmarkSimple, Codex item 3 of file 11: the saving icon) with the words
 * «أضف للمسودة»; once the item is in the draft, a check — never a minus.
 * One component so every reader shows the same mark.
 */
import { BookmarkSimple, Check } from "@phosphor-icons/react";

export const DRAFT_ADD_LABEL_AR = "أضف للمسودة";
export const DRAFT_IN_LABEL_AR = "في المسودة";

export function DraftToggleIcon({ inDraft, size = 12 }: { inDraft: boolean; size?: number }) {
  return inDraft ? <Check size={size} weight="bold" aria-hidden="true" /> : <BookmarkSimple size={size} aria-hidden="true" />;
}

/** The icon and, from sm up, its words — for the article and regulation bars. */
export function DraftToggleLabel({ inDraft, size = 12 }: { inDraft: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <DraftToggleIcon inDraft={inDraft} size={size} />
      <span className="hidden sm:inline text-[11px] font-semibold">{inDraft ? DRAFT_IN_LABEL_AR : DRAFT_ADD_LABEL_AR}</span>
    </span>
  );
}
