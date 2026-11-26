import Navbar from "@/components/Navbar";
import ResearchStudio from "./_components/ResearchStudio";

/**
 * /laws/research — «باحث المكتبة الذكي» as a studio page (owner file 11, the
 * binding V3 design `saudi_library_agent_studio_v2.html`; researcher phase A6).
 * The static `research` segment wins over /laws/[slug], is listed in
 * LAWS_STATIC_SEGMENTS (so it stays under the section's LibraryGuard and a
 * question asked here never carries a law slug), and is per viewer: not
 * indexed. The /laws tab «باحث المكتبة الذكي» links here.
 *
 * Owner package 25-Nov §2.1 (batch l16, B-01): the fixed site bar covered the
 * studio's header and the guest footer's call-to-action band sat over the
 * question box — the studio keeps the bar (with room under it, in the studio
 * itself) and has no footer.
 */

export const metadata = {
  title: "باحث المكتبة الذكي | نظامي",
  robots: { index: false, follow: false },
};

export default function LibraryResearchPage() {
  return (
    <>
      <Navbar />
      <ResearchStudio />
    </>
  );
}
