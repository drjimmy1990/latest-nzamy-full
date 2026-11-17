/**
 * clientPickOptions.ts — one client picker for the contract, party and invoice
 * forms (owner package 13-Nov, file 01: N01-2, N01-5, N01-8).
 *
 * N01-2: the pickers used to keep only `source === "card"` rows of
 * GET /api/v1/lawyer/clients, so a client who reached the lawyer through the
 * platform (a "profile" row: an account with requests assigned to this lawyer
 * but no card yet) could not be picked at all — and when every client was a
 * platform client the picker vanished. Both sources are listed now, each
 * labelled, and picking a platform client files its card first
 * (`ensureClientCard`): the same POST /api/v1/lawyer/clients with
 * `clientUserId` that links a card to an account in the directory, which the
 * consultation→case conversion mirrors on the server (N01-1).
 *
 * A "profile" row's `id` is a USER id, not a card id, so an option value
 * carries its source: `card:<lawyer_clients.id>` / `profile:<user id>`.
 *
 * Pure apart from the injected `create` call, so it is unit-tested
 * (clientPickOptions.test.ts) without a browser.
 */

/** The fields of a LawyerClient (lawyerClientsService.ts) these helpers read. */
export interface PickableClient {
  id: string;
  source: "card" | "profile";
  clientUserId: string | null;
  clientType: "individual" | "company" | null;
  name: string;
  phone: string | null;
  commercialRegisterNo: string | null;
  unifiedNumber700: string | null;
}

/** What GET /api/v1/lawyer/clients shows for an account with no name (route.ts profileToDto). */
export const GENERIC_PROFILE_NAME = "عميل نظامي";

export const SOURCE_LABEL_AR = {
  card: "بطاقة موكّل",
  profile: "حساب منصة",
} as const;

export function clientOptionValue(c: Pick<PickableClient, "id" | "source">): string {
  return `${c.source}:${c.id}`;
}

export function parseClientOptionValue(value: string): { source: "card" | "profile"; id: string } | null {
  const m = /^(card|profile):(.+)$/.exec(value);
  return m ? { source: m[1] as "card" | "profile", id: m[2] } : null;
}

/** «الاسم — بطاقة موكّل» / «الاسم — حساب منصة». */
export function clientOptionLabel(c: Pick<PickableClient, "name" | "source">): string {
  return `${c.name} — ${SOURCE_LABEL_AR[c.source]}`;
}

/** Cards first, then platform accounts; each group in the order the API gave. */
export function orderPickable<T extends Pick<PickableClient, "source">>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => r.source === "card"), ...rows.filter((r) => r.source === "profile")];
}

export const NO_NAME_PROFILE_AR =
  "هذا الحساب بلا اسم في المنصة، فلا تُنشأ له بطاقة تلقائياً. أضِف الموكّل يدوياً باسمه.";

/** The body ensureClientCard posts for a platform account (no phone/e-mail: a profile value the card rules refuse would fail the save). */
export function cardInputFor(c: PickableClient): { name: string; clientType: "individual"; clientUserId: string } | null {
  const name = c.name.trim();
  if (c.source !== "profile" || !c.clientUserId || !name || name === GENERIC_PROFILE_NAME) return null;
  return { name, clientType: "individual", clientUserId: c.clientUserId };
}

/**
 * The card to link: a card is itself; a platform account gets one created
 * (and linked) through `create`. Throws an Arabic message when no card can be
 * made (an account with no name) or the save fails.
 */
export async function ensureClientCard<T extends PickableClient>(
  c: T,
  create: (input: { name: string; clientType: "individual"; clientUserId: string }) => Promise<T>,
): Promise<T> {
  if (c.source === "card") return c;
  const input = cardInputFor(c);
  if (!input) throw new Error(NO_NAME_PROFILE_AR);
  return create(input);
}

/**
 * N01-5: what picking a client fills on the contract form — only the fields
 * still empty; a value the lawyer typed is never overwritten. The ID number is
 * the card's commercial register (or 700 unified number) for a company; an
 * individual's national ID is stored hashed on the card (Phase 2 rule) and is
 * never sent to the browser, so there is nothing to fill it from.
 */
export function counterpartyFill(
  c: Pick<PickableClient, "name" | "phone" | "clientType" | "commercialRegisterNo" | "unifiedNumber700">,
  current: { name: string; phone: string; idNo: string },
): { name: string; phone: string; idNo: string } {
  const empty = (v: string) => !v.trim();
  const cardId = c.clientType === "company" ? (c.commercialRegisterNo || c.unifiedNumber700 || "") : "";
  const name = c.name.trim() === GENERIC_PROFILE_NAME ? "" : c.name.trim();
  return {
    name: empty(current.name) && name ? name : current.name,
    phone: empty(current.phone) && c.phone ? c.phone : current.phone,
    idNo: empty(current.idNo) && cardId ? cardId : current.idNo,
  };
}
