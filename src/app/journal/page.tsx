import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JournalView from "./JournalView";
import { currentUserId, journalEnabled, journalViewerFor, loadPublicJournal } from "@/lib/journal/journalServer";

/**
 * /journal — «المجلة التشريعية», phase 1 (owner Q190–Q195, batch l13).
 *
 * Behind the switch legislative_journal_enabled (default OFF): off → the
 * honest «قيد التفعيل», nothing read. On → the approved entries and the
 * approved monthly issues, shaped on the SERVER for the viewer (Q190 ب): a
 * visitor gets titles and dates only (the other fields never reach his
 * browser); a library subscriber (or an admin) the badge, the effective
 * date, the impact lines, the issuing body and the link too.
 *
 * Per-viewer content: dynamic, never statically cached.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "المجلة التشريعية | نظامي",
  description: "أحدث الأخبار التشريعية في المملكة العربية السعودية، والعدد الشهري لمجلة نظامي التشريعية.",
};

export default async function JournalPage() {
  const enabled = await journalEnabled();
  if (!enabled) {
    return (
      <>
        <Navbar />
        <JournalView state="disabled" viewer="visitor" entries={[]} issues={[]} signedIn={false} />
        <Footer />
      </>
    );
  }
  const userId = await currentUserId();
  const viewer = await journalViewerFor(userId);
  const data = await loadPublicJournal(viewer);
  return (
    <>
      <Navbar />
      <JournalView
        state={data.state === "ok" ? "ok" : data.state === "schema_missing" ? "disabled" : "error"}
        viewer={viewer}
        entries={data.entries}
        issues={data.issues}
        signedIn={!!userId}
      />
      <Footer />
    </>
  );
}
