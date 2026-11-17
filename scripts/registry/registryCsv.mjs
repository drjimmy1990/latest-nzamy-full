/**
 * registryCsv.mjs — pure helpers for scripts/registry/import-lawyer-registry.mjs
 * (launch batch R2/R3, migration 20261122_40). No I/O, no process.env: the
 * unit tests (registryCsv.test.ts) load it as it is.
 *
 * The registry CSV holds real names and MOBILE NUMBERS. Nothing here prints a
 * row; the stats are counts only, and the SQL goes straight into psql.
 *
 * Name and licence normalisation is NOT done here: the table's generated
 * columns call the SQL normalisers of 20261122_40, the only implementation.
 * `licenceKeyForReport` below mirrors the licence one closely enough to count
 * duplicates in a dry run; the SQL drops in-file duplicates again by its own
 * key before writing, so a difference can never write a wrong row.
 */

/** The CSV columns the import reads (exact header text). */
export const COLUMNS = Object.freeze({
  name: "الاسم الكامل",
  mobile: "رقم الجوال",
  city: "مدينة الإقامة",
  licence: "رقم الرخصة",
  status: "حالة الرخصة",
  expiryHijri: "انتهاء الرخصة (هجري)",
  expiryGregorian: "انتهاء الرخصة (ميلادي)",
  note: "حالة التحقق والمطابقة",
  updated: "تاريخ آخر تحديث",
});

/** RFC-4180-style parser: quotes, doubled quotes, CRLF, a leading BOM. */
export function parseCsv(text) {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function westernDigits(s) {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** Dry-run duplicate counting only (see the header). */
export function licenceKeyForReport(raw) {
  const k = westernDigits(String(raw ?? ""))
    .replace(/\s+/g, "")
    .replace(/[-–—_\\]/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return k || null;
}

function validIso(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "YYYY/MM/DD" or "YYYY-MM-DD" → "YYYY-MM-DD", else null. */
export function parseGregorian(raw) {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(westernDigits(String(raw ?? "").trim()));
  return m ? validIso(+m[1], +m[2], +m[3]) : null;
}

let hijriMap = null;
/**
 * Umm al-Qura Hijri → Gregorian, through the runtime's own calendar (ICU):
 * every day from 2015 to 2050 is formatted in Hijri once and kept in a map.
 * Key "D-M-YYYY" without leading zeros.
 */
function hijriTable() {
  if (hijriMap) return hijriMap;
  hijriMap = new Map();
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura-nu-latn", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  for (let t = Date.UTC(2015, 0, 1); t <= Date.UTC(2050, 11, 31); t += 86_400_000) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const key = `${+parts.day}-${+parts.month}-${+parts.year}`;
    if (!hijriMap.has(key)) hijriMap.set(key, new Date(t).toISOString().slice(0, 10));
  }
  return hijriMap;
}

/** "DD-MM-YYYY" (Hijri, Umm al-Qura) → Gregorian "YYYY-MM-DD", else null. */
export function hijriToGregorian(raw) {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(westernDigits(String(raw ?? "").trim()));
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const exact = hijriTable().get(`${d}-${mo}-${y}`);
  if (exact) return exact;
  // Day 30 of a month that Umm al-Qura counts as 29 days: the day after the 29th.
  if (d === 30) {
    const d29 = hijriTable().get(`29-${mo}-${y}`);
    if (d29) return new Date(Date.parse(d29) + 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

const ARCHIVED_NOTE_PREFIX = "محفوظ من القاعدة السابقة";

/**
 * CSV rows (header first) → the records to load plus counts. Rows with no
 * licence or no name are skipped; EVERY row of a licence that appears more
 * than once is skipped (the file cannot say which name owns it).
 * `today` = "YYYY-MM-DD", for the expired count only.
 */
export function buildImport(rows, today) {
  if (!rows.length) throw new Error("the CSV is empty");
  const header = rows[0].map((h) => h.trim());
  const idx = {};
  const missing = [];
  for (const [k, name] of Object.entries(COLUMNS)) {
    idx[k] = header.indexOf(name);
    if (idx[k] < 0) missing.push(name);
  }
  if (missing.length) throw new Error(`missing CSV columns: ${missing.join(" | ")}`);

  const stats = {
    rows: rows.length - 1,
    badWidth: 0,
    noLicence: 0,
    noName: 0,
    duplicateLicences: 0,
    duplicateRows: 0,
    expiryFromGregorian: 0,
    expiryFromHijri: 0,
    expiryUnknown: 0,
    hijriGregorianDisagree: 0,
    archived: 0,
    expiredToday: 0,
    withMobile: 0,
    toLoad: 0,
  };
  const cell = (r, k) => (r[idx[k]] ?? "").trim();
  const candidates = [];
  const keyCount = new Map();
  for (const r of rows.slice(1)) {
    if (r.length !== header.length) stats.badWidth++;
    const licence = cell(r, "licence");
    const key = licenceKeyForReport(licence);
    if (!key) {
      stats.noLicence++;
      continue;
    }
    const name = cell(r, "name");
    if (!name) {
      stats.noName++;
      continue;
    }
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    candidates.push({ key, r });
  }
  const records = [];
  for (const { key, r } of candidates) {
    if (keyCount.get(key) > 1) {
      stats.duplicateRows++;
      continue;
    }
    const greg = parseGregorian(cell(r, "expiryGregorian"));
    const hijriRaw = cell(r, "expiryHijri");
    const fromHijri = hijriToGregorian(hijriRaw);
    let expiry = null;
    if (greg) {
      expiry = greg;
      stats.expiryFromGregorian++;
      if (fromHijri && fromHijri !== greg) {
        const gap = Math.abs(Date.parse(fromHijri) - Date.parse(greg)) / 86_400_000;
        if (gap > 1) stats.hijriGregorianDisagree++;
      }
    } else if (fromHijri) {
      expiry = fromHijri;
      stats.expiryFromHijri++;
    } else stats.expiryUnknown++;
    const note = cell(r, "note");
    if (note.startsWith(ARCHIVED_NOTE_PREFIX)) stats.archived++;
    if (expiry && today && expiry < today) stats.expiredToday++;
    const mobile = cell(r, "mobile");
    if (mobile) stats.withMobile++;
    records.push({
      licence_raw: cell(r, "licence"),
      full_name: cell(r, "name"),
      mobile: mobile || null,
      city: cell(r, "city") || null,
      registry_status: cell(r, "status") || null,
      expiry_date: expiry,
      expiry_hijri: hijriRaw || null,
      registry_note: note || null,
      source_updated_on: parseGregorian(cell(r, "updated")),
    });
  }
  stats.duplicateLicences = [...keyCount.values()].filter((n) => n > 1).length;
  stats.toLoad = records.length;
  return { records, stats };
}

const RECORD_COLUMNS = [
  "licence_raw",
  "full_name",
  "mobile",
  "city",
  "registry_status",
  "expiry_date",
  "expiry_hijri",
  "registry_note",
  "source_updated_on",
];

/** One CSV field for COPY … (format csv): null → empty unquoted, text quoted. */
function copyField(v) {
  if (v === null || v === undefined) return "";
  return `"${String(v).replace(/"/g, '""')}"`;
}

/**
 * The psql script that loads `records`: one transaction, COPY into a temp
 * table, in-file duplicates dropped again by the SQL key, upsert by
 * licence_no (rows that did not change are not touched), then a counts-only
 * SELECT. Never deletes a registry row.
 */
export function toPsqlScript(records) {
  const lines = [];
  lines.push("\\set ON_ERROR_STOP on");
  lines.push("begin;");
  lines.push("set local lock_timeout = '10s';");
  lines.push(
    "do $$ begin if to_regclass('public.lawyer_registry') is null then " +
      "raise exception 'lawyer_registry is missing: run supabase/migrations/20261122_40_lawyer_registry.sql first'; end if; end $$;",
  );
  lines.push(
    "create temp table _registry_import (licence_raw text, full_name text, mobile text, city text, " +
      "registry_status text, expiry_date date, expiry_hijri text, registry_note text, source_updated_on date) on commit drop;",
  );
  lines.push(`copy _registry_import (${RECORD_COLUMNS.join(", ")}) from stdin with (format csv);`);
  for (const rec of records) lines.push(RECORD_COLUMNS.map((c) => copyField(rec[c])).join(","));
  lines.push("\\.");
  lines.push(
    "create temp table _registry_dropped on commit drop as " +
      "select public.lawyer_registry_norm_licence(licence_raw) as k from _registry_import " +
      "group by 1 having count(*) > 1 or public.lawyer_registry_norm_licence(licence_raw) is null " +
      "or bool_or(public.lawyer_registry_norm_name(full_name) is null);",
  );
  lines.push(
    "delete from _registry_import i using _registry_dropped d " +
      "where public.lawyer_registry_norm_licence(i.licence_raw) is not distinct from d.k;",
  );
  const set = RECORD_COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ");
  const cmpOld = RECORD_COLUMNS.map((c) => `t.${c}`).join(", ");
  const cmpNew = RECORD_COLUMNS.map((c) => `excluded.${c}`).join(", ");
  lines.push(
    "with up as (" +
      `insert into public.lawyer_registry as t (${RECORD_COLUMNS.join(", ")}) ` +
      `select ${RECORD_COLUMNS.join(", ")} from _registry_import ` +
      `on conflict (licence_no) do update set ${set}, imported_at = now() ` +
      `where (${cmpOld}) is distinct from (${cmpNew}) ` +
      "returning (xmax = 0) as inserted) " +
      "select 'lawyer_registry import' as step, " +
      "(select count(*) from _registry_import) as rows_in_file, " +
      "(select count(*) from _registry_dropped) as licences_dropped_by_sql, " +
      "count(*) filter (where inserted) as inserted, " +
      "count(*) filter (where not inserted) as updated " +
      "from up;",
  );
  lines.push(
    "select (select count(*) from public.lawyer_registry) as registry_rows, " +
      "(select count(*) from public.lawyer_registry r where not exists (" +
      "select 1 from _registry_import i where public.lawyer_registry_norm_licence(i.licence_raw) = r.licence_no)) " +
      "as registry_rows_not_in_this_file;",
  );
  lines.push("commit;");
  return `${lines.join("\n")}\n`;
}
