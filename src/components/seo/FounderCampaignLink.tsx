import Link from "next/link";
import { FOUNDER_CAMPAIGN_LINK } from "@/lib/publicSeo/internalLinks";

/**
 * A plain internal link to /founder (owner 18 Nov, item 4.6; SEO audit م3:
 * /pricing and /services/lawyers had none, so the campaign page was reached
 * only from outside). Rendered whatever the audience tab, the account or the
 * sale state — no hook, no condition — so it is in the server HTML. It
 * promises nothing: /founder itself says whether the sale is open.
 */
export default function FounderCampaignLink() {
  return (
    <div dir="rtl" className="mx-auto w-full max-w-5xl px-4 py-3">
      <p className="rounded-xl border border-[#C8A762]/40 bg-[#C8A762]/10 px-4 py-3 text-center text-sm leading-7 text-zinc-800 dark:text-zinc-200">
        {FOUNDER_CAMPAIGN_LINK.lead}{" "}
        <Link
          href={FOUNDER_CAMPAIGN_LINK.href}
          className="font-bold text-[#0B3D2E] underline underline-offset-4 dark:text-[#E6CD8E]"
        >
          {FOUNDER_CAMPAIGN_LINK.label}
        </Link>
      </p>
    </div>
  );
}
