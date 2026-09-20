<#
Creates synthetic, traceable UAT actors in the approved test Supabase project.
It is append-only: it never deletes or alters existing rows.  Every created
record carries metadata.uat_run so the test run can be audited and cleaned up
later by a separate, reviewed process.
#>
[CmdletBinding()]
param(
  [string]$RunId,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

function Read-TestEnvironment {
  $map = @{}
  Get-Content (Join-Path $PSScriptRoot '..\..\.env.local') | ForEach-Object {
    $match = [regex]::Match($_, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
    if ($match.Success) { $map[$match.Groups[1].Value] = $match.Groups[2].Value.Trim().Trim('"').Trim("'") }
  }
  return $map
}

function Invoke-TestRest {
  param([string]$Method, [string]$Path, [object]$Body, [hashtable]$Headers)
  $uri = $script:baseUrl + $Path
  $params = @{ Uri = $uri; Headers = $Headers; Method = $Method; TimeoutSec = 45 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 30 -Compress)
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    $detail = $null
    if ($_.Exception.Response) {
      try {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $detail = $reader.ReadToEnd()
        $reader.Dispose()
      } catch {}
    }
    throw "Test REST request failed: $Method $Path ($status) $detail"
  }
}

function New-TestUser {
  param([string]$Key, [string]$UserType, [hashtable]$Metadata = @{})
  $email = "$Key.$script:runSlug@nzamy.test"
  $meta = @{ uat_run = $script:runId; actor_key = $Key; user_type = $UserType } + $Metadata
  $existing = $script:existingUsers[$email]
  if ($existing) {
    $id = $existing.id
    Invoke-TestRest -Method 'Put' -Path ('/auth/v1/admin/users/' + $id) -Headers $script:authHeaders -Body @{
      password = $script:password; email_confirm = $true; user_metadata = $meta
    } | Out-Null
  } else {
    $created = Invoke-TestRest -Method 'Post' -Path '/auth/v1/admin/users' -Headers $script:authHeaders -Body @{
      email = $email; password = $script:password; email_confirm = $true; user_metadata = $meta
    }
    $id = if ($created.id) { $created.id } elseif ($created.user.id) { $created.user.id } else { throw "Auth creation returned no id for $Key." }
  }
  $profile = @{
    id = $id; user_type = $UserType; display_name = "UAT $Key"; display_name_en = "UAT $Key"
    email = $email; language = 'ar'; onboarding_completed = $true; metadata = @{ uat_run = $script:runId; actor_key = $Key }
  }
  Invoke-TestRest -Method 'Patch' -Path ('/rest/v1/profiles?id=eq.' + $id) -Headers $script:writeHeaders -Body $profile | Out-Null
  return [ordered]@{ key = $Key; id = $id; email = $email; user_type = $UserType; metadata = $meta }
}

function New-TestEntity {
  param([string]$Table, [hashtable]$Row)
  $created = Invoke-TestRest -Method 'Post' -Path "/rest/v1/$Table" -Headers $script:writeHeaders -Body $Row
  if ($created -is [array]) { return $created[0] }
  return $created
}

function Get-OrCreate-TestEntity {
  param([string]$Table, [string]$OwnerUserId, [hashtable]$Row)
  $findPath = '/rest/v1/' + $Table + '?select=*&owner_user_id=eq.' + $OwnerUserId + '&limit=1'
  $existing = @(Invoke-TestRest -Method 'Get' -Path $findPath -Headers $script:authHeaders -Body $null)
  if ($existing.Count -gt 0) { return $existing[0] }
  return New-TestEntity -Table $Table -Row $Row
}

function Add-Member {
  param([string]$Table, [string]$EntityColumn, [string]$EntityId, [object]$Actor, [string]$Role)
  $row = @{
    $EntityColumn = $EntityId; user_id = $Actor.id; role = $Role; status = 'active'
    metadata = @{ uat_run = $script:runId; actor_key = $Actor.key }
  }
  if ($Table -in @('firm_members', 'business_members')) { $row.accepted_at = (Get-Date).ToUniversalTime().ToString('o') }
  $upsertPath = '/rest/v1/' + $Table + '?on_conflict=' + $EntityColumn + ',user_id'
  Invoke-TestRest -Method 'Post' -Path $upsertPath -Headers $script:writeHeaders -Body $row | Out-Null
}

$environment = Read-TestEnvironment
$script:baseUrl = $environment['NEXT_PUBLIC_SUPABASE_URL']
$serviceRoleKey = $environment['SUPABASE_SERVICE_ROLE_KEY']
if ([string]::IsNullOrWhiteSpace($script:baseUrl) -or [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw 'The UAT test database credentials are not available in .env.local.'
}
if ($environment['NEXT_PUBLIC_APP_ENV'] -ne 'development' -or $environment['NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND'] -ne 'supabase') {
  throw 'This seed script only runs against the approved development Supabase test configuration.'
}

if ([string]::IsNullOrWhiteSpace($RunId)) { $RunId = 'uat-' + (Get-Date -Format 'yyyyMMdd-HHmmss') }
$script:runId = $RunId
$script:runSlug = ($RunId -replace '[^a-zA-Z0-9-]', '-').ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Join-Path (Get-Location) "outputs\uat\runs\$RunId" }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 18; $rng.GetBytes($bytes)
$script:password = ('Uat!' + [Convert]::ToBase64String($bytes).Replace('+','A').Replace('/','B').Replace('=','') + '9')
$script:authHeaders = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" }
$script:writeHeaders = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey"; Prefer = 'return=representation,resolution=merge-duplicates' }
$existingResponse = Invoke-TestRest -Method 'Get' -Path '/auth/v1/admin/users?per_page=1000' -Headers $script:authHeaders -Body $null
$script:existingUsers = @{}
foreach ($user in @($existingResponse.users)) {
  if (-not [string]::IsNullOrWhiteSpace($user.email)) { $script:existingUsers[$user.email.ToLowerInvariant()] = $user }
}

$requiredTables = @('profiles','lawyer_profiles','provider_profiles','micro_profiles','firm_profiles','firm_members','business_profiles','business_members','government_profiles','government_members','ngo_profiles','ngo_members')
foreach ($table in $requiredTables) {
  $readPath = '/rest/v1/' + $table + '?select=*&limit=0'
  try { Invoke-TestRest -Method 'Get' -Path $readPath -Headers $script:authHeaders -Body $null | Out-Null }
  catch { throw "Required UAT table '$table' is not available. No actors were created." }
}

$actors = [ordered]@{}
function Add-Actor {
  param([string]$Key, [string]$UserType, [hashtable]$Metadata = @{})
  $actors[$Key] = New-TestUser -Key $Key -UserType $UserType -Metadata $Metadata
}

# Primary accounts and the two competing tenant owners.
Add-Actor 'client-a' 'individual'
Add-Actor 'client-b' 'individual'
Add-Actor 'lawyer-solo' 'lawyer'
Add-Actor 'firm-a-owner' 'firm'
Add-Actor 'firm-b-owner' 'firm'
Add-Actor 'business-a-owner' 'corporate'
Add-Actor 'business-b-owner' 'corporate'
Add-Actor 'micro-owner' 'micro'
Add-Actor 'admin' 'admin'

# Provider specialties, all explicitly represented in provider_profiles.
foreach ($role in @('notary','arbitrator','bailiff')) { Add-Actor "provider-$role" 'provider' @{ provider_sub_role = $role } }

# One actor for every firm role. The multi-entity lawyer is also a member of firm B.
$firmRoles = @('managing_partner','partner','senior_lawyer','lawyer','trainee','legal_secretary','office_admin','finance_manager','hr_manager','compliance_manager','external_of_counsel','legal_consultant','in_house_counsel')
foreach ($role in $firmRoles) { Add-Actor "firm-a-$role" 'lawyer' @{ firm_role = $role } }
Add-Actor 'lawyer-multi-entity' 'lawyer' @{ firm_role = 'senior_lawyer'; multi_entity = $true }

# One actor for every business role.
$businessRoles = @('owner','legal_manager','legal_staff','compliance_officer','seconded','department_head','hr_manager','finance_manager','employee')
foreach ($role in $businessRoles) { Add-Actor "business-b-$role" 'corporate' @{ business_role = $role } }

# Government UI exposes these four roles; the two additional database roles are retained for RLS coverage.
$governmentRoles = @('judge','prosecutor','officer','gov_counsel','clerk','admin')
foreach ($role in $governmentRoles) { Add-Actor "government-$role" 'government' @{ government_role = $role } }

# NGO membership roles are seeded even though the product may not yet resolve all of them in the UI.
$ngoRoles = @('director','board_member','legal_advisor','program_manager','volunteer_coordinator','admin','volunteer')
foreach ($role in $ngoRoles) { Add-Actor "ngo-$role" 'ngo' @{ ngo_role = $role } }

# Role-specific profiles.
Invoke-TestRest -Method 'Post' -Path '/rest/v1/lawyer_profiles?on_conflict=user_id' -Headers $script:writeHeaders -Body @{ user_id = $actors['lawyer-solo'].id; license_number = "UAT-$script:runSlug-SOLO"; is_accepting_clients = $true } | Out-Null
foreach ($role in $firmRoles + @('lawyer-multi-entity')) {
  $key = if ($role -eq 'lawyer-multi-entity') { $role } else { "firm-a-$role" }
  Invoke-TestRest -Method 'Post' -Path '/rest/v1/lawyer_profiles?on_conflict=user_id' -Headers $script:writeHeaders -Body @{ user_id = $actors[$key].id; license_number = "UAT-$script:runSlug-$key"; is_accepting_clients = $true } | Out-Null
}
foreach ($role in @('notary','arbitrator','bailiff')) {
  Invoke-TestRest -Method 'Post' -Path '/rest/v1/provider_profiles?on_conflict=user_id' -Headers $script:writeHeaders -Body @{ user_id = $actors["provider-$role"].id; sub_role = $role; verification_status = 'verified'; marketplace_visible = $true; metadata = @{ uat_run = $script:runId } } | Out-Null
}
Invoke-TestRest -Method 'Post' -Path '/rest/v1/micro_profiles?on_conflict=user_id' -Headers $script:writeHeaders -Body @{ user_id = $actors['micro-owner'].id; business_name = "UAT Micro $script:runId"; business_type = 'retail' } | Out-Null

# Two firms and their memberships provide the cross-tenant test boundary.
$firmA = Get-OrCreate-TestEntity 'firm_profiles' $actors['firm-a-owner'].id @{ owner_user_id = $actors['firm-a-owner'].id; name_ar = "UAT Firm A $script:runId"; verification_status = 'verified'; structure = 'multi_branch'; branches = @(@{ id = 'uat-a-main'; name = 'UAT Firm A Main Branch' }, @{ id = 'uat-a-east'; name = 'UAT Firm A East Branch' }); metadata = @{ uat_run = $script:runId } }
$firmB = Get-OrCreate-TestEntity 'firm_profiles' $actors['firm-b-owner'].id @{ owner_user_id = $actors['firm-b-owner'].id; name_ar = "UAT Firm B $script:runId"; verification_status = 'verified'; metadata = @{ uat_run = $script:runId } }
Add-Member 'firm_members' 'firm_id' $firmA.id $actors['firm-a-owner'] 'managing_partner'
foreach ($role in $firmRoles) { Add-Member 'firm_members' 'firm_id' $firmA.id $actors["firm-a-$role"] $role }
Add-Member 'firm_members' 'firm_id' $firmA.id $actors['lawyer-multi-entity'] 'senior_lawyer'
Add-Member 'firm_members' 'firm_id' $firmB.id $actors['firm-b-owner'] 'managing_partner'
Add-Member 'firm_members' 'firm_id' $firmB.id $actors['lawyer-multi-entity'] 'senior_lawyer'

# Company A deliberately has no legal department; Company B has the complete internal role set.
$businessA = Get-OrCreate-TestEntity 'business_profiles' $actors['business-a-owner'].id @{ owner_user_id = $actors['business-a-owner'].id; company_name_ar = "UAT Business A $script:runId"; cr_number = '7000000001'; has_legal_dept = $false; service_model = 'external'; verification_status = 'verified'; metadata = @{ uat_run = $script:runId } }
$businessB = Get-OrCreate-TestEntity 'business_profiles' $actors['business-b-owner'].id @{ owner_user_id = $actors['business-b-owner'].id; company_name_ar = "UAT Business B $script:runId"; cr_number = '7000000002'; has_legal_dept = $true; service_model = 'internal'; verification_status = 'verified'; metadata = @{ uat_run = $script:runId } }
Add-Member 'business_members' 'business_id' $businessA.id $actors['business-a-owner'] 'owner'
Add-Member 'business_members' 'business_id' $businessB.id $actors['business-b-owner'] 'owner'
foreach ($role in $businessRoles) { Add-Member 'business_members' 'business_id' $businessB.id $actors["business-b-$role"] $role }
Add-Member 'business_members' 'business_id' $businessB.id $actors['lawyer-multi-entity'] 'seconded'

$government = Get-OrCreate-TestEntity 'government_profiles' $actors['government-gov_counsel'].id @{ owner_user_id = $actors['government-gov_counsel'].id; entity_name_ar = "UAT Government $script:runId"; entity_type = 'authority'; role = 'counsel'; verification_status = 'verified'; metadata = @{ uat_run = $script:runId } }
foreach ($role in $governmentRoles) {
  $databaseRole = if ($role -eq 'gov_counsel') { 'counsel' } elseif ($role -eq 'admin') { 'admin' } else { $role }
  Add-Member 'government_members' 'gov_id' $government.id $actors["government-$role"] $databaseRole
}

$ngo = Get-OrCreate-TestEntity 'ngo_profiles' $actors['ngo-director'].id @{ owner_user_id = $actors['ngo-director'].id; org_name_ar = "UAT NGO $script:runId"; org_type = 'association'; compliance_status = 'compliant'; verification_status = 'verified'; metadata = @{ uat_run = $script:runId } }
foreach ($role in $ngoRoles) { Add-Member 'ngo_members' 'ngo_id' $ngo.id $actors["ngo-$role"] $role }

$result = [ordered]@{
  format = 'nzamy-uat-actors/v1'; runId = $script:runId; createdAt = (Get-Date).ToUniversalTime().ToString('o')
  password = $script:password; actors = $actors
  entities = [ordered]@{ firmA = $firmA.id; firmB = $firmB.id; businessA = $businessA.id; businessB = $businessB.id; government = $government.id; ngo = $ngo.id }
}
$actorFile = Join-Path $OutputDirectory 'actors.json'
$result | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $actorFile -Encoding utf8
$hash = (Get-FileHash -LiteralPath $actorFile -Algorithm SHA256).Hash
[ordered]@{ runId = $script:runId; output = $OutputDirectory; actorCount = $actors.Count; actorFileSha256 = $hash } | ConvertTo-Json -Compress
