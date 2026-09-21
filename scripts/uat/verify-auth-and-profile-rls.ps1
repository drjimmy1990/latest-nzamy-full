<#
Read-only verification for the real UAT accounts.  It authenticates every
synthetic actor against Supabase, then proves that a regular user can read its
own profile but not another actor's profile through the REST API.
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
$baseUrl = $uatEnv.Url
$anonKey = $uatEnv.AnonKey
if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($anonKey)) { throw 'Missing test auth configuration.' }

$actorsDocument = Get-Content -Raw $ActorsFile | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Split-Path -Parent $ActorsFile }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Invoke-ActorRest {
  param([string]$Method, [string]$Path, [hashtable]$Headers, [object]$Body = $null)
  $params = @{ Uri = $baseUrl + $Path; Method = $Method; Headers = $Headers; TimeoutSec = 45 }
  if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress) }
  for ($attempt = 0; $attempt -lt 4; $attempt++) {
    try { return Invoke-RestMethod @params }
    catch {
      $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
      if ($status -ne 429 -or $attempt -eq 3) { throw }
      Start-Sleep -Seconds (5 * ($attempt + 1))
    }
  }
}

$allActors = @($actorsDocument.actors.psobject.Properties | ForEach-Object { $_.Value })
$foreignId = $allActors[0].id
$rows = @()
foreach ($actor in $allActors) {
  try {
    $auth = Invoke-ActorRest -Method 'Post' -Path '/auth/v1/token?grant_type=password' -Headers @{ apikey = $anonKey } -Body @{ email = $actor.email; password = $actorsDocument.password }
    if ([string]::IsNullOrWhiteSpace($auth.access_token)) { throw 'The authentication response contained no access token.' }
    $headers = @{ apikey = $anonKey; Authorization = "Bearer $($auth.access_token)" }
    $own = @(Invoke-ActorRest -Method 'Get' -Path ('/rest/v1/profiles?select=id,user_type&id=eq.' + $actor.id) -Headers $headers)
    $otherId = if ($actor.id -eq $foreignId) { $allActors[1].id } else { $foreignId }
    $foreign = @(Invoke-ActorRest -Method 'Get' -Path ('/rest/v1/profiles?select=id&id=eq.' + $otherId) -Headers $headers)
    $rows += [ordered]@{
      actor = $actor.key
      userType = $actor.user_type
      authentication = 'passed'
      ownProfile = ($own.Count -eq 1 -and $own[0].id -eq $actor.id -and $own[0].user_type -eq $actor.user_type)
      foreignProfileHidden = ($foreign.Count -eq 0)
    }
  } catch {
    $rows += [ordered]@{ actor = $actor.key; userType = $actor.user_type; authentication = 'failed'; ownProfile = $false; foreignProfileHidden = $false; error = $_.Exception.Message }
  }
}

$summary = [ordered]@{
  format = 'nzamy-uat-auth-rls/v1'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  runId = $actorsDocument.runId
  totalActors = $rows.Count
  authenticated = @($rows | Where-Object { $_.authentication -eq 'passed' }).Count
  ownProfilePassed = @($rows | Where-Object { $_.ownProfile }).Count
  foreignProfileHidden = @($rows | Where-Object { $_.foreignProfileHidden }).Count
  results = $rows
}
$resultFile = Join-Path $OutputDirectory 'auth-and-profile-rls.json'
$summary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resultFile -Encoding utf8
$digest = (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{ output = $resultFile; totalActors = $summary.totalActors; authenticated = $summary.authenticated; ownProfilePassed = $summary.ownProfilePassed; foreignProfileHidden = $summary.foreignProfileHidden; sha256 = $digest } | ConvertTo-Json -Compress
