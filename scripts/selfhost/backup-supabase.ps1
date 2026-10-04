<#
=============================================================================
 backup-supabase.ps1 — logical backup of the نظامي Supabase project
                       + self-host-ready copies of every file   (Windows)

   powershell -ExecutionPolicy Bypass -File .\backup-supabase.ps1
       reads SUPABASE_DB_URL from <repo>\.env.local (the repo is two folders up from this script)
   powershell -ExecutionPolicy Bypass -File .\backup-supabase.ps1 -SchemaOnly
   powershell -ExecutionPolicy Bypass -File .\backup-supabase.ps1 -PgBin "C:\pgsql\bin" -OutDir "D:\backups\nzamy"
   $env:SUPABASE_DB_URL = '...' ; powershell -File .\backup-supabase.ps1     # env var wins over .env.local

 WHAT IT NEEDS
   * pg_dump.exe + psql.exe whose MAJOR version >= the server's (a 17.x client dumps 15/16/17 servers).
       winget install --id PostgreSQL.PostgreSQL.17 -e          (full installer; only the "Command Line Tools" box is needed)
       or the zip "Windows x86-64 binaries" from enterprisedb.com -> extract -> -PgBin "<folder>\bin"
   * SUPABASE_DB_URL = the "Session pooler" connection string (port 5432 on *.pooler.supabase.com):
       Dashboard -> Connect -> Session pooler -> copy URI -> put the real database password in it.
       postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
     Special characters in the password must be percent-encoded:  [uri]::EscapeDataString('p@ss#1')
     Put the line in .env.local (git-ignored). Never paste it in chat.

 WHAT IT WRITES  (default: %USERPROFILE%\nzamy-backups\supabase-<timestamp>\ — deliberately OUTSIDE the repo)
   00-server-info.txt   facts about the source (versions, extensions, schemas, roles, triggers…)      — safe to share
   01-row-counts.csv    exact row count per table                                                      — safe to share
   02-extras.sql        auth/storage triggers, buckets, storage policies, realtime members (idempotent) — safe to share
   10-schema.sql        schema-only dump of the user schemas (+ supabase_migrations)                    — safe to share
   20-data.sql          data-only dump of the user schemas (+ supabase_migrations)                      — PRIVATE (user data)
   21-auth-data.sql     data-only dump of auth.users/identities/mfa_factors/sso/saml/instances         — PRIVATE (password hashes)
   selfhost\01-schema.sql, 02-auth-data.sql, 03-data.sql
                        the same files post-processed so a self-hosted Supabase accepts them as-is
   MANIFEST.txt         sizes + sha256 of everything, and which files are safe to send
   backup.log           this run's console output

 It never modifies the source database (pg_dump/psql read only).
=============================================================================
#>
[CmdletBinding()]
param(
  [string]$EnvFile = "",          # default: <repo>\.env.local
  [string]$OutDir  = "",          # default: %USERPROFILE%\nzamy-backups\supabase-<timestamp>
  [string]$PgBin   = "",          # folder that holds pg_dump.exe and psql.exe (optional when they are on PATH)
  [switch]$SchemaOnly,            # skip the two data dumps
  [switch]$AllowInsideRepo        # normally refused: a data dump must never be committed by accident
)

$ErrorActionPreference = 'Continue'   # native tools report through exit codes; we check $LASTEXITCODE ourselves
Set-StrictMode -Version 2
$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$SqlDir   = Join-Path $Here 'sql'
$RepoRoot = (Resolve-Path (Join-Path $Here '..\..')).Path
$env:PGCLIENTENCODING = 'UTF8'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$msg, [int]$code = 2) { Write-Host "ERROR: $msg" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; exit $code }

# ---------- connection string (never printed) ---------------------------------
$Url = $env:SUPABASE_DB_URL
if (-not $Url) {
  if (-not $EnvFile) { $EnvFile = Join-Path $RepoRoot '.env.local' }
  if (Test-Path $EnvFile) {
    $line = Get-Content -LiteralPath $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^\s*SUPABASE_DB_URL\s*=' } | Select-Object -Last 1
    if ($line) {
      $Url = ($line -replace '^\s*SUPABASE_DB_URL\s*=\s*', '').Trim()
      if ($Url -match '^"(.*)"$' -or $Url -match "^'(.*)'$") { $Url = $Matches[1] }
    }
  }
}
if (-not $Url) {
  Fail @"
SUPABASE_DB_URL is not set.
  Dashboard -> Connect -> "Session pooler" -> copy the URI, put the real password in it, then add this line to
  $EnvFile :
    SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
  (or set `$env:SUPABASE_DB_URL for this PowerShell session). Encode special characters in the password:
    [uri]::EscapeDataString('p@ss#1')
"@
}
if ($Url -notmatch 'sslmode=') { $Url += $(if ($Url -match '\?') { '&' } else { '?' }) + 'sslmode=require' }
$Masked = $Url -replace '://([^:/@]+):[^@]*@', '://$1:****@'

# ---------- tools -------------------------------------------------------------
function Find-Tool([string]$name) {
  if ($PgBin) { $p = Join-Path $PgBin "$name.exe"; if (Test-Path $p) { return $p }; Fail "$name.exe not found in -PgBin $PgBin" }
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @()
  foreach ($root in @("$env:ProgramFiles\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL", "C:\pgsql")) {
    if (Test-Path $root) { $candidates += Get-ChildItem -Path $root -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName } }
  }
  if ($candidates.Count -gt 0) { return ($candidates | Sort-Object -Descending | Select-Object -First 1) }
  Fail "$name.exe not found. Install PostgreSQL 17 command line tools (winget install --id PostgreSQL.PostgreSQL.17 -e) or pass -PgBin <folder>\bin"
}
$PgDump = Find-Tool 'pg_dump'
$Psql   = Find-Tool 'psql'
$clientVer = ((& $PgDump --version) -join ' ')
$clientMajor = [int]([regex]::Match($clientVer, '\)\s*(\d+)').Groups[1].Value)

# ---------- output dir --------------------------------------------------------
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $OutDir) { $OutDir = Join-Path $env:USERPROFILE "nzamy-backups\supabase-$ts" }
New-Item -ItemType Directory -Force -Path (Join-Path $OutDir 'selfhost') | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
if (-not $AllowInsideRepo) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    & git -C $OutDir rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Fail "refusing to write inside a git work tree ($OutDir): a data dump must never reach GitHub. Use -OutDir <folder outside the repo> or -AllowInsideRepo." }
  }
}
Start-Transcript -Path (Join-Path $OutDir 'backup.log') -Append | Out-Null
Write-Host "== backup-supabase.ps1  $(Get-Date -Format s)"
Write-Host "   source : $Masked"
Write-Host "   output : $OutDir"
Write-Host "   client : $clientVer  ($PgDump)"

# ---------- server check ------------------------------------------------------
$serverVersion = ((& $Psql $Url -X -At -v ON_ERROR_STOP=1 -c 'show server_version' 2>&1) -join ' ').Trim()
if ($LASTEXITCODE -ne 0) { Fail "cannot connect: $serverVersion`n  Check the URL (Session pooler, port 5432), the password encoding, and that your network allows outbound 5432." 3 }
$serverMajor = [int](($serverVersion -split '\.')[0])
Write-Host "   server : PostgreSQL $serverVersion"
if ($serverMajor -gt $clientMajor) { Fail "pg_dump $clientMajor cannot dump a PostgreSQL $serverMajor server. Install the PostgreSQL $serverMajor (or newer) client tools and re-run." 3 }

function Run-PsqlFile([string]$label, [string]$sqlFile, [string]$outFile, [string[]]$extra = @()) {
  Write-Host "-- $label -> $(Split-Path -Leaf $outFile)"
  & $Psql $Url -X -q -v ON_ERROR_STOP=1 @extra -f $sqlFile -o $outFile
  if ($LASTEXITCODE -ne 0) { Fail "psql failed on $sqlFile (exit $LASTEXITCODE)" 4 }
}

# ---------- 00 / 01 / 02 -------------------------------------------------------
Run-PsqlFile 'server facts' (Join-Path $SqlDir '00-server-info.sql')    (Join-Path $OutDir '00-server-info.txt')
Run-PsqlFile 'row counts'   (Join-Path $SqlDir '01-row-counts.sql')     (Join-Path $OutDir '01-row-counts.csv') @('--csv')
Run-PsqlFile 'extras (auth/storage/realtime objects)' (Join-Path $SqlDir '02-export-extras.sql') (Join-Path $OutDir '02-extras.sql') @('-A', '-t')

# ---------- which schemas are ours ---------------------------------------------
$schemaQuery = @"
select string_agg(nspname, ' ' order by nspname) from pg_namespace
where nspname not in ('auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net',
                      'pgsodium','pgsodium_masks','vault','supabase_functions','supabase_migrations',
                      'pgbouncer','cron','pgtle','_analytics','_supavisor','repack','information_schema')
  and nspname not like 'pg\_%'
"@
$schemaQuery = ($schemaQuery -replace '\s+', ' ').Trim()
$userSchemas = ((& $Psql $Url -X -At -v ON_ERROR_STOP=1 -c $schemaQuery) -join ' ').Trim()
if ($LASTEXITCODE -ne 0 -or -not $userSchemas) { Fail "could not list the user schemas" 4 }
Write-Host "-- user schemas: $userSchemas  (+ supabase_migrations for the migration history)"
$schemaArgs = @()
foreach ($s in ($userSchemas -split '\s+') + @('supabase_migrations')) { $schemaArgs += '-n'; $schemaArgs += $s }
$common = @('--no-owner', '--quote-all-identifiers', '--no-publications', '--no-subscriptions', '--no-security-labels', '--no-tablespaces')

function Run-PgDump([string]$label, [string]$outFile, [string[]]$dumpArgs) {
  Write-Host "-- $label -> $(Split-Path -Leaf $outFile)"
  & $PgDump $Url @common @dumpArgs -f $outFile
  if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed for $outFile (exit $LASTEXITCODE)" 5 }
}

# ---------- 10 schema ------------------------------------------------------------
Run-PgDump 'schema dump' (Join-Path $OutDir '10-schema.sql') (@('--schema-only') + $schemaArgs)

# ---------- 20 / 21 data ---------------------------------------------------------
if (-not $SchemaOnly) {
  Run-PgDump 'data dump (user schemas + migration history)' (Join-Path $OutDir '20-data.sql') (@('--data-only') + $schemaArgs)
  # Transient auth tables are left out on purpose (sessions, refresh_tokens, mfa_amr_claims, mfa_challenges, flow_state,
  # one_time_tokens, saml_relay_states, audit_log_entries, schema_migrations): everybody signs in again on the new host
  # anyway, and GoTrue owns its own migration table.
  Run-PgDump 'data dump (auth users/identities/mfa/sso)' (Join-Path $OutDir '21-auth-data.sql') @(
    '--data-only', '-t', 'auth.users', '-t', 'auth.identities', '-t', 'auth.instances', '-t', 'auth.mfa_factors',
    '-t', 'auth.sso_providers', '-t', 'auth.sso_domains', '-t', 'auth.saml_providers')
} else {
  Write-Host '-- -SchemaOnly: data dumps skipped'
}

# ---------- self-host copies -------------------------------------------------------
# 1. "\restrict"/"\unrestrict" psql meta-commands (pg_dump >= 15.14/16.10/17.6) break older psql binaries such as the one
#    inside the supabase/postgres image.
# 2. "SET transaction_timeout" only exists on PostgreSQL 17 — fatal under ON_ERROR_STOP on a 15/16 self-host.
# 3. CREATE SCHEMA "public" already exists on any target — make every CREATE SCHEMA idempotent.
# 4. ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" needs superuser; the self-host image already has those defaults.
# 5. MAINTAIN is a PostgreSQL 17 privilege (it appears once a GRANT ALL was narrowed by a REVOKE); a 15/16 self-host
#    rejects it and no app role needs it, so it is dropped from every GRANT list.
function Convert-ForSelfhost([string]$inFile, [System.IO.StreamWriter]$w) {
  $r = New-Object System.IO.StreamReader($inFile, $Utf8NoBom)
  try {
    while ($null -ne ($line = $r.ReadLine())) {
      if ($line -match '^\\(un)?restrict ') { continue }
      if ($line -eq 'SET transaction_timeout = 0;') { $w.WriteLine('-- SET transaction_timeout = 0;  -- removed: parameter unknown before PostgreSQL 17'); continue }
      if ($line -match '^CREATE SCHEMA "([A-Za-z0-9_]+)";$') { $w.WriteLine("CREATE SCHEMA IF NOT EXISTS `"$($Matches[1])`";"); continue }
      if ($line -match '^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"') { $w.WriteLine("-- $line  -- removed: needs supabase_admin; a self-host already carries these defaults"); continue }
      if ($line -match '^GRANT MAINTAIN ON ') { $w.WriteLine("-- $line  -- removed: privilege unknown before PostgreSQL 17"); continue }
      if ($line -match '^GRANT ') { $line = $line -replace ',MAINTAIN', '' -replace 'MAINTAIN,', '' }
      $w.WriteLine($line)
    }
  } finally { $r.Close() }
}
function New-Writer([string]$path) { $w = New-Object System.IO.StreamWriter($path, $false, $Utf8NoBom); $w.NewLine = "`n"; return $w }

Write-Host '-- assembling selfhost\ copies'
$w = New-Writer (Join-Path $OutDir 'selfhost\01-schema.sql')
try {
  $w.WriteLine("-- selfhost/01-schema.sql — assembled $(Get-Date -Format s) from PostgreSQL $serverVersion ($Masked)")
  $w.WriteLine('-- Target: a FRESH self-hosted Supabase (supabase/docker) database, connected as postgres.')
  $w.WriteLine('--   psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f selfhost/01-schema.sql')
  $w.WriteLine('-- Contents: extensions guard + 10-schema.sql (post-processed) + 02-extras.sql. See RESTORE-SELFHOST.md.')
  $w.WriteLine('')
  $w.WriteLine('create extension if not exists pgcrypto with schema extensions;')
  $w.WriteLine('create extension if not exists "uuid-ossp" with schema extensions;')
  $w.WriteLine('')
  $w.WriteLine('-- ===================== 10-schema.sql =====================')
  Convert-ForSelfhost (Join-Path $OutDir '10-schema.sql') $w
  $w.WriteLine('')
  $w.WriteLine('-- ===================== 02-extras.sql =====================')
  $w.Write([System.IO.File]::ReadAllText((Join-Path $OutDir '02-extras.sql'), $Utf8NoBom))
} finally { $w.Close() }
if (-not $SchemaOnly) {
  $w = New-Writer (Join-Path $OutDir 'selfhost\02-auth-data.sql'); try { Convert-ForSelfhost (Join-Path $OutDir '21-auth-data.sql') $w } finally { $w.Close() }
  $w = New-Writer (Join-Path $OutDir 'selfhost\03-data.sql');      try { Convert-ForSelfhost (Join-Path $OutDir '20-data.sql')      $w } finally { $w.Close() }
}

# ---------- manifest ---------------------------------------------------------------
$m = New-Object System.Collections.Generic.List[string]
$m.Add("nzamy Supabase backup — $(Get-Date -Format s)")
$m.Add("source: $Masked")
$m.Add("server: PostgreSQL $serverVersion   client: $clientVer")
$m.Add("user schemas: $userSchemas")
$m.Add('')
$m.Add('SAFE TO SHARE (no user data): 00-server-info.txt 01-row-counts.csv 02-extras.sql 10-schema.sql selfhost\01-schema.sql MANIFEST.txt backup.log')
$m.Add('PRIVATE — never send, never commit: 20-data.sql 21-auth-data.sql selfhost\02-auth-data.sql selfhost\03-data.sql')
$m.Add('')
$m.Add('bytes       sha256                                                            file')
Get-ChildItem -Path $OutDir -Recurse -File | Where-Object { $_.Name -notin @('MANIFEST.txt', 'backup.log') } | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($OutDir.Length + 1)
  $m.Add(('{0,-11} {1}  {2}' -f $_.Length, (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower(), $rel))
}
$m.Add('')
$m.Add('row counts (user schemas + auth + storage):')
$skip = @('realtime', 'net', 'vault', 'pgsodium', 'extensions', 'graphql', 'graphql_public', 'supabase_functions', 'cron', 'pgbouncer', '_realtime', '_analytics')
Import-Csv -LiteralPath (Join-Path $OutDir '01-row-counts.csv') | Where-Object { $_.schema_name -notin $skip } | ForEach-Object {
  $m.Add(('  {0,-28} {1,-40} {2} {3}' -f $_.schema_name, $_.table_name, $_.row_count, $_.note))
}
[System.IO.File]::WriteAllLines((Join-Path $OutDir 'MANIFEST.txt'), $m, $Utf8NoBom)

$size = [math]::Round(((Get-ChildItem -Path $OutDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Host ''
Write-Host "== done. $size MB in $OutDir" -ForegroundColor Green
Write-Host '   send for review : 00-server-info.txt 01-row-counts.csv 02-extras.sql 10-schema.sql MANIFEST.txt backup.log'
Write-Host '   keep private    : 20-data.sql 21-auth-data.sql selfhost\02-auth-data.sql selfhost\03-data.sql'
try { Stop-Transcript | Out-Null } catch {}
