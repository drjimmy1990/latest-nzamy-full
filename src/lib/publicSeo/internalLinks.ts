/**
 * internalLinks.ts — fixed internal links the SEO audit asked for (owner
 * 18 Nov, item 4.6): /pricing and /services/lawyers link to /founder
 * (src/components/seo/FounderCampaignLink.tsx). Pure, for `node --test`.
 */
export const FOUNDER_CAMPAIGN_LINK = Object.freeze({
  href: "/founder",
  lead: "للمحامي المرخّص: عضوية تأسيسية محدودة —",
  label: "باقة المحامي المؤسس",
});
