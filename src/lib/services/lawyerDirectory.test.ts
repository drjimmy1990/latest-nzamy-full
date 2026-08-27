import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDirectoryLawyer,
  toDirectoryLawyers,
  matchesDirectoryQuery,
  directoryFacet,
  acceptingClientsCount,
  sortDirectoryLawyers,
  arabicYearsOfPractice,
  arabicLawyerCount,
  arabicAcceptingClientsPredicate,
  type DirectoryLawyer,
} from "./lawyerDirectory.ts";

/**
 * The row 4 of the 5 production lawyer_profiles rows actually look like:
 * present, verified, and empty. This is the COMMON case, not the edge case.
 */
const NEAR_EMPTY_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "محمد النظامي",
  display_name_en: null,
  avatar_url: null,
  city: null,
  user_type: "lawyer",
  lawyer_profiles: {
    user_id: "11111111-1111-4111-8111-111111111111",
    specialties: [],
    years_experience: 0,
    hourly_rate: 0,
    bio_ar: "",
    bio_en: "",
    is_accepting_clients: null,
  },
};

test("a near-empty row invents nothing", () => {
  const l = toDirectoryLawyer(NEAR_EMPTY_ROW);
  assert.ok(l);

  // The one thing that IS stated survives.
  assert.equal(l.name, "محمد النظامي");
  assert.equal(l.id, "11111111-1111-4111-8111-111111111111");

  // Everything else must be absent, not zero and not "". A rendered 0 is the
  // same lie as a rendered 42: `{l.yearsExperience && ...}` has to short-circuit.
  assert.equal(l.yearsExperience, undefined);
  assert.equal(l.hourlyRate, undefined);
  assert.equal(l.bio, undefined);
  assert.equal(l.city, undefined);
  assert.equal(l.avatarUrl, undefined);
  assert.deepEqual(l.specialties, []);

  // `null` means the lawyer never answered — NOT «لا يستقبل موكلين».
  assert.equal(l.isAcceptingClients, undefined);
});

test("the five invented fields are absent from the model entirely", () => {
  // Not `=== 0`, not `=== null`: the keys must not exist, so that no card can
  // render a rating, a success rate or a response time by reaching for one.
  const l = toDirectoryLawyer(NEAR_EMPTY_ROW) as unknown as Record<string, unknown>;
  for (const key of [
    "rating",
    "reviewCount",
    "successRate",
    "consultationsCount",
    "responseTime",
    "priceMin",
    "priceMax",
  ]) {
    assert.equal(key in l, false, `${key} has no source in the schema`);
  }
});

test("an array-shaped embed maps identically to an object-shaped one", () => {
  // PostgREST returns an embedded to-one as either shape depending on how it
  // resolves the relationship, and the list route forwards the row untouched.
  const profile = {
    user_id: "u",
    specialties: ["قانون العمل"],
    years_experience: 12,
    hourly_rate: 400,
    bio_ar: "نبذة",
    bio_en: null,
    is_accepting_clients: true,
  };
  const asObject = { id: "a", display_name: "أ", city: "الرياض", lawyer_profiles: profile };
  const asArray = { id: "a", display_name: "أ", city: "الرياض", lawyer_profiles: [profile] };

  assert.deepEqual(toDirectoryLawyer(asArray), toDirectoryLawyer(asObject));

  const l = toDirectoryLawyer(asArray);
  assert.deepEqual(l?.specialties, ["قانون العمل"]);
  assert.equal(l?.yearsExperience, 12);
  assert.equal(l?.hourlyRate, 400);
  assert.equal(l?.bio, "نبذة");
  assert.equal(l?.isAcceptingClients, true);
});

test("an empty embed array is a lawyer with no profile, not a crash", () => {
  const l = toDirectoryLawyer({ id: "a", display_name: "أ", lawyer_profiles: [] });
  assert.ok(l);
  assert.deepEqual(l.specialties, []);
  assert.equal(l.yearsExperience, undefined);

  const missing = toDirectoryLawyer({ id: "a", display_name: "أ" });
  assert.ok(missing);
  assert.deepEqual(missing.specialties, []);
});

test("the English name is a fallback, never a placeholder", () => {
  assert.equal(
    toDirectoryLawyer({ id: "a", display_name: "   ", display_name_en: "M. Alnazami" })?.name,
    "M. Alnazami",
  );
  // No name in either language: the card omits the heading rather than
  // printing «undefined» — which is what the old cast rendered.
  assert.equal(toDirectoryLawyer({ id: "a" })?.name, undefined);
});

test("a row with no id is dropped rather than rendered keyless", () => {
  assert.equal(toDirectoryLawyer({ display_name: "أ" }), null);
  assert.equal(toDirectoryLawyer(null), null);
  assert.equal(toDirectoryLawyer(undefined), null);
  assert.deepEqual(toDirectoryLawyers([{ display_name: "أ" }, { id: "b" }]).length, 1);
});

test("a non-array payload is an empty directory, not a throw", () => {
  // The old code path was `response.lawyers ?? []` on an unvalidated body.
  assert.deepEqual(toDirectoryLawyers(null), []);
  assert.deepEqual(toDirectoryLawyers(undefined), []);
});

test("blank specialty entries never become empty chips", () => {
  const l = toDirectoryLawyer({
    id: "a",
    lawyer_profiles: { specialties: ["عقاري", "  ", "", "تجاري"] },
  });
  assert.deepEqual(l?.specialties, ["عقاري", "تجاري"]);
});

test("a specialty typed twice becomes one chip, not a duplicate React key", () => {
  // Reachable through the real UI: dashboard/lawyer/profile/edit:76 splits ONE
  // free-text box on «،», so «قانون تجاري، قانون عمل، قانون عمل» stores three
  // entries — and the card keys its chips by the string itself.
  const l = toDirectoryLawyer({
    id: "a",
    lawyer_profiles: {
      specialties: ["قانون تجاري", "قانون عمل", "قانون عمل", " قانون تجاري ", "", "  "],
    },
  });
  assert.deepEqual(l?.specialties, ["قانون تجاري", "قانون عمل"]);

  // The keys the card would emit must be unique.
  const keys = new Set(l?.specialties);
  assert.equal(keys.size, l?.specialties.length);
});

test("dedupe keeps the lawyer's own order — the headline specialty must not move", () => {
  // specialties[0] is printed under the name as the lawyer's main practice.
  // Sorting or re-ordering here would silently change what he leads with.
  const l = toDirectoryLawyer({
    id: "a",
    lawyer_profiles: { specialties: ["قانون عمل", "أحوال شخصية", "قانون عمل", "تجاري"] },
  });
  assert.deepEqual(l?.specialties, ["قانون عمل", "أحوال شخصية", "تجاري"]);
  assert.equal(l?.specialties[0], "قانون عمل");
});

test("dedupe is exact — two spellings are two answers", () => {
  // Case-folding or normalising would be us deciding that «Trade» and «trade»
  // describe the same practice. They are what the lawyer typed; both survive.
  const l = toDirectoryLawyer({
    id: "a",
    lawyer_profiles: { specialties: ["Trade", "trade"] },
  });
  assert.deepEqual(l?.specialties, ["Trade", "trade"]);
});

test("search never throws on a lawyer with no name", () => {
  // This is the reported crash: page.tsx did `l.name.includes(q)` on a model
  // whose every field was undefined.
  const nameless: DirectoryLawyer = { id: "a", specialties: [] };
  assert.equal(matchesDirectoryQuery(nameless, "محمد"), false);
  // An empty query matches everything, including a bare row.
  assert.equal(matchesDirectoryQuery(nameless, "   "), true);
});

test("search reads name, city, bio and specialties", () => {
  const l: DirectoryLawyer = {
    id: "a",
    name: "ريم الشهراني",
    city: "جدة",
    bio: "خبرة في العقود",
    specialties: ["القانون التجاري"],
  };
  assert.equal(matchesDirectoryQuery(l, "الشهراني"), true);
  assert.equal(matchesDirectoryQuery(l, "جدة"), true);
  assert.equal(matchesDirectoryQuery(l, "العقود"), true);
  assert.equal(matchesDirectoryQuery(l, "التجاري"), true);
  assert.equal(matchesDirectoryQuery(l, "الجنائي"), false);
});

test("search lowercases both sides for Latin-script names", () => {
  const l: DirectoryLawyer = { id: "a", name: "Alnazami Law", specialties: [] };
  assert.equal(matchesDirectoryQuery(l, "ALNAZAMI"), true);
  assert.equal(matchesDirectoryQuery(l, "law"), true);
});

test("facets are derived from the rows, so a chip always has a result", () => {
  const lawyers: DirectoryLawyer[] = [
    { id: "a", city: "الرياض", specialties: ["عمالي", "تجاري"] },
    { id: "b", city: "جدة", specialties: ["عمالي"] },
    { id: "c", specialties: [] },
  ];
  assert.deepEqual(directoryFacet(lawyers, "city"), ["الرياض", "جدة"]);
  assert.deepEqual(directoryFacet(lawyers, "specialties"), ["تجاري", "عمالي"]);
  // No rows means no chips at all — not eight cities matching nothing.
  assert.deepEqual(directoryFacet([], "city"), []);
});

test("only an explicit yes counts as accepting clients", () => {
  const lawyers: DirectoryLawyer[] = [
    { id: "a", specialties: [], isAcceptingClients: true },
    { id: "b", specialties: [], isAcceptingClients: false },
    { id: "c", specialties: [] },
  ];
  assert.equal(acceptingClientsCount(lawyers), 1);
});

// ─── Ordering ─────────────────────────────────────────────────────────────────

/**
 * One lawyer who filled his profile in, one who did not, and one with no
 * display name in either language — the shape of production, where 4 of the 5
 * rows are near-empty.
 */
const MIXED: DirectoryLawyer[] = [
  { id: "nameless", specialties: [] },
  { id: "stated", name: "ريم الشهراني", specialties: [], yearsExperience: 12, hourlyRate: 400 },
  { id: "sparse", name: "أحمد", specialties: [] },
];

test("«أبجدياً» puts the nameless card LAST, not first", () => {
  // The comparator was `(a.name ?? '').localeCompare(b.name ?? '', 'ar')` and
  // '' collates before every real name, so the one card that renders with no
  // heading at all got top billing — while the file three lines above declared
  // "unstated last, in both directions".
  //
  // «أحمد» before «ريم» is Arabic alphabetical order under any ICU build; the
  // load-bearing assertion is the third position.
  assert.deepEqual(
    sortDirectoryLawyers(MIXED, "name").map((l) => l.id),
    ["sparse", "stated", "nameless"],
  );
});

test("unstated years and unstated fees also sort last, in both directions", () => {
  const byExperience = sortDirectoryLawyers(MIXED, "experience");
  assert.equal(byExperience[0].id, "stated");
  assert.equal(byExperience[byExperience.length - 1].yearsExperience, undefined);

  // `fee_asc` is ASCENDING, which is where treating undefined as 0 would have
  // ranked every silent lawyer as the cheapest in the directory.
  const byFee = sortDirectoryLawyers(MIXED, "fee_asc");
  assert.equal(byFee[0].id, "stated");
  assert.equal(byFee[byFee.length - 1].hourlyRate, undefined);
});

test("sorting returns a new array and never reorders React state in place", () => {
  const before = MIXED.map((l) => l.id);
  const sorted = sortDirectoryLawyers(MIXED, "name");
  assert.notEqual(sorted, MIXED);
  assert.deepEqual(MIXED.map((l) => l.id), before);
});

test("Arabic number agreement, singular through plural", () => {
  // The old card printed «1 سنة» and «2 سنة» for every count.
  assert.equal(arabicYearsOfPractice(1), "سنة واحدة من الممارسة");
  assert.equal(arabicYearsOfPractice(2), "سنتان من الممارسة");
  // The numeral itself is locale-formatted, so assert the agreement only —
  // Arabic-Indic digits depend on the ICU build this runs against.
  assert.match(arabicYearsOfPractice(7), /سنوات من الممارسة$/u);
  assert.match(arabicYearsOfPractice(10), /سنوات من الممارسة$/u);
  assert.match(arabicYearsOfPractice(11), /سنة من الممارسة$/u);
  assert.match(arabicYearsOfPractice(25), /سنة من الممارسة$/u);

  assert.equal(arabicLawyerCount(1), "محامٍ واحد");
  assert.equal(arabicLawyerCount(2), "محاميان");
  assert.match(arabicLawyerCount(5), /محامين$/u);
  assert.match(arabicLawyerCount(40), /محامياً$/u);
});

test("the verb agrees with the count it is printed under", () => {
  // The header printed arabicLawyerCount(n) above a fixed «يستقبلون موكلين
  // جدداً», so a directory of one read «محامٍ واحد / يستقبلون» — and one or two
  // is the expected state the moment the first lawyer opts in.
  assert.equal(arabicAcceptingClientsPredicate(1), "يستقبل موكلين جدداً");
  assert.equal(arabicAcceptingClientsPredicate(2), "يستقبلان موكلين جدداً");
  assert.equal(arabicAcceptingClientsPredicate(3), "يستقبلون موكلين جدداً");
  // 11+ reverts the NOUN to the singular accusative («١٢ محامياً») but the
  // subject is still plural, so the verb must not follow it back.
  assert.equal(arabicAcceptingClientsPredicate(11), "يستقبلون موكلين جدداً");
  assert.equal(arabicAcceptingClientsPredicate(40), "يستقبلون موكلين جدداً");

  // And the two halves have to be readable as one sentence.
  assert.equal(
    `${arabicLawyerCount(2)} ${arabicAcceptingClientsPredicate(2)}`,
    "محاميان يستقبلان موكلين جدداً",
  );
});
