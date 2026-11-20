/**
 * feedServer.ts — the live half of «مساعد نظامي»'s feed (O20 / A21, batch
 * l11-misc). Every read is one the platform already makes elsewhere, reused,
 * never re-derived:
 *
 *   - sale open or paused: getPaymentGatewayStatus + viewerGatewayState (as
 *     GET /api/v1/payments/status) → gatewayAllowsCheckout (as the buy
 *     buttons): test mode counts as paused for the public;
 *   - offers: loadOffersForUser for a signed-in user (the offers system's own
 *     audience / window / seats rules); a guest gets none;
 *   - the founder campaign: readFounderCampaignState (live only);
 *   - who may buy the library: the admin's account-type switch
 *     (platform_settings.library_access_by_account_type, parsed by
 *     parseLibraryAccessMap — the rule public.library_access_for and the
 *     checkout gate apply; a missing row is that rule's default, lawyers
 *     only). Same for every viewer, so it is kept for a minute per process.
 *
 * A failed read never makes a fact up: payment reads as paused, offers as
 * "sign in / none", the founder campaign as not live, the library's buyers
 * as unknown (the line is left out).
 */
import { getPaymentGatewayStatus } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { viewerGatewayState } from "@/lib/payments/testModeAccess";
import { gatewayAllowsCheckout } from "@/lib/payments/checkoutView";
import { loadOffersForUser, readFounderCampaignState } from "@/lib/offers/offersServer";
import { offerEndsLineAr, offerSeatsLineAr } from "@/lib/offers/offerRules";
import {
  LIBRARY_ACCESS_SETTING_KEY,
  LIBRARY_ACCOUNT_KEYS,
  parseLibraryAccessMap,
  type LibraryAccountKey,
} from "@/lib/library/accountAccess";
import { buildPriceFeed, type AssistantFeed, type FounderLine, type OfferLine } from "./feed";

export interface FeedViewer {
  id: string;
  last_sign_in_at?: string | null;
}

async function saleOpenFor(viewer: FeedViewer | null): Promise<boolean> {
  try {
    const state = await viewerGatewayState(await getPaymentGatewayStatus(), {
      userId: async () => viewer?.id ?? null,
      admin: () => createServiceClient(),
    });
    return gatewayAllowsCheckout({ disabled: state.disabled, provider: state.provider });
  } catch {
    return false;
  }
}

async function offersFor(viewer: FeedViewer | null, now: Date): Promise<readonly OfferLine[] | null> {
  if (!viewer) return null;
  try {
    const db = await createServiceClient();
    const reply = await loadOffersForUser(db, { id: viewer.id, last_sign_in_at: viewer.last_sign_in_at ?? undefined }, now);
    return reply.offers.map((o) => ({
      title: o.title,
      href: o.ctaHref,
      endsLineAr: offerEndsLineAr(o.endsAt),
      seatsLineAr: offerSeatsLineAr(o),
    }));
  } catch {
    return [];
  }
}

async function founderNow(now: Date): Promise<FounderLine | null> {
  try {
    const state = await readFounderCampaignState(await createServiceClient(), now);
    if (!state || state.state !== "live") return null;
    return { seatsLeft: state.seatsLeft, endsAtExclusive: state.endsAtExclusive };
  } catch {
    return null;
  }
}

export const LIBRARY_OPEN_TO_TTL_MS = 60_000;
let libraryOpenToCache: { at: number; value: readonly LibraryAccountKey[] } | null = null;

/**
 * The account types the library is sold to now, or null when the switch
 * cannot be read. Only a successful read is kept (one minute).
 */
async function libraryOpenToNow(): Promise<readonly LibraryAccountKey[] | null> {
  const nowMs = Date.now();
  if (libraryOpenToCache && nowMs - libraryOpenToCache.at < LIBRARY_OPEN_TO_TTL_MS) return libraryOpenToCache.value;
  try {
    const db = await createServiceClient();
    const { data, error } = await db.from("platform_settings").select("value").eq("key", LIBRARY_ACCESS_SETTING_KEY).maybeSingle();
    if (error) return null;
    const map = parseLibraryAccessMap((data as { value?: unknown } | null)?.value);
    const value = Object.freeze(LIBRARY_ACCOUNT_KEYS.filter((k) => map[k]));
    libraryOpenToCache = { at: nowMs, value };
    return value;
  } catch {
    return null;
  }
}

/** Which live reads an answer needs (answer.ts feedNeeds); the price book is always in memory. */
export interface FeedNeeds {
  sale: boolean;
  offers: boolean;
  founder: boolean;
  library: boolean;
}

/**
 * The feed for this viewer now. Only the reads the answer needs are made; a
 * part not read is the honest default (sale paused, no offers, founder not
 * live, library buyers unknown) — and the answer for that intent never shows it.
 */
export async function loadAssistantFeed(viewer: FeedViewer | null, needs: FeedNeeds, now: Date = new Date()): Promise<AssistantFeed> {
  const [saleOpen, offers, founder, libraryOpenTo] = await Promise.all([
    needs.sale ? saleOpenFor(viewer) : Promise.resolve(false),
    needs.offers ? offersFor(viewer, now) : Promise.resolve(null),
    needs.founder ? founderNow(now) : Promise.resolve(null),
    needs.library ? libraryOpenToNow() : Promise.resolve(null),
  ]);
  return { prices: buildPriceFeed(now), saleOpen, offers, founder, libraryOpenTo };
}
