// /review/[token] — not a page (owner package 25-Nov, D-05).
//
// This route rendered one invented contract review for every token: a fixed
// document with an invented value and signatories, fixed reviewers and a fixed
// comment thread, with no read of any real request. No screen links here (the
// department-review wizard that once printed a link to it is a «قريباً» notice,
// src/app/dashboard/business/reviews/new/page.tsx). Until a real external
// review link exists, the route is a plain 404.
import { notFound } from "next/navigation";

export default function ReviewNotAvailablePage(): never {
  notFound();
}
