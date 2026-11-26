/**
 * topUpLinks.ts — where «شحن النقاط» leads (batch l16, A-57; owner 25 Nov
 * §7.7.2): the top-up packs on the subscription tab, under their own anchor
 * (PricingCards renders every audience's packs in a row with this id). The
 * packs a buyer sees there are the ones the price book sells to his account
 * type; a click goes to /checkout while online payment is on, or files a
 * request while it is off (PricingCards.handleSubscribe).
 *
 * Pure: no imports.
 */
export const TOPUP_PACKS_ANCHOR = "topup-packs";
export const TOPUP_HREF = `/settings?tab=subscription#${TOPUP_PACKS_ANCHOR}`;
export const TOPUP_BUTTON_AR = "شحن النقاط";
