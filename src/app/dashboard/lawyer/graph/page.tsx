import OfficeGraphPage from "@/components/dashboard/officeGraph/OfficeGraphPage";

/** «خريطة القضايا» (N3.11) — read-only map of the lawyer's cases, clients and opponents. */
export default function LawyerGraphPage() {
  return <OfficeGraphPage base="lawyer" />;
}
