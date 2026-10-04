# نسخة احتياطية من Supabase → ملفات SQL جاهزة للـ self-host

> **ليه من جهازك وليس من عندي:** بيئتي مقفولة عن الشبكة على Supabase (اتأكدنا منها قبل كده). الـ dump لازم يطلع من جهازك (Windows) أو من الـ VPS. أنا جهّزت السكربت والملفات كاملة؛ إنت بتشغّلها وتبعتلي **الملفات الآمنة فقط** (schema + أعداد الصفوف) وأنا أراجع وأسلّمك ملف الـ self-host النهائي.

> ⏱️ **التوقيت:** خد النسخة **قبل** ما تشغّل `01` → `09` من `sql-apply-order\`. لو كنت شغّلت بعضهم خلاص، خدها دلوقتي على أي حال (هي نسخة "قبل الباقي") واكتب في الرسالة إيه اللي اتنفّذ.

## المطلوب منك (٣ حاجات)

### 1) الـ connection string بتاع الداتابيز (مش الـ API keys)
1. Dashboard → زر **Connect** (فوق) → Type: **Session pooler** → انسخ الـ URI.
2. استبدل `[YOUR-PASSWORD]` بباسورد الداتابيز. مش فاكره؟ Project Settings → Database → **Reset database password**
   (⚠️ أي حاجة بتتصل بالداتابيز بالباسورد ده — مثلاً n8n لو فيه Postgres node — هتحتاج تحديث. الموقع نفسه **لا**، لأنه بيستخدم anon/service keys فقط).
3. لو الباسورد فيه رموز (`@ # / ? : %`) لازم encode:
   ```powershell
   [uri]::EscapeDataString('الباسورد هنا')
   ```
4. ضيف السطر في `.env.local` (الملف ده git-ignored ✔):
   ```
   SUPABASE_DB_URL=postgresql://postgres.gdqfqfcxnwrwgaphtfhu:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require
   ```
   ⚠️ **ما تبعتش الـ URL ولا الباسورد في الشات أبداً.**

ليه Session pooler بالذات: العنوان المباشر `db.<ref>.supabase.co:5432` شغال IPv6 بس (غالباً مش هيوصل من البيت)، والـ pooler شغال IPv4. **Transaction pooler (6543) ما ينفعش** مع pg_dump.

### 2) أدوات PostgreSQL على جهازك (pg_dump + psql)
لازم إصدار الـ client **≥** إصدار السيرفر (السكربت بيتأكد بنفسه ويقولك). إصدار 17 بيشتغل مع سيرفر 15/16/17.
- أسهل: `winget install --id PostgreSQL.PostgreSQL.17 -e` (installer كامل — كفاية تعلّم على *Command Line Tools*)، أو
- zip بدون تثبيت: enterprisedb.com → *Download PostgreSQL binaries* → فك في `C:\pgsql` → مرّر `-PgBin "C:\pgsql\bin"`.

### 3) شغّل السكربت
```powershell
cd "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website"
powershell -ExecutionPolicy Bypass -File .\_fix-delivery-2026-09-20\backup\backup-supabase.ps1
# لو الأدوات مش على الـ PATH:
powershell -ExecutionPolicy Bypass -File .\_fix-delivery-2026-09-20\backup\backup-supabase.ps1 -PgBin "C:\pgsql\bin"
```
السكربت **قراءة فقط** (pg_dump/psql) — ما بيغيّرش حاجة في الداتابيز. الناتج في:
`%USERPROFILE%\nzamy-backups\supabase-<تاريخ-وقت>\` — **خارج الريبو عمداً** عشان ملفات البيانات ما تترفعش على GitHub بالغلط (السكربت بيرفض يكتب جوه أي git repo).

## الملفات الناتجة

| الملف | المحتوى | تبعته لي؟ |
|---|---|---|
| `00-server-info.txt` | إصدار السيرفر، الـ extensions، الـ schemas، الأدوار، الـ triggers على `auth`/`storage`، الـ buckets، الـ publication، تاريخ الـ migrations | ✅ |
| `01-row-counts.csv` | عدد الصفوف الدقيق لكل جدول | ✅ |
| `02-extras.sql` | كل اللي عايش برّه الـ schemas بتاعتنا: trigger `on_auth_user_created`، الـ buckets، policies بتاعة `storage.objects`، جداول الـ realtime (idempotent) | ✅ |
| `10-schema.sql` | الـ schema كاملة (`public`, `library`, `library_precedent_private`, `academy`, `supabase_migrations`) بدون بيانات | ✅ |
| `20-data.sql` | بيانات الـ schemas بتاعتنا + تاريخ الـ migrations | ❌ **خاص** (بيانات المستخدمين) |
| `21-auth-data.sql` | `auth.users` + `identities` + `mfa_factors` + `sso/saml` + `instances` | ❌ **خاص** (password hashes) |
| `selfhost\01-schema.sql` | = extensions guard + `10-schema.sql` (بعد المعالجة) + `02-extras.sql` — الملف اللي هيتنفّذ على الـ self-host | ✅ |
| `selfhost\02-auth-data.sql`, `selfhost\03-data.sql` | نسخ البيانات بعد المعالجة (تفضل عندك) | ❌ |
| `MANIFEST.txt` | الأحجام + sha256 + ملخص الأعداد + إيه الآمن للمشاركة | ✅ |
| `backup.log` | مخرجات التشغيل | ✅ |

**ابعتلي:** `00-server-info.txt` + `01-row-counts.csv` + `02-extras.sql` + `10-schema.sql` + `MANIFEST.txt` + `backup.log`.
**ما تبعتش:** أي ملف فيه `data` في اسمه.

إيه المعالجة اللي بتتعمل في `selfhost\` (عشان الملف يتنفّذ على self-host من غير تعديل يدوي):
- شيل أسطر `\restrict`/`\unrestrict` (بتطلع من pg_dump الحديث وبتكسر psql القديم اللي جوه صورة `supabase/postgres`).
- `SET transaction_timeout` (موجود في PostgreSQL 17 بس) → تعليق.
- `CREATE SCHEMA "public"` → `IF NOT EXISTS` (موجودة أصلاً على أي هدف).
- `ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"` → تعليق (محتاجة superuser، والـ self-host عنده نفس الـ defaults).

اللي **مش** في الـ dump عمداً: جداول الـ auth المؤقتة (sessions, refresh_tokens, flow_state, one_time_tokens, mfa_challenges, mfa_amr_claims, saml_relay_states, audit_log_entries, schema_migrations) — الكل هيعمل login تاني على السيرفر الجديد على أي حال — وصفوف `storage.objects` (الملفات نفسها بتتنقل بـ `copy-storage.mjs` وهي اللي بتعمل الصفوف).

## بديل من غير تثبيت أي حاجة
لو المشروع على خطة Pro: Dashboard → Database → **Backups** → Download (نسخة يومية جاهزة). على الخطة المجانية مفيش backups — السكربت هو الطريق.

## من الـ VPS بدل Windows
نفس الشيء بـ `backup-supabase.sh` (bash):
```bash
sudo apt install postgresql-client-17   # أو 16 لو السيرفر 15/16 (السكربت بيقولك)
SUPABASE_DB_URL='...' bash backup-supabase.sh -o /srv/backups/nzamy
```
لو نسخت ملفات `.sh` من Windows بـ scp وطلع `bad interpreter`: `sed -i 's/\r$//' backup-supabase.sh`.

## الخطوة اللي بعدها
`RESTORE-SELFHOST.md` — ترتيب التنفيذ على الـ self-host، ونقل ملفات الـ Storage، وإعدادات الـ Auth اللي مش جزء من الداتابيز.
