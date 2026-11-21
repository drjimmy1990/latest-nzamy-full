"use client";

import { usePathname } from "next/navigation";

/**
 * The /laws catalogue's one <h1> (owner file 10 ب17.2, batch l12): the page
 * had none. It sits in src/app/laws/layout.tsx OUTSIDE LibraryGuard — the
 * guard server-renders only a spinner, so a heading inside it never reaches
 * the first HTML a crawler reads — and renders on /laws itself only (every
 * reader below /laws has its own <h1> in its server block). Visually hidden:
 * the catalogue's look does not change; screen readers and crawlers read it.
 */
export const LAWS_INDEX_H1 = "مكتبة الأنظمة والتشريعات السعودية";

export default function LawsIndexHeading() {
  const pathname = usePathname();
  if (pathname !== "/laws") return null;
  return <h1 className="sr-only">{LAWS_INDEX_H1}</h1>;
}
