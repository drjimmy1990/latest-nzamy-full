/**
 * noMailEmails.ts — owner Q119 (batch l12; his default «تُخفى»): the my.gov.sa
 * addresses his mail-server check found unable to receive mail
 * (gov_contacts_consolidated.json «broken_mygov_emails», mx_ok false; package
 * 2026-11-03) are not shown anywhere on the platform. Exact addresses, not
 * domains: the check is his, per published address.
 *
 * The agencies directory drops them at parse time
 * (scripts/parsers/parse-gov-agencies-directory.mjs WITHHELD_EMAILS, and the
 * shipped JSON no longer holds them); the procedures guide's sector cards and
 * national channels drop them when served (murshidData.ts toPublicSector /
 * toPublicChannels). The two test-record addresses of his list are left out:
 * those records are never imported.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const NO_MAIL_EMAILS: ReadonlySet<string> = new Set([
  "1950@moj.gov.sa",
  "937@moh.gov.com",
  "care@haj.gov.sa",
  "care@monenergy.gov.sa",
  "care@nelc.gov.sa",
  "ccc@mof.gov.sa",
  "contact@bu.edu.sa",
  "cs@fa.gov.sa",
  "gov@gov.sa",
  "ialbatin@momra.gov.sa",
  "ic@ndmc.gov.sa",
  "imara@almadinah.gov.sa",
  "info@bip.gov.sa",
  "info@eif.gov.sa",
  "info@energy.gov.sa",
  "info@gea.gov.sa",
  "info@hail.gov.sa",
  "info@ifta.gov.sa",
  "info@jcsa.sa",
  "info@kaica.org.sa",
  "info@ksaa.gov.sa",
  "info@lcgpa.gov.sa",
  "info@mofa.gov.sa",
  "info@mos.gov.sa",
  "info@ncar.gov.sa",
  "info@ndf.gov.sa",
  "info@ndlp.gov.sa",
  "info@olympic.sa",
  "info@scot.sa",
  "ksu@edu.sa",
  "moc@gov.sa",
  "nafaqah_it@moj.gov.sa",
  "osp@osp.com",
  "r.eid@clsr.gov.sa",
  "ss@hstp.gov.sa",
  "webmaster@saudiairlines.com.sa",
]);

export function isNoMailEmail(email: string): boolean {
  return NO_MAIL_EMAILS.has(email.trim().toLowerCase());
}
