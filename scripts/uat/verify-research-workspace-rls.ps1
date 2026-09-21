<#
Controlled, synthetic test of the persisted research workspace used by AI pages.
The test creates one session and item for client A, checks owner/cross-user
read/write behavior with ordinary JWTs, and deletes its temporary data.
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
foreach ($required in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY')) {
  if ([string]::IsNullOrWhiteSpace($envMap[$required])) { throw "Missing $required in local UAT configuration." }
}
$actorsDocument = Get-Content -Raw $ActorsFile | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Split-Path -Parent $ActorsFile }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$clientA = $actorsDocument.actors.'client-a'; $clientB = $actorsDocument.actors.'client-b'
if (-not $clientA -or -not $clientB) { throw 'client-a and client-b UAT actors are required.' }

function Invoke-UatRest {
  param([ValidateSet('Get','Post','Patch','Delete')][string]$Method,[string]$Uri,[hashtable]$Headers,[object]$Body=$null)
  $params=@{Uri=$Uri;Method=$Method;Headers=$Headers;TimeoutSec=45}
  if($null -ne $Body){$params.ContentType='application/json';$params.Body=$Body|ConvertTo-Json -Compress -Depth 10}
  try{$data=Invoke-RestMethod @params;return [pscustomobject]@{ok=$true;status=200;data=$data;error=$null}}
  catch{$status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{$null};$detail=if($_.ErrorDetails.Message){$_.ErrorDetails.Message}else{$_.Exception.Message};return [pscustomobject]@{ok=$false;status=$status;data=$null;error=$detail}}
}
function Get-Token([pscustomobject]$Actor) {
  for($attempt=0;$attempt -lt 4;$attempt++){
    $r=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY} -Body @{email=$Actor.email;password=$actorsDocument.password}
    if($r.ok -and $r.data.access_token){return $r.data.access_token}
    if($r.status -ne 429 -or $attempt -eq 3){throw "Authentication failed for $($Actor.key) (HTTP $($r.status))."}
    Start-Sleep -Seconds (5*($attempt+1))
  }
}

$adminHeaders=@{apikey=$envMap.SUPABASE_SERVICE_ROLE_KEY;Authorization="Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)";Prefer='return=representation'}
$headersA=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $(Get-Token $clientA)";Prefer='return=representation'}
$headersB=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $(Get-Token $clientB)";Prefer='return=representation'}
$tag="UAT-RESEARCH-$($actorsDocument.runId)"; $session=$null; $item=$null; $cleanup=@()
try {
  $sessionCreate=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_sessions" -Headers $adminHeaders -Body @{user_id=$clientA.id;title=$tag;tool_id='direction-support';metadata=@{uatRun=$actorsDocument.runId}}
  if(-not $sessionCreate.ok -or @($sessionCreate.data).Count -ne 1){throw "Could not create UAT research session (HTTP $($sessionCreate.status))."}; $session=@($sessionCreate.data)[0]
  $itemCreate=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_items" -Headers $adminHeaders -Body @{session_id=$session.id;user_id=$clientA.id;source='UAT synthetic source';item_type='text';title=$tag;content='Synthetic UAT research item only.';metadata=@{uatRun=$actorsDocument.runId}}
  if(-not $itemCreate.ok -or @($itemCreate.data).Count -ne 1){throw "Could not create UAT research item (HTTP $($itemCreate.status))."}; $item=@($itemCreate.data)[0]

  $aSession=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_sessions?select=id&id=eq.$($session.id)" -Headers $headersA
  $bSession=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_sessions?select=id&id=eq.$($session.id)" -Headers $headersB
  $aItem=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_items?select=id&id=eq.$($item.id)" -Headers $headersA
  $bItem=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_items?select=id&id=eq.$($item.id)" -Headers $headersB
  $marker="$tag-FOREIGN-MUTATION"
  $foreignPatch=Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_items?id=eq.$($item.id)" -Headers $headersB -Body @{content=$marker}
  $afterForeignPatch=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_items?select=content&id=eq.$($item.id)" -Headers $adminHeaders
} finally {
  if($session){$deleted=Invoke-UatRest -Method Delete -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/research_sessions?id=eq.$($session.id)" -Headers $adminHeaders;$cleanup += [ordered]@{action='delete temporary research session (cascades item)';ok=$deleted.ok;httpStatus=$deleted.status}}
}

$foreignMutated=($afterForeignPatch.ok -and @($afterForeignPatch.data).Count -eq 1 -and @($afterForeignPatch.data)[0].content -eq $marker)
$checks=@(
  [ordered]@{check='owner reads own research session';passed=($aSession.ok -and @($aSession.data).Count -eq 1);httpStatus=$aSession.status},
  [ordered]@{check='foreign user cannot read research session by direct id';passed=($bSession.ok -and @($bSession.data).Count -eq 0);httpStatus=$bSession.status},
  [ordered]@{check='owner reads own research item';passed=($aItem.ok -and @($aItem.data).Count -eq 1);httpStatus=$aItem.status},
  [ordered]@{check='foreign user cannot read research item by direct id';passed=($bItem.ok -and @($bItem.data).Count -eq 0);httpStatus=$bItem.status},
  [ordered]@{check='foreign user cannot mutate research item by direct id';passed=(-not $foreignMutated);httpStatus=$foreignPatch.status;foreignRowMutated=$foreignMutated},
  [ordered]@{check='temporary UAT research workspace was removed';passed=(@($cleanup|Where-Object{-not $_.ok}).Count -eq 0);cleanup=$cleanup}
)
$passed=@($checks|Where-Object{$_.passed}).Count
$summary=[ordered]@{format='nzamy-uat-research-workspace-rls/v1';createdAt=(Get-Date).ToUniversalTime().ToString('o');runId=$actorsDocument.runId;checks=$checks;passed=$passed;failed=($checks.Count-$passed)}
$resultFile=Join-Path $OutputDirectory 'research-workspace-rls.json';$summary|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $resultFile -Encoding utf8
$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{output=$resultFile;checks=$checks.Count;passed=$passed;failed=($checks.Count-$passed);sha256=$digest}|ConvertTo-Json -Compress
