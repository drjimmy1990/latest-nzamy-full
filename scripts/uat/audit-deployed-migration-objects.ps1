<#
Read-only deployment audit. It distinguishes a migration file in the checkout
from the tables/columns visible through the deployed Supabase schema cache.
It neither applies SQL nor changes data.
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$OutputDirectory)

$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '_env.ps1')
$uatEnv=Assert-UatProject
$envMap=$uatEnv.RawMap
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
$headers=@{apikey=$envMap.SUPABASE_SERVICE_ROLE_KEY;Authorization="Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)"}
function Test-DeployedObject([string]$Name,[string]$Path){
  try{$response=Invoke-WebRequest -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/$Path" -Headers $headers -Method Get -TimeoutSec 45;return [ordered]@{object=$Name;present=$true;httpStatus=[int]$response.StatusCode;error=$null}}
  catch{$status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{$null};$detail=if($_.ErrorDetails.Message){$_.ErrorDetails.Message}else{$_.Exception.Message};return [ordered]@{object=$Name;present=$false;httpStatus=$status;error=$detail}}
}
$checks=@(
  (Test-DeployedObject 'subscriptions table' 'subscriptions?select=id&limit=0')
  (Test-DeployedObject 'service_requests.business_id column' 'service_requests?select=business_id&limit=0')
  (Test-DeployedObject 'court_cost_notices table' 'court_cost_notices?select=id&limit=0')
  (Test-DeployedObject 'case_disbursements table' 'case_disbursements?select=id&limit=0')
)
$summary=[ordered]@{format='nzamy-uat-deployed-migration-objects/v1';createdAt=(Get-Date).ToUniversalTime().ToString('o');checks=$checks;present=@($checks|Where-Object{$_.present}).Count;missing=@($checks|Where-Object{-not $_.present}).Count}
$resultFile=Join-Path $OutputDirectory 'deployed-migration-objects.json';$summary|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $resultFile -Encoding utf8;$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{output=$resultFile;present=$summary.present;missing=$summary.missing;sha256=$digest}|ConvertTo-Json -Compress
