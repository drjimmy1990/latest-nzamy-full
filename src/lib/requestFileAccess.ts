/**
 * requestFileAccess.ts — who may download the files of one service request
 * (a case, an order, the request a consultation was born from).
 *
 * The rule GET /api/v1/service-requests/[id]/attachments/[attachmentId] and
 * GET /api/v1/service-requests/[id]/deliverable always applied inline: the
 * order's requester, its assignee, or an admin. Pulled out so those two routes
 * and the ZIP route (/api/v1/attachments/zip) answer the same question with
 * the same code and cannot drift apart. `order` and `userType` are read with
 * the SERVICE client by every caller (a stranger's row must still be found, to
 * answer 403 rather than leak a 404/403 difference the routes never had).
 *
 * Pure: no `@/` import, so `node --test` can load it.
 */

export interface RequestFileOwners {
  requester_user_id?: string | null;
  assigned_to?: string | null;
}

export function mayDownloadRequestFiles(
  order: RequestFileOwners,
  userId: string,
  userType: string | null | undefined,
): boolean {
  if (!userId) return false;
  return (
    order.requester_user_id === userId ||
    order.assigned_to === userId ||
    userType === "admin"
  );
}
