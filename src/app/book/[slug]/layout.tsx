import LibraryGuard from "@/components/library/LibraryGuard";

/**
 * Guards the feqh book reader (/book/[slug]) with the global library switch.
 *
 * Scoped to the [slug] segment on purpose: /book/consultation is a lawyer
 * booking flow, not library content, and Next.js resolves that static segment
 * ahead of this dynamic one — so it is unaffected by this layout.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <LibraryGuard>{children}</LibraryGuard>;
}
