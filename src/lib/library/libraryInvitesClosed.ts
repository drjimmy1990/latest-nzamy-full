/**
 * libraryInvitesClosed.ts — owner answer ٩٣ (20 Nov 2026, batch l12):
 * «لا استثناء لأي حساب … وتُوقف أكواد دعوة المكتبة ودعوة الزميل».
 *
 * The library opens only through a library plan or grant, so the two doors
 * that granted it for free are shut:
 *   - the admin-issued library invitation codes (library.invitations):
 *     creating one (POST /api/v1/admin/library-invitations) and redeeming one
 *     (POST /api/v1/library/invitations/redeem) answer 410;
 *   - the colleague invitation (public.invitations): its landing lookup
 *     (GET /api/v1/invite/[code]) answers «not valid» and accepting one
 *     (POST /api/v1/invite/[code]/accept) answers 410.
 * The admin page still LISTS the old codes (a record), with no create form.
 * Grants already written stay as they were; like every library grant they
 * now pass the 50-point gate (pointsGate.ts).
 *
 * A decided rule, not a setting. Re-opening it is a code change on purpose
 * (founder monthly invites, owner ١٤٤, would be a new, separate door).
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const LIBRARY_INVITES_CLOSED = true as const;

export const LIBRARY_INVITES_CLOSED_CODE = "library_invites_closed";

/** What a redeem / accept / create refusal says. */
export const LIBRARY_INVITES_CLOSED_AR =
  "أُوقفت دعوات المكتبة القانونية ودعوات الزملاء؛ تُفتح المكتبة بالاشتراك في إحدى باقاتها.";

/** The admin page's note above the list of old codes. */
export const LIBRARY_INVITES_CLOSED_ADMIN_AR =
  "أُوقف إنشاء أكواد دعوة المكتبة واستخدامها بقرار المالك (س٩٣). القائمة أدناه سجلّ للأكواد السابقة فقط.";

/** The JSON body and status every closed door answers. */
export function libraryInvitesClosedBody(): { error: string; code: typeof LIBRARY_INVITES_CLOSED_CODE } {
  return { error: LIBRARY_INVITES_CLOSED_AR, code: LIBRARY_INVITES_CLOSED_CODE };
}

export const LIBRARY_INVITES_CLOSED_STATUS = 410;
