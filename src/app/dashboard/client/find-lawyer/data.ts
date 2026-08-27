/**
 * find-lawyer/data.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS IS NOT THE DIRECTORY'S MODEL ANY MORE.
 *
 * The directory renders `DirectoryLawyer` (src/lib/services/lawyerDirectory.ts),
 * built from what the schema actually holds. `Lawyer` below survives for ONE
 * consumer: `getLawyerById()` in src/lib/services/lawyerService.ts, whose result
 * is stored as `LawyerProfile` by the consultation intake
 * (src/app/dashboard/client/consultation/new/page.tsx:23), which reads `id`,
 * `name` and `specialty`.
 *
 * The eight `MOCK_LAWYERS` that used to live here — «فيصل الغامدي» with 127
 * reviews, a 94% success rate and «خلال ساعة» — are gone. They were invented
 * Saudi advocates carrying invented professional records, nothing imported them
 * any more (`CommunityHighlights.tsx` declares its own unrelated local const of
 * the same name), and their only remaining function was to make five
 * source-less fields look like they had a source.
 *
 * Those five fields — `rating`, `reviewCount`, `successRate`,
 * `consultationsCount`, `responseTime` — HAVE NO BACKEND ANYWHERE. There is no
 * ratings table, no reviews table and no case-outcome data in the schema. They
 * are kept in the interface only because `getLawyerById` has to satisfy it, and
 * it zeroes them with a warning not to render them. Do not add a consumer that
 * reads one. New directory code belongs on `DirectoryLawyer`, which does not
 * have them at all.
 */

export interface Lawyer {
  id: string;
  name: string;
  specialty: string;
  specialtyKey: string;
  city: string;
  rating: number;
  reviewCount: number;
  experienceYears: number;
  available: boolean;
  verified: boolean;
  priceMin: number;
  priceMax: number;
  expertise: string[];
  avatar: string;
  responseTime: string;
  successRate: number;
  consultationsCount: number;
  bio: string;
}
