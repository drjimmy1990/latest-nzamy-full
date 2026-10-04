<#
Controlled subscription entitlement test against synthetic UAT users only.
It creates one temporary subscription with the service role, proves what normal
actors can read or write, and removes every record it created in finally.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ActorsFile,
  [string]$OutputDirectory,
  [switch]$IUnderstandThisIsProduction
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_env.ps1')
$uatEnv = Assert-UatProject -AllowWrites -IUnderstandThisIsProduction:$IUnderstandThisIsProduction
$envMap = $uatEnv.RawMap
foreach ($required in @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
  if ([string]::IsNullOrWhiteSpace($envMap[$required])) { throw "Missing $required in local UAT configuration." }
}
$actorsDocument = Get-Content -Raw $ActorsFile | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Split-Path -Parent $ActorsFile }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$clientA = $actorsDocument.actors.'client-a'
$clientB = $actorsDocument.actors.'client-b'
if (-not $clientA -or -not $clientB) { throw 'client-a and client-b UAT actors are required.' }

function Invoke-UatRest {
  param(
    [ValidateSet('Get', 'Post', 'Patch', 'Delete')][string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body = $null
  )
  $params = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = 45 }
  if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = $Body | ConvertTo-Json -Compress -Depth 10 }
  try { $data = Invoke-RestMethod @params; return [pscustomobject]@{ ok = $true; status = 200; data = $data; error = $null } }
  catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $detail = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return [pscustomobject]@{ ok = $false; status = $status; data = $null; error = $detail }
  }
}
function Get-Token([pscustomobject]$Actor) {
  for ($attempt = 0; $attempt -lt 4; $attempt++) {
    $r = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{ apikey = $envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY } -Body @{ email = $Actor.email; password = $actorsDocument.password }
    if ($r.ok -and $r.data.access_token) { return $r.data.access_token }
    if ($r.status -ne 429 -or $attempt -eq 3) { throw "Authentication failed for $($Actor.key) (HTTP $($r.status))." }
    Start-Sleep -Seconds (5 * ($attempt + 1))
  }
}

$adminHeaders = @{ apikey = $envMap.SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)"; Prefer = 'return=representation' }
$headersA = @{ apikey = $envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY; Authorization = "Bearer $(Get-Token $clientA)"; Prefer = 'return=representation' }
$headersB = @{ apikey = $envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY; Authorization = "Bearer $(Get-Token $clientB)"; Prefer = 'return=representation' }
$plans = Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscription_plans?select=id,tier&active=eq.true&limit=1" -Headers $adminHeaders
if (-not $plans.ok -or @($plans.data).Count -ne 1) { throw 'No active subscription plan was available for the synthetic test.' }
$plan = @($plans.data)[0]
$runTag = "UAT-SUB-RLS-$($actorsDocument.runId)"
$testSubscription = $null
$actorCreatedSubscription = $null
$initialTier = $null
$patch = $null
$cleanup = @()
try {
  $created = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions" -Headers $adminHeaders -Body @{ user_id = $clientA.id; plan_id = $plan.id; tier = $plan.tier; status = 'trialing'; metadata = @{ uatRun = $runTag } }
  if (-not $created.ok -or @($created.data).Count -ne 1) { throw "Could not create the temporary subscription fixture (HTTP $($created.status))." }
  $testSubscription = @($created.data)[0]
  $initialTier = $testSubscription.tier

  $ownRead = Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions?select=id&id=eq.$($testSubscription.id)" -Headers $headersA
  $foreignRead = Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions?select=id&id=eq.$($testSubscription.id)" -Headers $headersB
  $patch = Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions?id=eq.$($testSubscription.id)" -Headers $headersA -Body @{ tier = 'max' }
  $afterPatch = Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions?select=tier&id=eq.$($testSubscription.id)" -Headers $adminHeaders
  $actorCreate = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions" -Headers $headersA -Body @{ user_id = $clientA.id; plan_id = $plan.id; tier = $plan.tier; status = 'trialing'; metadata = @{ uatRun = "$runTag-actor-create" } }
  if ($actorCreate.ok -and @($actorCreate.data).Count -eq 1) { $actorCreatedSubscription = @($actorCreate.data)[0] }
} finally {
  if ($testSubscription) {
    $restore = Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions?id=eq.$($testSubscription.id)" -Headers $adminHeaders -Body @{ tier = $initialTier }
    $cleanup += [ordered]@{ action = 'restore temporary subscription tier'; ok = $restore.ok; httpStatus = $restore.status }
  }
  foreach ($subscription in @($actorCreatedSubscription, $testSubscription) | Where-Object { $null -ne $_ }) {
    $deleted = Invoke-UatRest -Method Delete -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/subscriptions?id=eq.$($subscription.id)" -Headers $adminHeaders
    $cleanup += [ordered]@{ action = 'delete temporary subscription'; ok = $deleted.ok; httpStatus = $deleted.status }
  }
}

$patchedTier = if ($afterPatch.ok -and @($afterPatch.data).Count -eq 1) { @($afterPatch.data)[0].tier } else { $null }
$checks = @(
  [ordered]@{ check = 'owner reads own subscription'; passed = ($ownRead.ok -and @($ownRead.data).Count -eq 1); httpStatus = $ownRead.status },
  [ordered]@{ check = 'foreign user cannot read owner subscription by direct id'; passed = ($foreignRead.ok -and @($foreignRead.data).Count -eq 0); httpStatus = $foreignRead.status },
  [ordered]@{ check = 'normal user cannot upgrade own subscription directly'; passed = ($patchedTier -eq $initialTier); httpStatus = $patch.status; persistedTier = $patchedTier },
  [ordered]@{ check = 'normal user cannot mint a subscription directly'; passed = ($null -eq $actorCreatedSubscription); httpStatus = $actorCreate.status },
  [ordered]@{ check = 'all temporary subscription fixtures were restored or removed'; passed = (@($cleanup | Where-Object { -not $_.ok }).Count -eq 0); cleanup = $cleanup }
)
$passed = @($checks | Where-Object { $_.passed }).Count
$summary = [ordered]@{ format = 'nzamy-uat-subscription-rls/v1'; createdAt = (Get-Date).ToUniversalTime().ToString('o'); runId = $actorsDocument.runId; checks = $checks; passed = $passed; failed = ($checks.Count - $passed) }
$resultFile = Join-Path $OutputDirectory 'subscription-rls.json'
$summary | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $resultFile -Encoding utf8
$digest = (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{ output = $resultFile; checks = $checks.Count; passed = $passed; failed = ($checks.Count - $passed); sha256 = $digest } | ConvertTo-Json -Compress
