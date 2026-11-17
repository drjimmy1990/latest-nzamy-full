import MyMarketplaceDashboard from "@/components/marketplace/MyMarketplaceDashboard";
import OpenRequestsList from "@/components/marketplace/OpenRequestsList";

/**
 * The lawyer's marketplace: the «not available yet» panel for publishing and
 * offers (shared with firm and company, MyMarketplaceDashboard), then the
 * read-only open requests a verified lawyer may browse (owner ١٠ + ١٩) —
 * type, city and one summary line. Lawyer only: the firm and company screens
 * keep the panel alone.
 */
export default function LawyerMarketplacePage() {
  return (
    <>
      <MyMarketplaceDashboard userType="lawyer" />
      <OpenRequestsList />
    </>
  );
}
