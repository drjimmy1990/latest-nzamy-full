<#
Controlled RLS/write validation against synthetic UAT accounts only.
It tests two requirements at the deployed database boundary and restores every
field it changes in a finally block:
  1) another user cannot mutate a foreign profile;
  2) an own phone cannot be set to malformed text.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ActorsFile,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$envMap = @{}
Get-Content (Join-Path $PSScriptRoot '..\..\.env.local') | ForEach-Object {
  $m=[regex]::Match($_,'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
  if($m.Success){$envMap[$m.Groups[1].Value]=$m.Groups[2].Value.Trim().Trim('"').Trim("'")}
}
foreach($required in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY')){
  if([string]::IsNullOrWhiteSpace($envMap[$required])){throw "Missing $required in local UAT configuration."}
}
$actorsDocument=Get-Content -Raw $ActorsFile|ConvertFrom-Json
if([string]::IsNullOrWhiteSpace($OutputDirectory)){$OutputDirectory=Split-Path -Parent $ActorsFile}
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
$clientA=$actorsDocument.actors.'client-a'
$clientB=$actorsDocument.actors.'client-b'
if(-not $clientA -or -not $clientB){throw 'client-a and client-b UAT actors are required.'}

function Invoke-UatRest {
  param([ValidateSet('Get','Post','Patch')][string]$Method,[string]$Uri,[hashtable]$Headers,[object]$Body=$null)
  $params=@{Uri=$Uri;Method=$Method;Headers=$Headers;TimeoutSec=45}
  if($null -ne $Body){$params.ContentType='application/json';$params.Body=$Body|ConvertTo-Json -Compress -Depth 10}
  try{$data=Invoke-RestMethod @params;return [pscustomobject]@{ok=$true;status=200;data=$data;error=$null}}
  catch{$status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{$null};$detail=if($_.ErrorDetails.Message){$_.ErrorDetails.Message}else{$_.Exception.Message};return [pscustomobject]@{ok=$false;status=$status;data=$null;error=$detail}}
}
function Get-Token([pscustomobject]$Actor){
  for($attempt=0;$attempt -lt 4;$attempt++){
    $r=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY} -Body @{email=$Actor.email;password=$actorsDocument.password}
    if($r.ok -and $r.data.access_token){return $r.data.access_token}
    if($r.status -ne 429 -or $attempt -eq 3){throw "Authentication failed for $($Actor.key) (HTTP $($r.status))."}
    Start-Sleep -Seconds (5*($attempt+1))
  }
}

$adminHeaders=@{apikey=$envMap.SUPABASE_SERVICE_ROLE_KEY;Authorization="Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)";Prefer='return=representation'}
$tokenA=Get-Token $clientA
$tokenB=Get-Token $clientB
$headersA=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $tokenA";Prefer='return=representation'}
$headersB=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $tokenB";Prefer='return=representation'}
$before=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/profiles?select=id,display_name,phone&id=in.($($clientA.id),$($clientB.id))" -Headers $adminHeaders
if(-not $before.ok -or @($before.data).Count -ne 2){throw 'Could not read the original synthetic profile values for safe restoration.'}
$originalA=@($before.data|Where-Object{$_.id -eq $clientA.id})[0]
$originalB=@($before.data|Where-Object{$_.id -eq $clientB.id})[0]
$foreignMarker="UAT-FOREIGN-WRITE-$($actorsDocument.runId)"
$invalidPhone='letters-and-email@example.test'
$foreignPatch=$null;$ownPhonePatch=$null;$afterForeign=$null;$afterPhone=$null;$restore=@()
try{
  $foreignPatch=Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/profiles?id=eq.$($clientB.id)" -Headers $headersA -Body @{display_name=$foreignMarker}
  $afterForeign=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/profiles?select=display_name&id=eq.$($clientB.id)" -Headers $adminHeaders
  $ownPhonePatch=Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/profiles?id=eq.$($clientA.id)" -Headers $headersA -Body @{phone=$invalidPhone}
  $afterPhone=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/profiles?select=phone&id=eq.$($clientA.id)" -Headers $adminHeaders
} finally {
  foreach($entry in @(
    @{id=$clientA.id;body=@{phone=$originalA.phone}},
    @{id=$clientB.id;body=@{display_name=$originalB.display_name}}
  )){
    $r=Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/profiles?id=eq.$($entry.id)" -Headers $adminHeaders -Body $entry.body
    $restore += [ordered]@{profile=$entry.id;restored=$r.ok;httpStatus=$r.status;error=$r.error}
  }
}

$foreignMutated=($afterForeign.ok -and @($afterForeign.data).Count -eq 1 -and @($afterForeign.data)[0].display_name -eq $foreignMarker)
$invalidPhonePersisted=($afterPhone.ok -and @($afterPhone.data).Count -eq 1 -and @($afterPhone.data)[0].phone -eq $invalidPhone)
$checks=@(
  [ordered]@{check='client A cannot mutate client B profile by direct id';passed=(-not $foreignMutated);httpStatus=$foreignPatch.status;foreignRowMutated=$foreignMutated},
  [ordered]@{check='database rejects malformed own Saudi mobile';passed=(-not $invalidPhonePersisted);httpStatus=$ownPhonePatch.status;invalidPhonePersisted=$invalidPhonePersisted},
  [ordered]@{check='all synthetic fields modified by this test were restored';passed=(@($restore|Where-Object{-not $_.restored}).Count -eq 0);restore=$restore}
)
$passed=@($checks|Where-Object{$_.passed}).Count
$summary=[ordered]@{format='nzamy-uat-profile-write-guards/v1';createdAt=(Get-Date).ToUniversalTime().ToString('o');runId=$actorsDocument.runId;checks=$checks;passed=$passed;failed=($checks.Count-$passed)}
$resultFile=Join-Path $OutputDirectory 'profile-write-guards.json'
$summary|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $resultFile -Encoding utf8
$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{output=$resultFile;checks=$checks.Count;passed=$passed;failed=($checks.Count-$passed);sha256=$digest}|ConvertTo-Json -Compress
