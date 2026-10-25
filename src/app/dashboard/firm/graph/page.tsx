import OfficeGraphPage from "@/components/dashboard/officeGraph/OfficeGraphPage";

/** «خريطة قضايا المكتب» (N3.11) — read-only map of the firm's cases, clients and opponents (RLS). */
export default function FirmGraphPage() {
  return <OfficeGraphPage base="firm" />;
}
