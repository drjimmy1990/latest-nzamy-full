/**
 * The admin orders filters come from <input type="datetime-local">, which has
 * no zone. The admins work in Riyadh, so a zone-less value is read as +03:00
 * (no daylight saving there); a value that carries a zone keeps it.
 */
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/;
const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function riyadhFilterIso(value: string): string | null {
  if (ZONED.test(value)) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const m = LOCAL.exec(value);
  if (!m) return null;
  const [y, mo, d, h = "00", mi = "00", s = "00"] = m.slice(1);
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`);
  if (!Number.isFinite(ms)) return null;
  // Reject a day the month does not have (Date would roll it over).
  const local = new Date(ms + 3 * 60 * 60 * 1000);
  if (local.getUTCDate() !== Number(d)) return null;
  return new Date(ms).toISOString();
}
