<#
Read-only readiness check. It reports whether the local UAT configuration has
non-placeholder external integration settings, without printing keys or URLs.
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$OutputDirectory)

$ErrorActionPreference='Stop';$envMap=@{}
Get-Content (Join-Path $PSScriptRoot '..\..\.env.local')|ForEach-Object{$m=[regex]::Match($_,'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$');if($m.Success){$envMap[$m.Groups[1].Value]=$m.Groups[2].Value.Trim().Trim('"').Trim("'")}}
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
function Is-Configured([string]$Name){$value=$envMap[$Name];return -not [string]::IsNullOrWhiteSpace($value) -and $value -notmatch '(?i)your-|example|changeme|replace'}
$checks=@(
  [ordered]@{integration='payment gateway sandbox';configured=((Is-Configured 'PAYMENT_GATEWAY_API_KEY') -and (Is-Configured 'PAYMENT_GATEWAY_SECRET_KEY') -and (Is-Configured 'PAYMENT_GATEWAY_WEBHOOK_SECRET'))},
  [ordered]@{integration='n8n outbound webhook';configured=(Is-Configured 'N8N_WEBHOOK_BASE_URL')},
  [ordered]@{integration='n8n webhook callback authentication';configured=(Is-Configured 'N8N_WEBHOOK_SECRET')},
  [ordered]@{integration='WhatsApp Evolution API';configured=((Is-Configured 'EVOLUTION_API_URL') -and (Is-Configured 'EVOLUTION_API_KEY'))},
  [ordered]@{integration='AI library chat via n8n';configured=(Is-Configured 'N8N_LIBRARY_CHAT_WEBHOOK_URL')}
)
$configured=@($checks|Where-Object{$_.configured}).Count
$summary=[ordered]@{format='nzamy-uat-integration-readiness/v1';createdAt=(Get-Date).ToUniversalTime().ToString('o');checks=$checks;configured=$configured;notConfigured=($checks.Count-$configured)}
$resultFile=Join-Path $OutputDirectory 'integration-readiness.json';$summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $resultFile -Encoding utf8;$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{output=$resultFile;configured=$configured;notConfigured=$summary.notConfigured;sha256=$digest}|ConvertTo-Json -Compress
