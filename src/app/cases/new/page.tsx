// /cases/new — not a page (owner package 25-Nov, D-30).
//
// This route was a visitor intake form that never reached the server: its
// «إرسال» showed a request number made up in the browser (NZ-2026-…) and
// promised a reply within 24 hours. Nothing links to it. A real request starts
// from the services pages (/services), which write a real service request.
// Like /cases/[id], the route is a plain 404.
import { notFound } from "next/navigation";

export default function NewCaseNotAvailablePage(): never {
  notFound();
}
