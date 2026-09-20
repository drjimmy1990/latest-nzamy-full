<#
Read-only RLS test for memberships seeded by seed-actors.ps1.  It verifies the
positive co-member view and the negative cross-entity direct-id view without
creating, changing, or deleting database rows.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ActorsFile,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$envMap = @{}
Get-Content (Join-Path $PSScriptRoot '..\..\.env.local') | ForEach-Object {
  $m = [regex]::Match($_, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
  if ($m.Success) { $envMap[$m.Groups[1].Value] = $m.Groups[2].Value.Trim().Trim('"').Trim("'") }
}
foreach ($required in @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
  if ([string]::IsNullOrWhiteSpace($envMap[$required])) { throw "Missing $required in local UAT configuration." }
}
$actorsDocument = Get-Content -Raw $ActorsFile | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Split-Path -Parent $ActorsFile }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Invoke-UatRest {
  param([ValidateSet('Get', 'Post')][string]$Method, [string]$Uri, [hashtable]$Headers, [object]$Body = $null)
  $params = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = 45 }
  if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = $Body | ConvertTo-Json -Compress -Depth 10 }
  try { $data = Invoke-RestMethod @params; return [pscustomobject]@{ ok = $true; status = 200; data = $data; error = $null } }
  catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $detail = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return [pscustomobject]@{ ok = $false; status = $status; data = $null; error = $detail }
  }
}
function Get-Token([string]$Key) {
  $actor = $actorsDocument.actors.$Key
  if (-not $actor) { throw "Missing actor $Key." }
  for ($attempt = 0; $attempt -lt 4; $attempt++) {
    $r = Invoke-UatRest -Method Post -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/auth/v1/token?grant_type=password" -Headers @{ apikey = $envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY } -Body @{ email = $actor.email; password = $actorsDocument.password }
    if ($r.ok -and $r.data.access_token) { return $r.data.access_token }
    if ($r.status -ne 429 -or $attempt -eq 3) { throw "Authentication failed for $Key (HTTP $($r.status))." }
    Start-Sleep -Seconds (5 * ($attempt + 1))
  }
}
function Actor-Headers([string]$Key) { return @{ apikey = $envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY; Authorization = "Bearer $(Get-Token $Key)" } }
function Read-Member([string]$Table, [string]$Id, [string]$Actor) {
  return Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/$Table`?select=id&id=eq.$Id" -Headers (Actor-Headers $Actor)
}

$adminHeaders = @{ apikey = $envMap.SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $($envMap.SUPABASE_SERVICE_ROLE_KEY)" }
function Get-MemberFixture([string]$Table, [string]$ScopeField, [string]$ScopeId, [string]$UserId) {
  $row = Invoke-UatRest -Method Get -Uri "$($envMap.NEXT_PUBLIC_SUPABASE_URL)/rest/v1/$Table`?select=id&$ScopeField=eq.$ScopeId&user_id=eq.$UserId&limit=1" -Headers $adminHeaders
  if (-not $row.ok -or @($row.data).Count -ne 1) { throw "Missing fixture in $Table for UAT actor $UserId." }
  return @($row.data)[0].id
}

$a = $actorsDocument.actors
$e = $actorsDocument.entities
$fixture = [ordered]@{
  firmAOffice = Get-MemberFixture 'firm_members' 'firm_id' $e.firmA $a.'firm-a-office_admin'.id
  firmAPartner = Get-MemberFixture 'firm_members' 'firm_id' $e.firmA $a.'firm-a-partner'.id
  firmBOwner = Get-MemberFixture 'firm_members' 'firm_id' $e.firmB $a.'firm-b-owner'.id
  multiFirmA = Get-MemberFixture 'firm_members' 'firm_id' $e.firmA $a.'lawyer-multi-entity'.id
  multiFirmB = Get-MemberFixture 'firm_members' 'firm_id' $e.firmB $a.'lawyer-multi-entity'.id
  businessBLegal = Get-MemberFixture 'business_members' 'business_id' $e.businessB $a.'business-b-legal_manager'.id
  businessBOwner = Get-MemberFixture 'business_members' 'business_id' $e.businessB $a.'business-b-owner'.id
  governmentClerk = Get-MemberFixture 'government_members' 'gov_id' $e.government $a.'government-clerk'.id
  governmentCounsel = Get-MemberFixture 'government_members' 'gov_id' $e.government $a.'government-gov_counsel'.id
  ngoProgram = Get-MemberFixture 'ngo_members' 'ngo_id' $e.ngo $a.'ngo-program_manager'.id
  ngoDirector = Get-MemberFixture 'ngo_members' 'ngo_id' $e.ngo $a.'ngo-director'.id
}

$checks = @()
function Add-Check([string]$Name, [pscustomobject]$Result, [bool]$ExpectedVisible) {
  $visible = $Result.ok -and @($Result.data).Count -eq 1
  # A 5xx/transport failure proves neither a permitted nor a denied RLS path.
  # In particular, a foreign row hidden by a database error is not a pass.
  $script:checks += [ordered]@{ check = $Name; passed = ($Result.ok -and ($visible -eq $ExpectedVisible)); expectedVisible = $ExpectedVisible; actualVisible = $visible; httpStatus = $Result.status; error = $Result.error }
}

Add-Check 'firm A office admin sees own membership' (Read-Member 'firm_members' $fixture.firmAOffice 'firm-a-office_admin') $true
Add-Check 'firm A office admin sees co-member in same firm' (Read-Member 'firm_members' $fixture.firmAPartner 'firm-a-office_admin') $true
Add-Check 'firm B owner cannot read firm A member by direct id' (Read-Member 'firm_members' $fixture.firmAOffice 'firm-b-owner') $false
Add-Check 'multi-entity lawyer sees its firm A membership' (Read-Member 'firm_members' $fixture.multiFirmA 'lawyer-multi-entity') $true
Add-Check 'multi-entity lawyer sees its firm B membership' (Read-Member 'firm_members' $fixture.multiFirmB 'lawyer-multi-entity') $true
Add-Check 'business B legal manager sees same-business owner' (Read-Member 'business_members' $fixture.businessBOwner 'business-b-legal_manager') $true
Add-Check 'business A owner cannot read business B member by direct id' (Read-Member 'business_members' $fixture.businessBLegal 'business-a-owner') $false
Add-Check 'government clerk sees same-government counsel' (Read-Member 'government_members' $fixture.governmentCounsel 'government-clerk') $true
Add-Check 'unrelated client cannot read government member by direct id' (Read-Member 'government_members' $fixture.governmentClerk 'client-a') $false
Add-Check 'NGO program manager sees same-NGO director' (Read-Member 'ngo_members' $fixture.ngoDirector 'ngo-program_manager') $true
Add-Check 'unrelated client cannot read NGO member by direct id' (Read-Member 'ngo_members' $fixture.ngoProgram 'client-a') $false

$passed = @($checks | Where-Object { $_.passed }).Count
$summary = [ordered]@{ format = 'nzamy-uat-entity-membership-rls/v1'; createdAt = (Get-Date).ToUniversalTime().ToString('o'); runId = $actorsDocument.runId; checks = $checks; passed = $passed; failed = ($checks.Count - $passed) }
$resultFile = Join-Path $OutputDirectory 'entity-membership-rls.json'
$summary | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $resultFile -Encoding utf8
$digest = (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{ output = $resultFile; checks = $checks.Count; passed = $passed; failed = ($checks.Count - $passed); sha256 = $digest } | ConvertTo-Json -Compress
