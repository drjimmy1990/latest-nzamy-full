<#
Creates only synthetic, run-tagged fixtures through the test database's
service role, then reads and attempts a deliberately unauthorized mutation
through ordinary UAT accounts. It never touches an existing business row.

This tests the deployed REST/RLS boundary, not source-code intent. The report
contains IDs and pass/fail only: it intentionally contains no passwords,
tokens, or service keys.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ActorsFile,
  [string]$OutputDirectory,
  [switch]$IUnderstandThisIsProduction
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_env.ps1')

function Invoke-UatRest {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('Get','Post','Patch')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [object]$Body = $null
  )

  $params = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = 45 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = $Body | ConvertTo-Json -Depth 20 -Compress
  }
  try {
    $bodyResult = Invoke-RestMethod @params
    return [pscustomobject]@{ ok = $true; status = 200; data = $bodyResult; error = $null }
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $detail = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return [pscustomobject]@{ ok = $false; status = $status; data = $null; error = $detail }
  }
}

function Get-ActorToken {
  param([pscustomobject]$Actor, [pscustomobject]$ActorsDocument, [hashtable]$Env)
  for ($attempt = 0; $attempt -lt 4; $attempt++) {
    $auth = Invoke-UatRest -Method Post -Uri "$($Env.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{ apikey = $Env.NEXT_PUBLIC_SUPABASE_ANON_KEY } -Body @{ email = $Actor.email; password = $ActorsDocument.password }
    if ($auth.ok -and $auth.data.access_token) { return $auth.data.access_token }
    if ($auth.status -ne 429 -or $attempt -eq 3) { throw "Authentication failed for UAT actor '$($Actor.key)' (HTTP $($auth.status))." }
    Start-Sleep -Seconds (5 * ($attempt + 1))
  }
}

function Get-Rows {
  param([string]$Table, [string]$Query, [hashtable]$Headers, [hashtable]$Env)
  $result = Invoke-UatRest -Method Get -Uri "$($Env.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/$Table`?$Query" -Headers $Headers
  if (-not $result.ok) { return [pscustomobject]@{ count = -1; error = $result.error; rows = @() } }
  $rows = @($result.data)
  return [pscustomobject]@{ count = $rows.Count; error = $null; rows = $rows }
}

$uatEnv = Assert-UatProject -AllowWrites -IUnderstandThisIsProduction:$IUnderstandThisIsProduction
$envMap = $uatEnv.RawMap
foreach ($required in @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
  if ([string]::IsNullOrWhiteSpace($envMap[$required])) { throw "Missing $required in the local UAT environment." }
}

$actorsDocument = Get-Content -Raw $ActorsFile | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Split-Path -Parent $ActorsFile }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$actors = @{}
$actorsDocument.actors.psobject.Properties | ForEach-Object { $actors[$_.Name] = $_.Value }
$entities = $actorsDocument.entities
foreach ($requiredActor in @('client-a','client-b','lawyer-solo','firm-a-owner','firm-b-owner','firm-a-office_admin','business-a-owner','business-b-owner','business-b-legal_staff')) {
  if (-not $actors.ContainsKey($requiredActor)) { throw "Required UAT actor is missing: $requiredActor" }
}

$runTag = "$($actorsDocument.runId)-tenant-isolation"
$prefix = "uat-$runTag"
$adminHeaders = @{
  apikey = $envMap.SUPABASE_SERVICE_ROLE_KEY
  Authorization = "Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)"
  Prefer = 'resolution=merge-duplicates,return=representation'
}

$fixtures = [ordered]@{
  clientARequest = "$prefix-client-a"
  clientBRequest = "$prefix-client-b"
  firmARequest = "$prefix-firm-a"
  firmBRequest = "$prefix-firm-b"
  businessARequest = "$prefix-business-a"
  businessBRequest = "$prefix-business-b"
  caseA = "$prefix-case-a"
  caseB = "$prefix-case-b"
}

$requestRows = @(
  @{ id=$fixtures.clientARequest; requester_user_id=$actors['client-a'].id; type='service'; title='UAT tenant client A'; description='Synthetic UAT fixture only.'; receiver='lawyer'; status='pending_assignment'; source_path='/uat'; metadata=@{ uat_run=$runTag } },
  @{ id=$fixtures.clientBRequest; requester_user_id=$actors['client-b'].id; type='service'; title='UAT tenant client B'; description='Synthetic UAT fixture only.'; receiver='lawyer'; status='pending_assignment'; source_path='/uat'; metadata=@{ uat_run=$runTag } },
  @{ id=$fixtures.firmARequest; requester_user_id=$actors['firm-a-owner'].id; firm_id=$entities.firmA; type='service'; title='UAT tenant firm A'; description='Synthetic UAT fixture only.'; receiver='firm'; status='pending_assignment'; source_path='/uat'; metadata=@{ uat_run=$runTag } },
  @{ id=$fixtures.firmBRequest; requester_user_id=$actors['firm-b-owner'].id; firm_id=$entities.firmB; type='service'; title='UAT tenant firm B'; description='Synthetic UAT fixture only.'; receiver='firm'; status='pending_assignment'; source_path='/uat'; metadata=@{ uat_run=$runTag } },
  @{ id=$fixtures.businessARequest; requester_user_id=$actors['business-a-owner'].id; business_id=$entities.businessA; type='business_case'; title='UAT tenant business A'; description='Synthetic UAT fixture only.'; receiver='business_legal'; status='pending_assignment'; source_path='/uat'; metadata=@{ uat_run=$runTag } },
  @{ id=$fixtures.businessBRequest; requester_user_id=$actors['business-b-owner'].id; business_id=$entities.businessB; type='business_case'; title='UAT tenant business B'; description='Synthetic UAT fixture only.'; receiver='business_legal'; status='pending_assignment'; source_path='/uat'; metadata=@{ uat_run=$runTag } }
)

$fixtureWrites = @()
foreach ($row in $requestRows) {
  $write = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/service_requests?on_conflict=id" -Headers $adminHeaders -Body $row
  $fixtureWrites += [ordered]@{ table='service_requests'; id=$row.id; createdOrUpdated=$write.ok; httpStatus=$write.status; error=$write.error }
}

$caseRows = @(
  @{ id=$fixtures.caseA; client_user_id=$actors['client-a'].id; assigned_user_id=$actors['lawyer-solo'].id; title='UAT case client A and solo lawyer'; status='open'; metadata=@{ uat_run=$runTag } },
  @{ id=$fixtures.caseB; client_user_id=$actors['client-b'].id; assigned_user_id=$actors['firm-b-owner'].id; title='UAT case client B and firm B'; status='open'; metadata=@{ uat_run=$runTag } }
)
foreach ($row in $caseRows) {
  $write = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/cases?on_conflict=id" -Headers $adminHeaders -Body $row
  $fixtureWrites += [ordered]@{ table='cases'; id=$row.id; createdOrUpdated=$write.ok; httpStatus=$write.status; error=$write.error }
}

$notificationA = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/notifications" -Headers $adminHeaders -Body @{ user_id=$actors['client-a'].id; title="UAT isolation notification $runTag"; body='Synthetic UAT fixture only.'; href='/uat' }
$notificationId = if ($notificationA.ok -and @($notificationA.data).Count -gt 0) { @($notificationA.data)[0].id } else { $null }
$fixtureWrites += [ordered]@{ table='notifications'; id=$notificationId; createdOrUpdated=$notificationA.ok; httpStatus=$notificationA.status; error=$notificationA.error }

$actorTokens = @{}
foreach ($key in @('client-a','client-b','lawyer-solo','firm-a-owner','firm-b-owner','firm-a-office_admin','business-a-owner','business-b-owner','business-b-legal_staff')) {
  $actorTokens[$key] = Get-ActorToken -Actor $actors[$key] -ActorsDocument $actorsDocument -Env $envMap
}
function Actor-Headers([string]$Key) { return @{ apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY; Authorization="Bearer $($actorTokens[$Key])" } }
function Add-Check([System.Collections.ArrayList]$List, [string]$Name, [bool]$Passed, [string]$Evidence, [string]$Outcome = 'passed') {
  if ($Outcome -eq 'passed' -and -not $Passed) { $Outcome = 'failed' }
  [void]$List.Add([ordered]@{ check=$Name; outcome=$Outcome; passed=$Passed; evidence=$Evidence })
}

$checks = [System.Collections.ArrayList]@()
$clientAOwn = Get-Rows -Table 'service_requests' -Query "select=id&id=eq.$($fixtures.clientARequest)" -Headers (Actor-Headers 'client-a') -Env $envMap
Add-Check $checks 'client A reads own service request' ($clientAOwn.count -eq 1) "rows=$($clientAOwn.count)"
$clientAForeign = Get-Rows -Table 'service_requests' -Query "select=id&id=eq.$($fixtures.clientBRequest)" -Headers (Actor-Headers 'client-a') -Env $envMap
Add-Check $checks 'client A cannot read client B service request by direct id' ($clientAForeign.count -eq 0) "rows=$($clientAForeign.count)"
$firmAMember = Get-Rows -Table 'service_requests' -Query "select=id&id=eq.$($fixtures.firmARequest)" -Headers (Actor-Headers 'firm-a-office_admin') -Env $envMap
Add-Check $checks 'active firm A member reads firm A request' ($firmAMember.count -eq 1) "rows=$($firmAMember.count)"
$firmAForeign = Get-Rows -Table 'service_requests' -Query "select=id&id=eq.$($fixtures.firmBRequest)" -Headers (Actor-Headers 'firm-a-office_admin') -Env $envMap
Add-Check $checks 'firm A member cannot read firm B request by direct id' ($firmAForeign.count -eq 0) "rows=$($firmAForeign.count)"
$businessFixturesReady = @($fixtureWrites | Where-Object { $_.id -in @($fixtures.businessARequest, $fixtures.businessBRequest) -and $_.createdOrUpdated }).Count -eq 2
if ($businessFixturesReady) {
  $businessBOwn = Get-Rows -Table 'service_requests' -Query "select=id&id=eq.$($fixtures.businessBRequest)" -Headers (Actor-Headers 'business-b-legal_staff') -Env $envMap
  Add-Check $checks 'active business B member reads business B request' ($businessBOwn.count -eq 1) "rows=$($businessBOwn.count)"
  $businessBForeign = Get-Rows -Table 'service_requests' -Query "select=id&id=eq.$($fixtures.businessARequest)" -Headers (Actor-Headers 'business-b-legal_staff') -Env $envMap
  Add-Check $checks 'business B member cannot read business A request by direct id' ($businessBForeign.count -eq 0) "rows=$($businessBForeign.count)"
} else {
  $businessError = (@($fixtureWrites | Where-Object { $_.id -in @($fixtures.businessARequest, $fixtures.businessBRequest) -and -not $_.createdOrUpdated } | Select-Object -First 1).error)
  Add-Check $checks 'active business B member reads business B request' $false "Blocked before RLS assertion: business fixture could not be inserted. $businessError" 'blocked'
  Add-Check $checks 'business B member cannot read business A request by direct id' $false "Blocked before RLS assertion: business fixture could not be inserted. $businessError" 'blocked'
}
$caseClient = Get-Rows -Table 'cases' -Query "select=id&id=eq.$($fixtures.caseA)" -Headers (Actor-Headers 'client-a') -Env $envMap
Add-Check $checks 'client A reads its case' ($caseClient.count -eq 1) "rows=$($caseClient.count)"
$caseLawyer = Get-Rows -Table 'cases' -Query "select=id&id=eq.$($fixtures.caseA)" -Headers (Actor-Headers 'lawyer-solo') -Env $envMap
Add-Check $checks 'assigned lawyer reads client A case' ($caseLawyer.count -eq 1) "rows=$($caseLawyer.count)"
$caseForeign = Get-Rows -Table 'cases' -Query "select=id&id=eq.$($fixtures.caseA)" -Headers (Actor-Headers 'client-b') -Env $envMap
Add-Check $checks 'client B cannot read client A case by direct id' ($caseForeign.count -eq 0) "rows=$($caseForeign.count)"
if ($notificationId) {
  $notificationOwn = Get-Rows -Table 'notifications' -Query "select=id&id=eq.$notificationId" -Headers (Actor-Headers 'client-a') -Env $envMap
  Add-Check $checks 'client A reads own notification' ($notificationOwn.count -eq 1) "rows=$($notificationOwn.count)"
  $notificationForeign = Get-Rows -Table 'notifications' -Query "select=id&id=eq.$notificationId" -Headers (Actor-Headers 'client-b') -Env $envMap
  Add-Check $checks 'client B cannot read client A notification by direct id' ($notificationForeign.count -eq 0) "rows=$($notificationForeign.count)"
} else {
  Add-Check $checks 'notification fixture created' $false "fixture creation failed"
}

# A denied PATCH often returns 200/204 with zero affected rows. Verify from the
# service-role view rather than trusting the HTTP status alone.
$unauthorizedMarker = "UAT-UNAUTHORIZED-MUTATION-$runTag"
$patchResult = Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/service_requests?id=eq.$($fixtures.clientBRequest)" -Headers ((Actor-Headers 'client-a') + @{ Prefer='return=representation' }) -Body @{ description=$unauthorizedMarker }
$afterPatch = Get-Rows -Table 'service_requests' -Query "select=id,description&id=eq.$($fixtures.clientBRequest)" -Headers $adminHeaders -Env $envMap
$foreignWasMutated = ($afterPatch.count -eq 1 -and $afterPatch.rows[0].description -eq $unauthorizedMarker)
Add-Check $checks 'client A cannot mutate client B request by direct id' (-not $foreignWasMutated) "http=$($patchResult.status); foreign_row_mutated=$foreignWasMutated"

$passed = @($checks | Where-Object { $_.passed }).Count
$summary = [ordered]@{
  format='nzamy-uat-core-tenant-isolation/v1'
  createdAt=(Get-Date).ToUniversalTime().ToString('o')
  runId=$actorsDocument.runId
  runTag=$runTag
  fixtures=$fixtures
  fixtureWrites=$fixtureWrites
  checks=$checks
  passed=$passed
  failed=($checks.Count-$passed)
}
$resultFile = Join-Path $OutputDirectory 'core-tenant-isolation.json'
$summary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resultFile -Encoding utf8
$digest = (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{ output=$resultFile; checks=$checks.Count; passed=$passed; failed=($checks.Count-$passed); sha256=$digest } | ConvertTo-Json -Compress
