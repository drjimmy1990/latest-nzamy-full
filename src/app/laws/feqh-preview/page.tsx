import { notFound } from "next/navigation";

/**
 * /laws/feqh-preview — closed (batch l16, B-40; the 25-Nov package's wave-1
 * row 56). The preview gave every chapter every block, showed chapter 0 only
 * and named a fixed book, and nothing on the site links to it. It answers 404
 * until a real fiqh reader is built. `feqh-preview` stays a static segment
 * (libraryGuardPaths.ts), so the address never falls through to /laws/[slug].
 */

export const metadata = {
  robots: { index: false, follow: false },
};

export default function FeqhPreviewPage(): never {
  notFound();
}
