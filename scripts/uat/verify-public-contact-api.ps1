<#
Exercises the localhost contact endpoint with synthetic data only. The valid
case verifies an API response and the resulting test-DB row; invalid cases are
non-writing validation checks. No browser submission is used.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string]$RunId = 'uat-20260915-full',
  [switch]$IUnderstandThisIsProduction
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_env.ps1')
$uatEnv = Assert-UatProject -AllowWrites -IUnderstandThisIsProduction:$IUnderstandThisIsProduction
$envMap = $uatEnv.RawMap
foreach ($required in @('NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY')) {
  if ([string]::IsNullOrWhiteSpace($envMap[$required])) { throw "Missing $required in the local UAT environment." }
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Invoke-LocalJson {
  param([hashtable]$Body)
  try {
    $result = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/contact' -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress) -TimeoutSec 60
    return [pscustomobject]@{ status=[int]$result.StatusCode; raw=$result.Content; error=$null }
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $raw = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $null }
    return [pscustomobject]@{ status=$status; raw=$raw; error=$_.Exception.Message }
  }
}

$tag = "$RunId-contact-api"
$missing = Invoke-LocalJson @{ name='UAT'; phone='0500000000'; subject='دعم تقني'; message='' }
$invalidEmail = Invoke-LocalJson @{ name='UAT'; email='not-an-email'; phone='0500000000'; subject='دعم تقني'; message='Synthetic UAT validation check.' }
$validEmail = "uat.contact.$([guid]::NewGuid().ToString('N').Substring(0,12))@example.test"
$valid = Invoke-LocalJson @{ name='UAT synthetic contact'; email=$validEmail; phone='letters-are-accepted'; subject='دعم تقني'; message='Synthetic UAT contact request. Do not action externally.' }

$lookupHeaders = @{ apikey=$envMap.SUPABASE_SERVICE_ROLE_KEY; Authorization="Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)" }
try {
  $storedRaw = Invoke-RestMethod -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/contact_messages?select=id,email,phone,status&email=eq.$validEmail" -Headers $lookupHeaders -Method Get -TimeoutSec 45
  # Invoke-RestMethod returns an empty Object[] for an empty PostgREST array;
  # the pipeline expansion avoids treating that array itself as one database row.
  $stored = @($storedRaw | ForEach-Object { $_ })
  $storedCount = $stored.Count
  $storedRecordId = if ($storedCount -eq 1) { $stored[0].id } else { $null }
  $storedPhone = if ($storedCount -eq 1) { $stored[0].phone } else { $null }
} catch {
  $storedCount = -1
  $storedRecordId = $null
  $storedPhone = $null
}

$missingOutcome = if ($missing.status -eq 400) { 'passed' } else { 'failed' }
$invalidEmailOutcome = if ($invalidEmail.status -eq 400) { 'passed' } else { 'failed' }
$validOutcome = if ($valid.status -eq 200) { 'passed' } else { 'failed' }
$storedOutcome = if ($valid.status -eq 200 -and $storedCount -eq 1) { 'passed' } else { 'blocked' }
$phoneOutcome = if ($valid.status -ne 200 -or $storedCount -ne 1) { 'blocked' } elseif ($storedPhone -ne 'letters-are-accepted') { 'passed' } else { 'failed' }
$checks = @(
  [ordered]@{ check='missing required contact message returns 400'; outcome=$missingOutcome; passed=($missing.status -eq 400); httpStatus=$missing.status },
  [ordered]@{ check='invalid contact email returns 400'; outcome=$invalidEmailOutcome; passed=($invalidEmail.status -eq 400); httpStatus=$invalidEmail.status },
  [ordered]@{ check='valid synthetic contact returns success'; outcome=$validOutcome; passed=($valid.status -eq 200); httpStatus=$valid.status },
  [ordered]@{ check='valid synthetic contact creates a database record'; outcome=$storedOutcome; passed=($valid.status -eq 200 -and $storedCount -eq 1); databaseRows=$storedCount; recordId=$storedRecordId },
  [ordered]@{ check='contact API rejects an invalid Saudi mobile'; outcome=$phoneOutcome; passed=($valid.status -eq 200 -and $storedCount -eq 1 -and $storedPhone -ne 'letters-are-accepted'); databaseStoredPhone=$storedPhone; staticCodeFinding='The route contains no Saudi-mobile validation before the insert.' }
)
$passed = @($checks | Where-Object { $_.passed }).Count
$summary = [ordered]@{ format='nzamy-uat-public-contact-api/v1'; createdAt=(Get-Date).ToUniversalTime().ToString('o'); runId=$RunId; syntheticEmail=$validEmail; checks=$checks; passed=$passed; failed=($checks.Count-$passed); note='The configured N8N URL is a placeholder, so any server-side dispatch is not an external integration proof.' }
$resultFile = Join-Path $OutputDirectory 'public-contact-api.json'
$summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultFile -Encoding utf8
$digest = (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{ output=$resultFile; checks=$checks.Count; passed=$passed; failed=($checks.Count-$passed); sha256=$digest } | ConvertTo-Json -Compress
