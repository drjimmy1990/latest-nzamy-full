<#
Controlled RLS test for user_settings. It snapshots or creates a setting for a
synthetic user, checks own/cross-user access, then restores the original state.
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ActorsFile,[string]$OutputDirectory,[switch]$IUnderstandThisIsProduction)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '_env.ps1')
$uatEnv=Assert-UatProject -AllowWrites -IUnderstandThisIsProduction:$IUnderstandThisIsProduction
$envMap=$uatEnv.RawMap
foreach($required in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY')){if([string]::IsNullOrWhiteSpace($envMap[$required])){throw "Missing $required in local UAT configuration."}}
$actorsDocument=Get-Content -Raw $ActorsFile|ConvertFrom-Json;if([string]::IsNullOrWhiteSpace($OutputDirectory)){$OutputDirectory=Split-Path -Parent $ActorsFile};New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
$clientA=$actorsDocument.actors.'client-a';$clientB=$actorsDocument.actors.'client-b';if(-not $clientA -or -not $clientB){throw 'client-a and client-b UAT actors are required.'}
function Invoke-UatRest {param([ValidateSet('Get','Post','Patch','Delete')][string]$Method,[string]$Uri,[hashtable]$Headers,[object]$Body=$null);$params=@{Uri=$Uri;Method=$Method;Headers=$Headers;TimeoutSec=45};if($null -ne $Body){$params.ContentType='application/json';$params.Body=$Body|ConvertTo-Json -Compress -Depth 10};try{$data=Invoke-RestMethod @params;return [pscustomobject]@{ok=$true;status=200;data=$data;error=$null}}catch{$status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{$null};$detail=if($_.ErrorDetails.Message){$_.ErrorDetails.Message}else{$_.Exception.Message};return [pscustomobject]@{ok=$false;status=$status;data=$null;error=$detail}}}
function Get-Token([pscustomobject]$Actor){for($attempt=0;$attempt -lt 4;$attempt++){$r=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY} -Body @{email=$Actor.email;password=$actorsDocument.password};if($r.ok -and $r.data.access_token){return $r.data.access_token};if($r.status -ne 429 -or $attempt -eq 3){throw "Authentication failed for $($Actor.key) (HTTP $($r.status))."};Start-Sleep -Seconds (5*($attempt+1))}}
$adminHeaders=@{apikey=$envMap.SUPABASE_SERVICE_ROLE_KEY;Authorization="Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)";Prefer='return=representation'};$headersA=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $(Get-Token $clientA)";Prefer='return=representation'};$headersB=@{apikey=$envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY;Authorization="Bearer $(Get-Token $clientB)";Prefer='return=representation'}
$before=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?select=*&user_id=eq.$($clientA.id)" -Headers $adminHeaders;if(-not $before.ok){throw 'Could not snapshot client A settings.'};$original=@($before.data)[0];$createdByTest=($null -eq $original);$cleanup=@();$foreignPatch=$null;$afterForeign=$null
try{
  if($createdByTest){$created=Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings" -Headers $adminHeaders -Body @{user_id=$clientA.id;notifications_enabled=$true;email_notifications=$true;preferences=@{uatRun=$actorsDocument.runId}};if(-not $created.ok){throw "Could not create synthetic settings row (HTTP $($created.status))."}}
  $ownerRead=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?select=user_id,email_notifications&user_id=eq.$($clientA.id)" -Headers $headersA
  $foreignRead=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?select=user_id,email_notifications&user_id=eq.$($clientA.id)" -Headers $headersB
  $foreignPatch=Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?user_id=eq.$($clientA.id)" -Headers $headersB -Body @{email_notifications=$false}
  $afterForeign=Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?select=email_notifications&user_id=eq.$($clientA.id)" -Headers $adminHeaders
}finally{
  if($createdByTest){$deleted=Invoke-UatRest -Method Delete -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?user_id=eq.$($clientA.id)" -Headers $adminHeaders;$cleanup += [ordered]@{action='delete synthetic settings row';ok=$deleted.ok;httpStatus=$deleted.status}}
  elseif($original){$body=@{};foreach($property in @('notifications_enabled','email_notifications','whatsapp_notifications','push_notifications','newsletter','two_factor_enabled','session_timeout_minutes','data_sharing_consent','analytics_consent','preferences')){if($null -ne $original.PSObject.Properties[$property]){$body[$property]=$original.$property}};$restored=Invoke-UatRest -Method Patch -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/user_settings?user_id=eq.$($clientA.id)" -Headers $adminHeaders -Body $body;$cleanup += [ordered]@{action='restore original settings row';ok=$restored.ok;httpStatus=$restored.status}}
}
$foreignMutated=($afterForeign.ok -and @($afterForeign.data).Count -eq 1 -and @($afterForeign.data)[0].email_notifications -eq $false)
$checks=@(
  [ordered]@{check='owner reads own settings';passed=($ownerRead.ok -and @($ownerRead.data).Count -eq 1);httpStatus=$ownerRead.status},
  [ordered]@{check='foreign user cannot read settings by direct user id';passed=($foreignRead.ok -and @($foreignRead.data).Count -eq 0);httpStatus=$foreignRead.status},
  [ordered]@{check='foreign user cannot mutate settings by direct user id';passed=(-not $foreignMutated);httpStatus=$foreignPatch.status;foreignRowMutated=$foreignMutated},
  [ordered]@{check='settings state was restored or removed';passed=(@($cleanup|Where-Object{-not $_.ok}).Count -eq 0);cleanup=$cleanup}
)
$passed=@($checks|Where-Object{$_.passed}).Count;$summary=[ordered]@{format='nzamy-uat-user-settings-rls/v1';createdAt=(Get-Date).ToUniversalTime().ToString('o');runId=$actorsDocument.runId;checks=$checks;passed=$passed;failed=($checks.Count-$passed)};$resultFile=Join-Path $OutputDirectory 'user-settings-rls.json';$summary|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $resultFile -Encoding utf8;$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash;[ordered]@{output=$resultFile;checks=$checks.Count;passed=$passed;failed=($checks.Count-$passed);sha256=$digest}|ConvertTo-Json -Compress
