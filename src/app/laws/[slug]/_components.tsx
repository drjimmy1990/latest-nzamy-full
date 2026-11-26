import { memo } from "react";
import { ArticleBlock as ArticleBlockCard } from "./_article-components";

export {
  PreambleBlock,
  RightPanel,
  MD,
} from "./_article-components";

/**
 * Owner package 25-Nov (A-72, annex 09 P-05): long laws froze the tab while
 * scrolling. Every article the reader scrolls past sets `activeId` (one
 * IntersectionObserver per card), and every `activeId` change re-rendered
 * EVERY article card — 249 on /laws/labor-law, measured live at 106–141 ms per
 * change for a guest's short previews, more for a subscriber's full texts. A
 * memoised card re-renders only when its own props change (the two cards
 * whose `isActive` flips); page.tsx keeps the callbacks it passes stable.
 * Every card stays in the page, so anchors, the contents jumps, in-page search
 * and print are untouched.
 */
export const ArticleBlock = memo(ArticleBlockCard);

export { DraftDrawer } from "@/components/laws/DraftDrawer";
export type { CartEntry } from "@/components/laws/DraftDrawer";

export { ArticleExplainModal, CommunityQuestionModal, LibraryAI } from "./_ai-components";
