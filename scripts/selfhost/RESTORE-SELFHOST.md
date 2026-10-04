# ترحيل نظامي من Supabase المستضاف إلى Supabase self-hosted — دليل التنفيذ

يفترض إنك خلّصت `README-BACKUP.md` وعندك مجلد `supabase-<ts>\` فيه `selfhost\01-schema.sql` و`02-auth-data.sql` و`03-data.sql`.
**جرّب الدليل ده كاملاً على self-host تجريبي الأول** قبل يوم النقل الحقيقي.

## 0) قبل ما تبدأ

- الـ self-host من `supabase/docker` الرسمي وبأحدث الصور (`docker compose pull`) — عشان جدول `auth.users` عنده يكون بنفس أعمدة المستضاف أو أحدث.
- ملف `.env` بتاع الـ self-host مظبوط: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL`, `SMTP_*`.
- **قرار الـ JWT (قرّره قبل النقل):**
  - (أ) `JWT_SECRET` جديد + `ANON_KEY`/`SERVICE_ROLE_KEY` جديدة → كل المستخدمين يعملوا login تاني، وتحدّث `.env.vps` وأي حاجة في n8n بتستخدم الـ keys. **الأنصح أمنياً.**
  - (ب) تنسخ نفس `JWT_SECRET` والـ keys من المستضاف (Dashboard → Project Settings → API → JWT Settings) → الجلسات الحالية تفضل شغالة والـ keys ما تتغيرش. بعد إيقاف المستضاف نهائياً لازم تدوّرهم.
- الداتابيز على الـ self-host **فاضية** (`public` فاضي). لو هتعيد المحاولة: `docker compose down -v` (بيمسح الـ volumes) ثم `up -d` من جديد.
- ⚠️ لا تعطّل TLS في أي خطوة، ولا تستخدم `service_role` في كود التطبيق — الاستخدام هنا في سكربت النقل الإداري فقط.

## 1) انقل الملفات إلى الـ VPS
```powershell
scp -r "$env:USERPROFILE\nzamy-backups\supabase-<ts>\selfhost" user@vps:/srv/nzamy-restore/
scp -r ".\_fix-delivery-2026-09-20\backup\sql" user@vps:/srv/nzamy-restore/
```
(ملفات البيانات تتنقل بـ scp/sftp فقط — لا تُرفع على أي مكان عام.)

## 2) الاتصال بالداتابيز على الـ self-host
- من جوه الحاوية (الأسهل): `docker exec -i supabase-db psql -U postgres -d postgres`
- أو عبر الـ pooler (session mode): `postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@localhost:5432/postgres`

فحوصات قبل البدء:
```sql
select version();                                              -- 15.x أو 17.x
select extname from pg_extension where extname in ('pgcrypto','uuid-ossp');   -- الاثنين موجودين
select rolname from pg_roles where rolname in ('anon','authenticated','service_role','postgres','supabase_admin');  -- 5 صفوف
select count(*) from pg_tables where schemaname = 'public';    -- 0 (فاضية)
```
لو `02-extras.sql` قسم `[H]` عندك أدوار مخصصة: `create role <name>;` دلوقتي.

## 3) الـ schema
```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction \
  < /srv/nzamy-restore/selfhost/01-schema.sql
```
المتوقع: صفر `ERROR`. رسائل `NOTICE: ... does not exist, skipping` طبيعية.
الملف بيعمل: extensions guard → الـ schema كاملة (tables, functions, RLS policies, triggers, grants, sequences) → trigger `on_auth_user_created` على `auth.users` → الـ buckets → policies بتاعة `storage.objects` → جداول الـ realtime.

## 4) البيانات — `auth` الأول ثم بياناتنا، في وضع `replica`
```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica" -f - < /srv/nzamy-restore/selfhost/02-auth-data.sql

docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica" -f - < /srv/nzamy-restore/selfhost/03-data.sql
```
ليه `replica`: بيعطّل الـ triggers والـ FK checks أثناء التحميل — وإلا `on_auth_user_created` هيحاول يعمل profile لكل مستخدم بيتحمّل وهيتعارض مع صفوف `profiles` اللي جاية في `03-data.sql`.
لو طلع `permission denied to set parameter "session_replication_role"`: نفّذ نفس الأمرين بـ `-U supabase_admin` (بيانات فقط — ملكية الجداول ما تتأثرش).

## 5) التحقق
```bash
# أعداد الصفوف على الـ self-host بنفس الاستعلام
docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 --csv \
  -f - < /srv/nzamy-restore/sql/01-row-counts.sql > /srv/nzamy-restore/counts-selfhost.csv
diff <(grep -vE '^(realtime|net|storage|auth,(sessions|refresh_tokens|audit_log_entries|flow_state|one_time_tokens|mfa_challenges|mfa_amr_claims|saml_relay_states|schema_migrations))' /srv/nzamy-restore/01-row-counts.csv) \
     <(grep -vE '^(realtime|net|storage|auth,(sessions|refresh_tokens|audit_log_entries|flow_state|one_time_tokens|mfa_challenges|mfa_amr_claims|saml_relay_states|schema_migrations))' /srv/nzamy-restore/counts-selfhost.csv) \
  && echo "COUNTS IDENTICAL"
```
(`storage.objects` هيختلف لحد الخطوة 6؛ جداول `auth` المؤقتة و`realtime`/`net` مستثناة عمداً.)

```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;   -- on_auth_user_created
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';    -- 4 policies documents
select id, public from storage.buckets;
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';  -- notifications, chat_messages
select version, name from supabase_migrations.schema_migrations order by version;            -- تاريخ الـ migrations (لو كان موجود)
```
ثم `_verify.sql` من الريبو (على الـ VPS بعد `git pull`):
```bash
PGOPTIONS="-c nzamy.env=production" docker exec -i -e PGOPTIONS supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/_verify.sql
```
المتوقع: 23 صف تقرير، بدون `EXCEPTION`.

## 6) ملفات الـ Storage
الـ SQL نقل الـ buckets والـ policies فقط؛ الملفات نفسها وصفوف `storage.objects` بينقلها السكربت:
```powershell
# في جذر الريبو، ملف .env.storage-copy (أضفه إلى .git\info\exclude):
#   OLD_SUPABASE_URL=https://gdqfqfcxnwrwgaphtfhu.supabase.co
#   OLD_SERVICE_ROLE_KEY=...
#   NEW_SUPABASE_URL=https://<self-host-api-domain>
#   NEW_SERVICE_ROLE_KEY=...
node --env-file=.env.storage-copy .\_fix-delivery-2026-09-20\backup\copy-storage.mjs --dry-run   # يعرض الأعداد فقط
node --env-file=.env.storage-copy .\_fix-delivery-2026-09-20\backup\copy-storage.mjs             # النقل (قابل لإعادة التشغيل)
node --env-file=.env.storage-copy .\_fix-delivery-2026-09-20\backup\copy-storage.mjs --verify    # مقارنة الطرفين
```
الفشل بيتسجّل في `copy-storage-failures.json`؛ أعد التشغيل بعد إصلاح السبب (الملفات المنقولة بتتخطّى).

## 7) إعدادات الـ Auth/Storage اللي **مش** في الداتابيز (من الـ Dashboard → `.env` بتاع الـ self-host)
| في الـ Dashboard | في الـ self-host |
|---|---|
| Authentication → URL Configuration (Site URL, Redirect URLs) | `SITE_URL`, `ADDITIONAL_REDIRECT_URLS` |
| Authentication → Email (SMTP, confirmations, templates) | `SMTP_*`, `ENABLE_EMAIL_AUTOCONFIRM`, `MAILER_TEMPLATES_*` |
| Authentication → Phone (لو مستخدم OTP بالجوال) | `GOTRUE_SMS_*` |
| Authentication → Providers (Google/Apple/…) | `GOTRUE_EXTERNAL_<PROVIDER>_*` + تحديث redirect URI عند المزوّد للدومين الجديد |
| Authentication → Rate limits / JWT expiry / password policy | `GOTRUE_RATE_LIMIT_*`, `JWT_EXPIRY`, `GOTRUE_PASSWORD_MIN_LENGTH` |
| Auth Hooks (لو فيه) | `GOTRUE_HOOK_*` |
| Storage → global file size limit | `FILE_SIZE_LIMIT` |
| Database Webhooks (قسم `[F]` في `02-extras.sql`) | الـ triggers منقولة مع الـ schema؛ راجع الـ URLs اللي جواها |
| Custom domain / DNS | Nginx/Caddy + شهادة أمام Kong |

الريبو ما فيهوش Edge Functions ولا pg_cron jobs (قسم `[E]` بيأكد).

## 8) التطبيق والـ deploy
- `.env.vps`: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` → قيم الـ self-host. وأي URL في n8n/Evolution بيشاور على `*.supabase.co`.
- `deploy.sh` بيشغّل `npx supabase db push` — على self-host محتاج `--db-url`، **والأهم:** أسماء الـ migrations عندنا بتتكرر فيها البادئة الرقمية (`20260906_court_costs…` و`20260906_fix_subscriptions…`، و`20260921_01/02/03/04_…`) والـ CLI بياخد الأرقام الأولى بس كـ version → تعارض على الـ primary key في `supabase_migrations.schema_migrations`. ده على الأرجح سبب إن `20260906`/`20260914` ما اتطبقوش على المستضاف من قبل. القرار المقترح: شيل خطوة `db push` من `deploy.sh` وخلّي الـ migrations تتطبق يدوياً بترتيب `sql-apply-order\` (زي ما بتعمل دلوقتي) — أو نعيد تسمية الملفات بطوابع زمنية فريدة (تغيير في الريبو نقرره بعدين).
- بعد التشغيل: `scripts/uat/verify-*.ps1` على الـ URL الجديد، ثم جولة المتصفح (login، البروفايل، رفع/تنزيل مستند، صفحة الاشتراك).

## 9) خطة يوم النقل (cutover)
1. بروفة كاملة على self-host تجريبي (الخطوات 2→8) — لازم تعدّي قبل الحقيقي.
2. يوم النقل: **وقف الكتابة** (pm2 stop للتطبيق + إيقاف الـ n8n workflows اللي بتكتب) → `backup-supabase.ps1` نسخة نهائية → self-host نظيف (`down -v` ثم `up -d`) → الخطوات 3→6 → التحقق (5) → `.env.vps` الجديد و`pm2 reload` → smoke test.
3. سيب مشروع Supabase المستضاف **Paused** (مش Deleted) أسبوعين كطريق رجوع، وبعدها امسحه ودوّر الـ keys لو كنت نسختها (خيار ب).

## Troubleshooting
| الرسالة | السبب | الحل |
|---|---|---|
| `invalid command \restrict` | psql قديم على الهدف مع dump حديث | استخدم نسخ `selfhost\` (الأسطر متشالة منها) |
| `unrecognized configuration parameter "transaction_timeout"` | client 17 → server 15/16 | نفس الحل (معلّق في `selfhost\`) |
| `column "…" of relation "users" does not exist` في الخطوة 4 | GoTrue على الـ self-host أقدم من المستضاف | `docker compose pull && docker compose up -d` (خدمة auth بتعمل migrations بنفسها) ثم أعد الخطوة 4 |
| `permission denied to set parameter "session_replication_role"` | `postgres` مش superuser على الهدف | الخطوة 4 بـ `-U supabase_admin` |
| `role "…" does not exist` | دور مخصص من قسم `[H]` | `create role …;` قبل الخطوة 3 |
| `must be member of role "supabase_admin"` | سطر `ALTER DEFAULT PRIVILEGES` الأصلي | استخدم `selfhost\01-schema.sql` (معلّق فيه) |
| `relation "…" already exists` / `type "…" already exists` | الهدف مش فاضي | `docker compose down -v` وابدأ من الخطوة 2 |
| `schema "extensions" does not exist` | الصورة مش `supabase/postgres` | استخدم `supabase/docker` الرسمي |
| `duplicate key value violates unique constraint "schema_migrations_pkey"` عند `db push` | بادئات الـ migrations المكرّرة (القسم 8) | شيل `db push` أو أعد التسمية |
