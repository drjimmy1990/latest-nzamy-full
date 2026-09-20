<#
Controlled Storage RLS test for the private `documents` bucket. It uploads one
synthetic text file under client A's UID folder, proves the owner/cross-user
boundaries, and removes the test object even if a negative test fails.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ActorsFile,
  [string]$OutputDirectory
)

$ErrorActionPreference='Stop'
$envMap=@{}
Get-Content (Join-Path $PSScriptRoot '..\..\.env.local') | ForEach-Object {
  $m=[regex]::Match($_,'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
  if($m.Success){$envMap[$m.Groups[1].Value]=$m.Groups[2].Value.Trim().Trim('"').Trim("'")}
}
foreach($required in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY')){if([string]::IsNullOrWhiteSpace($envMap[$required])){throw "Missing $required in local UAT configuration."}}
$actorsDocument=Get-Content -Raw $ActorsFile|ConvertFrom-Json
if([string]::IsNullOrWhiteSpace($OutputDirectory)){$OutputDirectory=Split-Path -Parent $ActorsFile};New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
$clientA=$actorsDocument.actors.'client-a';$clientB=$actorsDocument.actors.'client-b';if(-not $clientA -or -not $clientB){throw 'client-a and client-b UAT actors are required.'}

function Invoke-UatRest {
  param([ValidateSet('Get','Post','Delete')][string]$Method,[string]$Uri,[hashtable]$Headers,[object]$Body=$null,[string]$ContentType=$null)
  $params=@{Uri=$Uri;Method=$Method;Headers=$Headers;TimeoutSec=45}
  if($null -ne $Body){$params.Body=$Body;if($ContentType){$params.ContentType=$ContentType}}
  try{$response=Invoke-WebRequest @params;return [pscustomobject]@{ok=$true;status=[int]$response.StatusCode;content=$response.Content;error=$null}}
  catch{$status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{$null};$detail=if($_.ErrorDetails.Message){$_.ErrorDetails.Message}else{$_.Exception.Message};return [pscustomobject]@{ok=$false;status=$status;content=$null;error=$detail}}
}
function Get-Token([pscustomobject]$Actor){
  for($attempt=0;$attempt -lt 4;$attempt++){
    $r=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;'Content-Type'='application/json'} -Body ((@{email=$Actor.email;password=$actorsDocument.password}|ConvertTo-Json -Compress)) -ContentType 'application/json'
    if($r.ok){$token=($r.content|ConvertFrom-Json).access_token;if($token){return $token}}
    if($r.status -ne 429 -or $attempt -eq 3){throw "Authentication failed for $($Actor.key) (HTTP $($r.status))."};Start-Sleep -Seconds (5*($attempt+1))
  }
}

$base=$envMap.NEXT_PUBLIC_SUPABASE_URL;$tokenA=Get-Token $clientA;$tokenB=Get-Token $clientB
$headersA=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $tokenA";'x-upsert'='false'}
$headersB=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $tokenB"}
$headersAdmin=@{apikey=$envMap.SUPABASE_SERVICE_ROLE_KEY;Authorization="Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)"}
$path="$($clientA.id)/uat/$($actorsDocument.runId)-storage.txt";$uploadUri="$base/storage/v1/object/documents/$path";$downloadUri="$base/storage/v1/object/authenticated/documents/$path";$payload="Synthetic UAT storage probe: $($actorsDocument.runId)"
$upload=$null;$ownerDownload=$null;$foreignDownload=$null;$foreignDelete=$null;$afterForeignDelete=$null;$cleanup=@()
try {
  $upload=Invoke-UatRest -Method Post -Uri $uploadUri -Headers $headersA -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType 'text/plain; charset=utf-8'
  if(-not $upload.ok){throw "Owner upload failed (HTTP $($upload.status)): $($upload.error)"}
  $ownerDownload=Invoke-UatRest -Method Get -Uri $downloadUri -Headers $headersA
  $foreignDownload=Invoke-UatRest -Method Get -Uri $downloadUri -Headers $headersB
  $foreignDelete=Invoke-UatRest -Method Delete -Uri $uploadUri -Headers $headersB
  $afterForeignDelete=Invoke-UatRest -Method Get -Uri $downloadUri -Headers $headersAdmin
} finally {
  # If the foreign DELETE actually removed the object, it is already cleaned up;
  # distinguish that confirmed absence from an unrelated storage/server error.
  $absentAfterForeignDelete = $afterForeignDelete -and -not $afterForeignDelete.ok -and (
    $afterForeignDelete.status -eq 404 -or $afterForeignDelete.error -match '(?i)not found|not exist|resource')
  if ($absentAfterForeignDelete) {
    $cleanup += [ordered]@{action='confirm object already absent after foreign delete';ok=$true;httpStatus=$afterForeignDelete.status}
  } else {
    $deleted=Invoke-UatRest -Method Delete -Uri $uploadUri -Headers $headersAdmin
    $cleanup += [ordered]@{action='delete synthetic storage object';ok=($deleted.ok -or $deleted.status -eq 404);httpStatus=$deleted.status}
  }
}

$foreignDeleted=$absentAfterForeignDelete
$checks=@(
  [ordered]@{check='owner uploads synthetic document under own UID folder';passed=$upload.ok;httpStatus=$upload.status},
  [ordered]@{check='owner downloads own private document';passed=($ownerDownload.ok -and $ownerDownload.content -eq $payload);httpStatus=$ownerDownload.status},
  [ordered]@{check='foreign user cannot download private document by direct path';passed=(-not $foreignDownload.ok);httpStatus=$foreignDownload.status},
  [ordered]@{check='foreign user cannot delete private document by direct path';passed=(-not $foreignDeleted);httpStatus=$foreignDelete.status;objectStillPresent=$afterForeignDelete.ok;afterProbeStatus=$afterForeignDelete.status;afterProbeError=$afterForeignDelete.error},
  [ordered]@{check='synthetic storage object was removed';passed=(@($cleanup|Where-Object{-not $_.ok}).Count -eq 0);cleanup=$cleanup}
)
$passed=@($checks|Where-Object{$_.passed}).Count;$summary=[ordered]@{format='nzamy-uat-document-storage-isolation/v1';createdAt=(Get-Date).ToUniversalTime().ToString('o');runId=$actorsDocument.runId;bucket='documents';checks=$checks;passed=$passed;failed=($checks.Count-$passed)}
$resultFile=Join-Path $OutputDirectory 'document-storage-isolation.json';$summary|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $resultFile -Encoding utf8;$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{output=$resultFile;checks=$checks.Count;passed=$passed;failed=($checks.Count-$passed);sha256=$digest}|ConvertTo-Json -Compress
