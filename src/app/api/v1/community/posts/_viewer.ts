/**
 * The signed-in reader's own state on community rows: his vote on a post or an
 * answer, and whether he saved («حفظ») a post (owner TODO N05-C4..7).
 *
 * Read with the reader's own RLS-scoped client: community_votes and
 * community_saves let a user read only his own rows ("users read their own
 * votes", 20260603_phase1_004; "users read their own community saves",
 * 20261125_53), so nothing here can reveal another member's vote. A guest
 * gets "no vote, not saved" without a query.
 *
 * A failed read (for example community_saves before 20261125_53 is applied)
 * is logged and read as "no vote / not saved": the counts on the page still
 * come from the post row, and the next click writes and re-reads the truth.
 */

import type { FeedViewerState } from "./_feed";
import { voteValue } from "./_feed";

/** The two reads this needs, in the shape supabase-js answers them. */
interface Readable {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        in(column: string, values: string[]): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
    };
  };
}

export interface ViewerState {
  forPost(postId: string): FeedViewerState;
  voteOn(targetType: "post" | "answer", targetId: string): -1 | 0 | 1;
  savedPost(postId: string): boolean;
}

const NOBODY: ViewerState = {
  forPost: () => ({ myVote: 0, saved: false }),
  voteOn: () => 0,
  savedPost: () => false,
};

export async function viewerStateFor(
  supabase: unknown,
  userId: string | null,
  postIds: string[],
  answerIds: string[] = [],
): Promise<ViewerState> {
  const posts = postIds.filter(Boolean);
  const targets = [...posts, ...answerIds.filter(Boolean)];
  if (!userId || targets.length === 0) return NOBODY;
  const db = supabase as Readable;

  const [votesRead, savesRead] = await Promise.all([
    db.from("community_votes").select("target_type, target_id, value").eq("user_id", userId).in("target_id", targets),
    posts.length > 0
      ? db.from("community_saves").select("post_id").eq("user_id", userId).in("post_id", posts)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (votesRead.error) console.error("[community viewer] votes read failed:", votesRead.error.message);
  if (savesRead.error) console.error("[community viewer] saves read failed:", savesRead.error.message);

  const votes = new Map<string, -1 | 0 | 1>();
  for (const raw of votesRead.data ?? []) {
    const row = raw as { target_type?: unknown; target_id?: unknown; value?: unknown };
    votes.set(`${String(row.target_type)}:${String(row.target_id)}`, voteValue(row.value));
  }
  const saved = new Set<string>();
  for (const raw of savesRead.data ?? []) {
    const row = raw as { post_id?: unknown };
    if (typeof row.post_id === "string") saved.add(row.post_id);
  }

  return {
    forPost: (postId) => ({ myVote: votes.get(`post:${postId}`) ?? 0, saved: saved.has(postId) }),
    voteOn: (targetType, targetId) => votes.get(`${targetType}:${targetId}`) ?? 0,
    savedPost: (postId) => saved.has(postId),
  };
}
