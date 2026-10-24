// /cases/[id] — not a page (N1.3, owner-free batch 2026-10-25).
//
// This route rendered one invented case for every id: a held-funds box with
// fixed amounts, a named lawyer with a made-up score, a fixed timeline and
// fixed documents. No screen links here. A client's real case
// file is /dashboard/client/cases/[id]; a public, token-based tracking page
// for clients is planned (P4, N3.6). Until then the route is a plain 404.
import { notFound } from "next/navigation";

export default function CaseNotAvailablePage(): never {
  notFound();
}
