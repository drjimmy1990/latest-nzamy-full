/**
 * T28-24: multi-volume fiqh books group into one series. Every title/id below
 * is copied from library.feqh_books as measured on 2026-09-28.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  bookSeriesKey, buildBookSeries, compareVolumes, groupBookVolumes, isVolumeTitle, toCatalogueCards,
  volumeLabel, volumeSortKey, volumeSubtitle, volumesCountLabel, type VolumeRow,
} from "./bookVolumes.ts";

const row = (id: string, title: string, total_volumes: number, author = ""): VolumeRow => ({ id, title, total_volumes, author });

const WASIT = "الوسيط في شرح القانون المدني الجديد";
const SANHURI = "عبد الرزاق السنهوري";

const WASIT_ROWS: VolumeRow[] = [
  row("الوسيط_ج9_كسب_الملكية", `${WASIT} - الجزء التاسع — أسباب كسب الملكية`, 9, SANHURI),
  row("الوسيط_ج8_حق_الملكية", `${WASIT} - الجزء الثامن — حق الملكية`, 8, SANHURI),
  row("الوسيط_ج7_م1_عقد_العمل", `${WASIT} - الجزء السابع - المجلد الأول — العقود الواردة على العمل — المقاولة والوكالة والوديعة والحراسة`, 7, SANHURI),
  row("الوسيط_ج7_م2_عقود_الغرر", `${WASIT} - الجزء السابع - المجلد الثاني — عقود الغرر`, 7, SANHURI),
  row("الوسيط_ج10_التأمينات", `${WASIT} - الجزء العاشر — التأمينات الشخصية والعينية`, 10, SANHURI),
  row("الوسيط_ج5_الهبة_الشركة_القرض_الصلح", `${WASIT} — الجزء الخامس — العقود التي تقع على الملكية`, 5, SANHURI),
  row("الوسيط_ج4_البيع", `${WASIT} — الجزء الرابع — العقود التي تقع على الملكية`, 4, SANHURI),
  row("الوسيط_ج6_م1_الإيجار", `${WASIT} — الجزء السادس — المجلد الأول — العقود`, 6, SANHURI),
  row("الوسيط_ج6_م2_العارية", `${WASIT} — الجزء السادس — المجلد الثاني — العقود`, 6, SANHURI),
  row("الوسيط_ج3_الأوصاف_الحوالة_الإنقضاء", `${WASIT} — نظرية الالتزام بوجه عام — الأوصاف - الحوالة`, 3, SANHURI),
  row("الوسيط_ج2_الإثبات_آثار_الالتزام", `${WASIT} — نظرية الالتزام بوجه عام — الإثبات - آثار`, 2, SANHURI),
  row("الوسيط_ج1_مصادر_الالتزام", `${WASIT} — نظرية الالتزام بوجه عام — مصادر الالتزام`, 1, SANHURI),
];

const INSAF = "الإنصاف في معرفة الراجح من الخلاف";
const INSAF_ROWS: VolumeRow[] = [
  row(`${INSAF} - الجزء 01`, `${INSAF} — الجزء 1`, 1, "علاء الدين المرداوي"),
  row(`${INSAF} - الجزء 10`, `${INSAF} — الجزء 10`, 10, "علاء الدين المرداوي"),
  row(`${INSAF} - الجزء 02`, `${INSAF} — الجزء 2`, 2, "علاء الدين المرداوي"),
  row(`${INSAF} - الجزء مقدمة`, `${INSAF} — المقدمة`, 1, "علاء الدين المرداوي"),
];

const MUGHNI_ROWS: VolumeRow[] = [
  row("المغني - الجزء 01", "المغني — الجزء 1", 1, "ابن قدامة"),
  row("المغني - الجزء 14", "المغني — الجزء 14", 14, "ابن قدامة"),
  row("المغني - الجزء تقديم", "المغني — التقديم", 1, "ابن قدامة"),
  row("المغني - الجزء 02", "المغني — الجزء 2", 2, "ابن قدامة"),
];

const QADAA_ROWS: VolumeRow[] = [
  row("القضاء الإداري - الكتاب الأول - قضاء الإلغاء", "القضاء الإداري - الكتاب الأول: قضاء الإلغاء", 1, "سليمان محمد الطماوي"),
  row("القضاء الإداري - الكتاب الثالث - قضاء التأديب", "القضاء الإداري - الكتاب الثالث: قضاء التأديب", 3, "سليمان محمد الطماوي"),
  row("القضاء الإداري - الكتاب الثاني - قضاء التعويض وطرق الطعن", "القضاء الإداري - الكتاب الثاني: قضاء التعويض وطرق الطعن في الأحكام", 2, "سليمان محمد الطماوي"),
];

const MASADIR_ROWS: VolumeRow[] = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"].map((w, i) =>
  row(`مصادر الحق في الفقه الإسلامي - الجزء ${w}`, `مصادر الحق في الفقه الإسلامي — الجزء ${i + 1}`, i + 1, SANHURI));

const SINGLES: VolumeRow[] = [
  row("الموافقات", "الموافقات في أصول الشريعة", 1, "الشاطبي"),
  row("شرح_قانون_العقوبات_القسم_العام", "شرح قانون العقوبات - القسم العام", 1, "محمود نجيب حسني"),
  row("الشركات التجارية - سميحة القليوبي", "الشركات التجارية", 1, "سميحة القليوبي"),
  row("الأسس العامة للعقود الإدارية - دراسة مقارنة", "الأسس العامة للعقود الإدارية - دراسة مقارنة", 1, "سليمان محمد الطماوي"),
  // A different الوسيط series, one row, with a stray leading quote in the title.
  row("الوسيط_في_قانون_الإجراءات_الجنائية_ج1", "'الوسيط في قانون الإجراءات الجنائية — الكتاب الأول: الأحكام العامة للإجراءات", 1, "الدكتور أحمد فتحي سرور"),
];

test("bookSeriesKey cuts at the first dash that introduces a volume token", () => {
  assert.equal(bookSeriesKey(`${INSAF} — الجزء 30`), INSAF);
  assert.equal(bookSeriesKey(`${INSAF} — المقدمة`), INSAF);
  assert.equal(bookSeriesKey("المغني — التقديم"), "المغني");
  assert.equal(bookSeriesKey("كشاف القناع عن متن الإقناع — المقدمة"), "كشاف القناع عن متن الإقناع");
  assert.equal(bookSeriesKey("القضاء الإداري - الكتاب الأول: قضاء الإلغاء"), "القضاء الإداري");
  for (const r of WASIT_ROWS) assert.equal(bookSeriesKey(r.title), WASIT, r.id);
  assert.equal(bookSeriesKey("شرح منتهى الإرادات (دقائق أولي النهى) — الجزء 1"), "شرح منتهى الإرادات (دقائق أولي النهى)");
  // Stray leading quote stripped.
  assert.equal(bookSeriesKey("'الوسيط في قانون الإجراءات الجنائية — الكتاب الأول: الأحكام العامة للإجراءات"), "الوسيط في قانون الإجراءات الجنائية");
  // No volume token → the whole title.
  assert.equal(bookSeriesKey("شرح قانون العقوبات - القسم العام"), "شرح قانون العقوبات - القسم العام");
  assert.equal(bookSeriesKey("الأسس العامة للعقود الإدارية - دراسة مقارنة"), "الأسس العامة للعقود الإدارية - دراسة مقارنة");
  assert.equal(isVolumeTitle("الموافقات في أصول الشريعة"), false);
  assert.equal(isVolumeTitle(`${INSAF} — الجزء 3`), true);
});

test("volumeLabel: short switcher labels", () => {
  assert.equal(volumeLabel(`${INSAF} — المقدمة`, `${INSAF} - الجزء مقدمة`), "المقدمة");
  assert.equal(volumeLabel("كشاف القناع عن متن الإقناع — المقدمة", "كشاف القناع عن متن الإقناع - الجزء المقدمة"), "المقدمة");
  assert.equal(volumeLabel("المغني — التقديم", "المغني - الجزء تقديم"), "التقديم");
  assert.equal(volumeLabel(`${INSAF} — الجزء 3`, `${INSAF} - الجزء 03`), "الجزء 3");
  assert.equal(volumeLabel("مصادر الحق في الفقه الإسلامي — الجزء 4", "مصادر الحق في الفقه الإسلامي - الجزء الرابع"), "الجزء 4");
  assert.equal(volumeLabel(QADAA_ROWS[0].title, QADAA_ROWS[0].id), "الكتاب الأول: قضاء الإلغاء");
  // الوسيط: the part/sub-volume come from the id; ج4 and ج5 share a subtitle
  // but must not share a label.
  const labels = WASIT_ROWS.map((r) => volumeLabel(r.title, r.id, r.total_volumes));
  assert.equal(new Set(labels).size, WASIT_ROWS.length);
  assert.equal(volumeLabel(WASIT_ROWS[3].title, WASIT_ROWS[3].id), "الجزء 7 – المجلد 2");
  assert.equal(volumeLabel(WASIT_ROWS[7].title, WASIT_ROWS[7].id), "الجزء 6 – المجلد 1");
  assert.equal(volumeLabel(WASIT_ROWS[11].title, WASIT_ROWS[11].id), "الجزء 1");
  assert.equal(volumeLabel(WASIT_ROWS[0].title, WASIT_ROWS[0].id), "الجزء 9");
});

test("volumeSubtitle keeps what the label leaves out", () => {
  assert.equal(volumeSubtitle(WASIT_ROWS[11].title, WASIT_ROWS[11].id), "نظرية الالتزام بوجه عام — مصادر الالتزام");
  assert.equal(volumeSubtitle(WASIT_ROWS[0].title, WASIT_ROWS[0].id), "أسباب كسب الملكية");
  assert.equal(volumeSubtitle(WASIT_ROWS[3].title, WASIT_ROWS[3].id), "عقود الغرر");
  assert.equal(volumeSubtitle(`${INSAF} — الجزء 3`, `${INSAF} - الجزء 03`), "");
  assert.equal(volumeSubtitle(`${INSAF} — المقدمة`, `${INSAF} - الجزء مقدمة`), "");
  assert.equal(volumeSubtitle(QADAA_ROWS[0].title, QADAA_ROWS[0].id), "");
});

test("volumeSortKey / compareVolumes: intro and foreword first, then the number, then the sub-volume", () => {
  assert.deepEqual([...INSAF_ROWS].sort(compareVolumes).map((r) => volumeLabel(r.title, r.id)), ["المقدمة", "الجزء 1", "الجزء 2", "الجزء 10"]);
  assert.deepEqual([...MUGHNI_ROWS].sort(compareVolumes).map((r) => volumeLabel(r.title, r.id)), ["التقديم", "الجزء 1", "الجزء 2", "الجزء 14"]);
  assert.deepEqual([...QADAA_ROWS].sort(compareVolumes).map((r) => r.total_volumes), [1, 2, 3]);
  assert.deepEqual([...MASADIR_ROWS].reverse().sort(compareVolumes).map((r) => r.total_volumes), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    [...WASIT_ROWS].sort(compareVolumes).map((r) => r.id.split("_").slice(0, 3).join("_")),
    ["الوسيط_ج1_مصادر", "الوسيط_ج2_الإثبات", "الوسيط_ج3_الأوصاف", "الوسيط_ج4_البيع", "الوسيط_ج5_الهبة",
      "الوسيط_ج6_م1", "الوسيط_ج6_م2", "الوسيط_ج7_م1", "الوسيط_ج7_م2", "الوسيط_ج8_حق", "الوسيط_ج9_كسب", "الوسيط_ج10_التأمينات"],
  );
  assert.deepEqual(volumeSortKey(WASIT_ROWS[3]).slice(0, 3), [2, 7, 2]);
});

test("groupBookVolumes: series of ≥2 become one entry, singles stay single, the two الوسيط series do not merge", () => {
  const rows = [...SINGLES.slice(0, 2), ...INSAF_ROWS, ...WASIT_ROWS, ...MUGHNI_ROWS, ...QADAA_ROWS, ...MASADIR_ROWS, ...SINGLES.slice(2)];
  const entries = groupBookVolumes(rows);
  const series = entries.filter((e) => e.kind === "series");
  const singles = entries.filter((e) => e.kind === "single");
  assert.deepEqual(series.map((s) => s.kind === "series" ? [s.title, s.count] : null), [
    [INSAF, 4], [WASIT, 12], ["المغني", 4], ["القضاء الإداري", 3], ["مصادر الحق في الفقه الإسلامي", 6],
  ]);
  assert.deepEqual(singles.map((s) => s.kind === "single" ? s.book.id : ""), SINGLES.map((r) => r.id));
  // Order of first appearance is kept; volumes are sorted inside the series.
  const insaf = series[0];
  assert.equal(insaf.kind === "series" && insaf.volumes[0].id, `${INSAF} - الجزء مقدمة`);
  assert.equal(insaf.kind === "series" && insaf.author, "علاء الدين المرداوي");
  assert.equal(entries.length, 5 + SINGLES.length);
});

test("groupBookVolumes: the same base title by another author is another series; a lone volume is single", () => {
  const rows = [
    row("a1", "كتاب الأحكام — الجزء 1", 1, "أ"),
    row("a2", "كتاب الأحكام — الجزء 2", 2, "أ"),
    row("b1", "كتاب الأحكام — الجزء 1", 1, "ب"),
  ];
  const entries = groupBookVolumes(rows);
  assert.deepEqual(entries.map((e) => e.kind), ["series", "single"]);
  assert.deepEqual(groupBookVolumes([]), []);
});

test("buildBookSeries: the reader's switcher data, or null for a single", () => {
  const rows = [...INSAF_ROWS, ...SINGLES, ...WASIT_ROWS];
  const s = buildBookSeries(rows, `${INSAF} - الجزء 02`);
  assert.ok(s);
  assert.equal(s.title, INSAF);
  assert.equal(s.currentId, `${INSAF} - الجزء 02`);
  assert.deepEqual(s.volumes.map((v) => v.label), ["المقدمة", "الجزء 1", "الجزء 2", "الجزء 10"]);
  assert.deepEqual(Object.keys(s.volumes[0]).sort(), ["id", "label", "title"]);
  assert.equal(buildBookSeries(rows, "الموافقات"), null);
  assert.equal(buildBookSeries(rows, "الوسيط_في_قانون_الإجراءات_الجنائية_ج1"), null);
  assert.equal(buildBookSeries(rows, "missing"), null);
  assert.equal(buildBookSeries(rows, "الوسيط_ج7_م2_عقود_الغرر")?.volumes.length, 12);
});

test("toCatalogueCards: a series is one card opening its intro volume; singles claim no count; search hits never group", () => {
  // The /laws list shape: id = slug = feqh_books.id, volCount = total_volumes || 1.
  const book = (r: VolumeRow, desc = "") => ({ id: r.id, slug: r.id, title: r.title, author: r.author ?? "", volCount: r.total_volumes || 1, desc, free: true });
  const list = [
    book(INSAF_ROWS[0]), book(INSAF_ROWS[1], "وصف الجزء العاشر"), book(INSAF_ROWS[2]), book(INSAF_ROWS[3]),
    book(SINGLES[0], "كتاب في المقاصد"), book(SINGLES[4]),
  ];
  const cards = toCatalogueCards(list);
  assert.equal(cards.length, 3);
  const [insaf, muwafaqat, wasitIjraat] = cards;
  assert.equal(insaf.title, INSAF);
  assert.equal(insaf.volumesLabel, "4 مجلدات");
  assert.equal(insaf.book.slug, `${INSAF} - الجزء مقدمة`); // opens the intro first
  assert.equal(insaf.book.desc, "وصف الجزء العاشر");       // first description found
  assert.equal(insaf.book.free, true);                       // row fields carried over
  assert.equal(muwafaqat.volumesLabel, "");                   // a single claims no count…
  assert.equal(muwafaqat.title, "الموافقات في أصول الشريعة");
  assert.equal(wasitIjraat.volumesLabel, "");                 // …even with total_volumes set
  assert.equal(wasitIjraat.title, "الوسيط في قانون الإجراءات الجنائية — الكتاب الأول: الأحكام العامة للإجراءات"); // stray quote gone
  assert.equal(new Set(cards.map((c) => c.key)).size, cards.length);

  // Search hits are passages of books: every hit stays its own card.
  const hits = [INSAF_ROWS[0], INSAF_ROWS[1]].map((r, i) => ({ ...book(r), id: `blk-${i}`, title: `${r.title} — باب المياه`, _isSearchResult: true }));
  const hitCards = toCatalogueCards(hits);
  assert.deepEqual(hitCards.map((c) => c.key), ["blk-0", "blk-1"]);
  assert.deepEqual(hitCards.map((c) => c.title), hits.map((h) => h.title));
  assert.deepEqual(toCatalogueCards([]), []);
});

test("volumesCountLabel: Arabic count agreement, nothing for a single", () => {
  assert.equal(volumesCountLabel(1), "");
  assert.equal(volumesCountLabel(0), "");
  assert.equal(volumesCountLabel(Number.NaN), "");
  assert.equal(volumesCountLabel(2), "مجلدان");
  assert.equal(volumesCountLabel(4), "4 مجلدات");
  assert.equal(volumesCountLabel(10), "10 مجلدات");
  assert.equal(volumesCountLabel(31), "31 مجلدًا");
});

test("a book-title search hit keeps the series size the API sent", () => {
  const cards = toCatalogueCards([
    { id: "book:elam-1", slug: "elam-1", title: "إعلام الموقعين عن رب العالمين", _isSearchResult: true, searchVolumesLabel: "4 مجلدات" },
    { id: "blk-9", slug: "kashaf", title: "كشاف القناع — باب الطهارة", _isSearchResult: true },
  ]);
  assert.equal(cards[0].volumesLabel, "4 مجلدات");
  assert.equal(cards[1].volumesLabel, "");
});
