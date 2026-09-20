<#
Read-only UAT safety snapshot.  This uses Windows' trusted HTTP stack because
the local Node runtime cannot verify the Supabase certificate chain.  It does
not print credentials or captured rows to the terminal.
#>
[CmdletBinding()]
param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$tables = @(
  'profiles', 'lawyer_profiles', 'provider_profiles', 'micro_profiles',
  'firm_profiles', 'firm_members', 'business_profiles', 'business_members',
  'government_profiles', 'government_members', 'ngo_profiles', 'ngo_members',
  'cases', 'case_notes', 'case_stages', 'hearings', 'deadlines', 'tasks',
  'task_steps', 'work_sessions', 'lawyer_clients', 'lawyer_client_notes',
  'contracts', 'contract_parties', 'contract_versions', 'contract_obligations',
  'consultations', 'consultation_notes', 'attachments', 'document_shares',
  'service_requests', 'request_events', 'payments', 'subscriptions',
  'notifications', 'notification_outbox', 'support_tickets', 'invitations',
  'activity_events', 'admin_audit_events', 'wallet_transactions'
)

$envMap = @{}
Get-Content (Join-Path $PSScriptRoot '..\..\.env.local') | ForEach-Object {
  $match = [regex]::Match($_, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
  if ($match.Success) {
    $envMap[$match.Groups[1].Value] = $match.Groups[2].Value.Trim().Trim('"').Trim("'")
  }
}

$baseUrl = $envMap['NEXT_PUBLIC_SUPABASE_URL']
$serviceRoleKey = $envMap['SUPABASE_SERVICE_ROLE_KEY']
if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw 'The UAT test database credentials are not available in .env.local.'
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
  $OutputDirectory = Join-Path (Get-Location) "outputs\uat\backups\$stamp"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$headers = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey"; Prefer = 'count=exact' }
$capturedTables = [ordered]@{}
foreach ($table in $tables) {
  try {
    $requestUri = $baseUrl + '/rest/v1/' + $table + '?select=*&limit=5000'
    $rows = Invoke-RestMethod -Uri $requestUri -Headers $headers -Method Get -TimeoutSec 45
    $capturedTables[$table] = [ordered]@{ status = 'captured'; rows = @($rows) }
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $capturedTables[$table] = [ordered]@{ status = 'unavailable'; httpStatus = $status; message = $_.Exception.Message }
  }
}

try {
  $auth = Invoke-RestMethod -Uri "$baseUrl/auth/v1/admin/users?per_page=1000" -Headers $headers -Method Get -TimeoutSec 45
  $authRows = @($auth.users | ForEach-Object {
    [ordered]@{
      id = $_.id; email = $_.email; phone = $_.phone; app_metadata = $_.app_metadata
      user_metadata = $_.user_metadata; created_at = $_.created_at; updated_at = $_.updated_at
      email_confirmed_at = $_.email_confirmed_at
    }
  })
  $authSnapshot = [ordered]@{ status = 'captured'; rows = $authRows }
} catch {
  $authSnapshot = [ordered]@{ status = 'unavailable'; message = $_.Exception.Message }
}

$snapshot = [ordered]@{
  format = 'nzamy-uat-test-state/v1'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  environment = $envMap['NEXT_PUBLIC_APP_ENV']
  backend = $envMap['NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND']
  databaseHost = ([uri]$baseUrl).Host
  tables = $capturedTables
  authUsers = $authSnapshot
}

$snapshotFile = Join-Path $OutputDirectory 'database-test-state.json'
$snapshot | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $snapshotFile -Encoding utf8
$hash = (Get-FileHash -LiteralPath $snapshotFile -Algorithm SHA256).Hash
[ordered]@{ createdAt = $snapshot.createdAt; snapshotSha256 = $hash; output = (Split-Path -Leaf $OutputDirectory) } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding utf8

$capturedCount = @($capturedTables.Values | Where-Object { $_.status -eq 'captured' }).Count
$unavailableCount = @($capturedTables.Values | Where-Object { $_.status -eq 'unavailable' }).Count
[ordered]@{ output = $OutputDirectory; capturedTables = $capturedCount; unavailableTables = $unavailableCount; snapshotSha256 = $hash } | ConvertTo-Json -Compress
