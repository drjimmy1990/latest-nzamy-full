/**
 * Two-level chapters in the reader (owner-approved 2026-10-04).
 *
 * The detail API sends a law's chapters as ONE ordered list — the order the
 * articles are read in. A chapter may carry `level` (1|2) and, for level 2,
 * `parentChapterId`. This turns that list into top-level nodes, each with the
 * level-2 chapters that sit under it, without ever moving a chapter:
 *
 *  - A level-2 chapter joins a group only when the chapter right before it (or
 *    the group it is already in) is its level-1 parent. Anything else — no
 *    parent, a parent elsewhere in the list, a parent that is not level 1 — is
 *    shown as a top-level chapter. So flattening the tree always gives back
 *    the input list in the input order, and no article is ever moved.
 *  - A chapter without `level` is level 1. A list with no level data at all
 *    gives one node per chapter with no children: exactly today's flat list.
 *
 * Pure, no imports: `node --test` loads it (_chapter-tree.test.ts).
 */

export interface TreeChapterLike {
  id?: string | null;
  level?: number | null;
  parentChapterId?: string | null;
}

export interface ChapterTreeChild<C> {
  chapter: C;
  /** Position in the input list (stable key, and what flattening restores). */
  index: number;
}

export interface ChapterTreeNode<C> extends ChapterTreeChild<C> {
  /** Level-2 chapters shown under this one, in input order. Empty = a plain chapter. */
  children: ChapterTreeChild<C>[];
}

export function buildChapterTree<C extends TreeChapterLike>(chapters: readonly C[]): ChapterTreeNode<C>[] {
  const nodes: ChapterTreeNode<C>[] = [];
  // The group that the next level-2 chapter may join: the last top-level
  // chapter, while it is a level-1 chapter with an id and only its own
  // children have followed it.
  let open: ChapterTreeNode<C> | null = null;

  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index];
    const parentId = chapter.level === 2 ? chapter.parentChapterId : null;
    if (parentId && open !== null && open.chapter.id === parentId) {
      open.children.push({ chapter, index });
      continue;
    }
    const node: ChapterTreeNode<C> = { chapter, index, children: [] };
    nodes.push(node);
    open = chapter.level !== 2 && chapter.id ? node : null;
  }

  return nodes;
}

/** The chapters back in reading order — always the input list, element for element. */
export function flattenChapterTree<C>(nodes: readonly ChapterTreeNode<C>[]): C[] {
  return nodes.flatMap((node) => [node.chapter, ...node.children.map((child) => child.chapter)]);
}
