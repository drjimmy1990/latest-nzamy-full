import ProviderSpecialtyGate from "@/components/auth/ProviderSpecialtyGate";

/** Live check of 13 Nov, row 23: only the notary specialty (or an admin) opens these pages. */
export default function ProviderSpecialtyLayout({ children }: { children: React.ReactNode }) {
  return <ProviderSpecialtyGate specialty="notary">{children}</ProviderSpecialtyGate>;
}
