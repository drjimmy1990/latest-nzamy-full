# Batch 2026-11-08 — decree security + owner answers ٤٣٩–٤٤٤ / ٤١٧ + next-batch items

Branch `batch/2026-11-08-security-table` (worktree `D:\nzwt\b1108`), from main a3a75509.
Authority: the owner's answers to ٤٣٩–٤٤٤ and ٤٠٨/٤١٧ (2026-11-08, pasted in chat), and his 11-03 package
`00_رد_المالك_الحاسم_على_الأسئلة_٤٠٨_إلى_٤٣٨_٢٠٢٦-١١-٠٣.md` §٤١٠ (section edit), §٤١٢ (free daily question), §٤٢٧ (third device).

## Tasks (one branch each, merged here by the controller)
| # | Task | Branch / worktree | Migration |
|---|------|-------------------|-----------|
| A1 | Security: every library column a route masks per tier is unreadable with the anon/authenticated key; request-client reads stop selecting them | `t/sec` `D:\nzwt\b1108-sec` | 20261108_10 (AFTER deploy) |
| A2 | Murshid: sector grievance procedures + national channels + najiz guide screen in /ai/procedures | `t/murshid` `D:\nzwt\b1108-murshid` | none |
| A4 | ٤١٧ roles + ٤٤٣ links/guards + ٤٣٩ page count + ٤٤٠ verbatim percentages + ٤٤١ «عصارة المرفقات» | `t/table` `D:\nzwt\b1108-table` | none expected |
| B1 | ٤٢٧ third device refused (library), behind a platform setting | later | 20261108_20 |
| B2 | ٤٤٤ firm-account runs in the firm log + per-member points counter on the firm finance page | later | 20261108_30 if needed |
| B3 | ٤١٠ «عدّل هذا القسم»: 5 free per memo, max 2 per section, then 10 points | later | 20261108_40 |
| B4 | ٤١٢ free daily question for a phone-verified account (inert until OTP; ٤٤٨ open) | later | 20261108_50 |

## Rulings
- ٤١٧ split: lawyer+firm only = legal-drafter, contracts-pro, contract-review, contract-negotiator, case-brief (owner, explicit) + wargaming, analyze-strength, najiz-optimizer, brief-check, communicate (٤١٥: messages to the lawyer's client), assistant (case context), canvas-card, contract-drafter. Open to every registered account = quick-answer, legal-opinion-consult, legal-opinion-letter; library-assistant keeps LIBRARY_ROLES + library tier. Confirmation asked as a new owner question. Cost if wrong: one constant per tool.
- Controller owns the shared files: `supabase/migrations/_verify.sql`, `src/lib/sqlMergeHygiene.test.ts`, the SQL README, the owner report, the questions file. Task agents write verify blocks to `docs/plans/2026-11-08-snippets/<task>-verify.sql`.
- Security deploys code first, then 20261108_10. Offer the user an early merge of A1 alone.
