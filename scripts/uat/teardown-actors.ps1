<#
Deletes every synthetic UAT actor (and everything hanging off it) from the
configured Supabase project. DRY RUN by default: it only SELECTs and prints
per-table counts plus the first 20 ids. Pass -Execute to actually delete.

Selection: auth.users whose email ends "@nzamy.test" OR whose
user_metadata.uat_run is set. The seed script (seed-actors.ps1) ADOPTS
trigger-created entity rows (firm_profiles / business_profiles / ... created
by handle_new_user and the 20260914 owner-membership trigger), so those
entity rows carry no uat tag of their own -- this script derives the
"synthetic entity set" from owner_user_id membership in the synthetic user
set instead of trusting a tag on the entity row itself.

Cascade audit (read supabase/migrations/20260603_phase1_00{1,2,3}.sql,
20260518_client_workflow_backend_ready.sql, 20260903_phase1_case_tables.sql,
20260903_phase2_clients_and_firm_membership.sql,
20260904_phase5_deadline_radar.sql,
20260905_phase3_consultations_and_contracts.sql,
20260906_court_costs_and_firm_profile_fields.sql,
20260628_documents_upload.sql, 20260706_content_and_ops.sql,
20260910_case_notes.sql):

  auth.users -> profiles                         ON DELETE CASCADE
  profiles   -> lawyer/provider/micro_profiles    ON DELETE CASCADE (user_id)
  profiles   -> firm/business/government/ngo_profiles ON DELETE CASCADE (owner_user_id)
  those      -> *_members                         ON DELETE CASCADE (entity_id AND user_id)
  profiles   -> subscriptions, credit_transactions, coupon_usage, promo_links,
                escrow_transactions, community_posts/answers/votes, groups
                (+ group_members/invitations), research_sessions (+ items),
                law_draft_carts, user_settings, chat_participants,
                chat_messages, team_invitations, marketplace_listings
                (+ offers/workspaces), case_collaborators, case_share_tokens,
                secondment_contracts (+ time_entries), referrals (referrer
                side), reviews (both sides), document_shares (owner),
                lawyer_clients (owner_user_id), deadline_rules, deadlines,
                notification_outbox, hearings, tasks (+ task_steps),
                case_graphs, wallet_transactions, notifications  ON DELETE CASCADE

  So deleting the auth user alone cascades essentially everything above.
  It does NOT cascade the tables below -- their FK is ON DELETE SET NULL (or,
  for court_cost_notices/case_disbursements -> cases, ON DELETE RESTRICT,
  which would make a bare `cases` delete FAIL until those are removed first).
  This script deletes these explicitly, children before parents, BEFORE
  deleting the auth users (deleting the user first would null out the
  identifying FK and turn these into unreachable orphans -- the exact bug
  this teardown exists to fix):

    court_cost_notices, case_disbursements  (case_id -> cases: RESTRICT)
    cases                                   (client_user_id / assigned_user_id: SET NULL;
                                              request_id -> service_requests: SET NULL --
                                              NOTE: public.cases has zero INSERT/UPDATE
                                              call sites per 20260903_phase1_case_tables.sql's
                                              own audit, so this section is expected to
                                              always read 0 in practice; kept for when that
                                              changes)
    contracts                               (client_user_id / owner_user_id -- renamed from
                                              assigned_user_id by 20260905_phase3_consultations
                                              _and_contracts.sql:314, verified the rename is
                                              unconditional post-migration -- / firm_id: all
                                              SET NULL; request_id -> service_requests: SET NULL)
    service_requests                        (requester_user_id: SET NULL; business_id /
                                              firm_id -> business_profiles/firm_profiles: SET NULL)
    support_tickets                         (user_id: SET NULL)
    invitations                             (inviter_id / accepted_by: SET NULL)
    lawyer_clients                          (also cascades via owner_user_id, but is
                                              deleted explicitly too so the dry-run
                                              count is meaningful on its own)

  Deleting `service_requests` cascades (case_request_id / request_id ->
  service_requests: CASCADE): request_events, payments, attachments,
  consultations (+ consultation_notes), messages, case_stages, hearings,
  tasks (+ task_steps), activity_events, case_graphs, case_notes, deadlines
  (+ notification_outbox). Deleting `contracts` cascades contract_versions,
  contract_parties, contract_obligations, contract_payments, and any
  deadlines.contract_id row.

  ONE column in the whole schema is neither CASCADE, SET NULL, nor RESTRICT:
  `entitlement_requests.decided_by uuid references auth.users(id)` (no ON
  DELETE clause at all -- 20260706_entitlement_requests.sql:16), i.e. ON
  DELETE NO ACTION. If a synthetic admin ever approved/rejected an
  entitlement_requests row (own or someone else's -- `user_id` is a separate,
  CASCADE column and needs no handling), deleting that admin's auth user
  fails outright with a 23503 and the account survives the run. Verified by
  sweeping every `references auth.users(id)` and `references public.profiles`
  FK across supabase/migrations/*.sql on 2026-09-22 for a missing ON DELETE
  clause: `decided_by` is the only hit. This script PATCHes it to NULL
  (never deletes the row -- the requester may be a real user) before the
  auth-user delete step below.

  Storage objects under documents/<uid>/... are NOT database rows and do not
  cascade from anything -- they are deleted explicitly via the Storage API.

  Known, accepted gap: `chat_rooms` has no owner column (only request_id /
  case_id, both ON DELETE SET NULL) and is not in the review's explicit
  table list, so a synthetic chat room can outlive its participants as an
  empty, unlinked row. Not handled here.
#>

[CmdletBinding()]
param(
  [switch]$Execute,
  [switch]$IUnderstandThisIsProduction,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_env.ps1')

# Selecting who is synthetic is itself sensitive enough to gate like a writer:
# a misconfigured allow-list must not let this script quietly enumerate (let
# alone delete) production data. This applies -AllowWrites even for a dry run;
# against the hard-coded production ref it additionally needs the caller to
# pass -IUnderstandThisIsProduction AND set NZAMY_UAT_ALLOW_PRODUCTION=1 (see
# _env.ps1). -Execute is the separate, second gate that turns the capture
# pass below into real DELETEs instead of just printing counts.
$uatEnv = Assert-UatProject -AllowWrites -IUnderstandThisIsProduction:$IUnderstandThisIsProduction
$baseUrl = $uatEnv.Url
$serviceRoleKey = $uatEnv.ServiceKey
$adminHeaders = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" }
$writeHeaders = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey"; Prefer = 'return=representation' }

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
  # Anchored to the repo root (two levels above scripts/uat), not the caller's CWD --
  # running this as `./teardown-actors.ps1` from inside scripts/uat must still land the
  # summary at the repo-root outputs/uat/runs/, not scripts/uat/outputs/uat/runs/.
  $OutputDirectory = Join-Path $PSScriptRoot "..\..\outputs\uat\runs\teardown-$stamp"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Invoke-UatRest {
  param(
    [ValidateSet('Get', 'Post', 'Patch', 'Delete')][string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body = $null
  )
  $params = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = 60 }
  if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = ($Body | ConvertTo-Json -Compress -Depth 10) }
  for ($attempt = 0; $attempt -lt 4; $attempt++) {
    try {
      $data = Invoke-RestMethod @params
      return [pscustomobject]@{ ok = $true; status = 200; data = $data; error = $null }
    } catch {
      $status = if ($_.Exception.Response) { try { [int]$_.Exception.Response.StatusCode } catch { $null } } else { $null }
      $detail = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
      if ($status -ne 429 -or $attempt -eq 3) { return [pscustomobject]@{ ok = $false; status = $status; data = $null; error = $detail } }
      Start-Sleep -Seconds (3 * ($attempt + 1))
    }
  }
}

# PostgREST .in() has a practical URL-length ceiling well below what 146+ synthetic
# rows could hit on a bigger run (this codebase has already hit a ~396 UUID wall
# elsewhere) -- chunk every .in() filter defensively.
$script:InChunkSize = 150

function Split-Chunks {
  param([array]$Items, [int]$Size = $script:InChunkSize)
  $chunks = @()
  for ($i = 0; $i -lt $Items.Count; $i += $Size) {
    $chunks += , @($Items[$i..([Math]::Min($i + $Size, $Items.Count) - 1)])
  }
  # `return $chunks` alone would unroll this array-of-arrays by one level once it
  # crosses the function boundary (a classic PowerShell footgun), silently handing
  # the caller a flat list of ids instead of a list of chunks. `, $chunks` prevents it.
  return , $chunks
}

function ConvertTo-PgArrayLiteral {
  param([array]$Ids)
  # Ids here are always UUIDs or our own text primary keys (never user input),
  # so a plain comma-join is safe for a PostgREST `in.(...)` filter.
  return '(' + ($Ids -join ',') + ')'
}

# Selects `$SelectCols` from $Table where $Column is in $Ids, chunked. Returns a
# flat array of rows (each a PSCustomObject). $Ids may be empty -> returns @().
function Select-ByIn {
  param([string]$Table, [string]$SelectCols, [string]$Column, [array]$Ids)
  $rows = @()
  if (-not $Ids -or $Ids.Count -eq 0) { return , $rows }
  foreach ($chunk in (Split-Chunks -Items $Ids)) {
    $uri = "$baseUrl/rest/v1/$Table`?select=$SelectCols&$Column=in.$(ConvertTo-PgArrayLiteral $chunk)&limit=10000"
    $result = Invoke-UatRest -Method Get -Uri $uri -Headers $adminHeaders
    if (-not $result.ok) { throw "Could not read $Table by $Column (HTTP $($result.status)): $($result.error)" }
    $rows += @($result.data)
  }
  # Same unroll hazard as Split-Chunks: a 1-row result would otherwise be handed
  # to the caller as a bare object instead of a 1-element array.
  return , $rows
}

# Same as Select-ByIn but ORs several (Column, Ids) pairs together (deduplicated
# by `IdField`), used for the multi-condition matches the review specifies
# (e.g. cases by client_user_id OR assigned_user_id OR request_id).
function Select-ByAnyIn {
  param([string]$Table, [string]$SelectCols, [string]$IdField, [array]$Conditions)
  $seen = @{}
  $rows = @()
  foreach ($cond in $Conditions) {
    foreach ($row in (Select-ByIn -Table $Table -SelectCols $SelectCols -Column $cond.Column -Ids $cond.Ids)) {
      $key = [string]$row.$IdField
      if (-not $seen.ContainsKey($key)) { $seen[$key] = $true; $rows += $row }
    }
  }
  return , $rows
}

function Remove-ByIds {
  param([string]$Table, [string]$Column, [array]$Ids)
  $deleted = 0
  $errors = @()
  foreach ($chunk in (Split-Chunks -Items $Ids)) {
    if ($chunk.Count -eq 0) { continue }
    $uri = "$baseUrl/rest/v1/$Table`?$Column=in.$(ConvertTo-PgArrayLiteral $chunk)"
    $result = Invoke-UatRest -Method Delete -Uri $uri -Headers $writeHeaders
    # $writeHeaders sends `Prefer: return=representation`, so count what PostgREST says it
    # actually matched/deleted, not the chunk size -- a chunk with a row already gone
    # (e.g. cascaded away by an earlier delete) still matches zero rows, not $chunk.Count.
    if ($result.ok) { $deleted += @($result.data).Count } else { $errors += "HTTP $($result.status): $($result.error)" }
  }
  return [ordered]@{ table = $Table; attempted = $Ids.Count; deleted = $deleted; errors = $errors }
}

# PATCH-clears $Column to null on rows where it matches $Ids -- used only for
# entitlement_requests.decided_by, which has no ON DELETE clause at all (see header
# comment) and so must be nulled BEFORE the referenced auth user can be deleted. Never
# deletes rows: the row's other side (the requester) may belong to a real user.
function Clear-ColumnByIds {
  param([string]$Table, [string]$Column, [array]$Ids)
  $cleared = 0
  $errors = @()
  foreach ($chunk in (Split-Chunks -Items $Ids)) {
    if ($chunk.Count -eq 0) { continue }
    $uri = "$baseUrl/rest/v1/$Table`?$Column=in.$(ConvertTo-PgArrayLiteral $chunk)"
    $result = Invoke-UatRest -Method Patch -Uri $uri -Headers $writeHeaders -Body @{ $Column = $null }
    if ($result.ok) { $cleared += @($result.data).Count } else { $errors += "HTTP $($result.status): $($result.error)" }
  }
  return [ordered]@{ table = "$Table.$Column"; attempted = $Ids.Count; deleted = $cleared; errors = $errors }
}

# --- 1. Selection: synthetic auth users -------------------------------------

function Get-SyntheticUsers {
  $users = @()
  $page = 1
  while ($true) {
    $result = Invoke-UatRest -Method Get -Uri "$baseUrl/auth/v1/admin/users?page=$page&per_page=1000" -Headers $adminHeaders
    if (-not $result.ok) { throw "Could not list auth users (HTTP $($result.status)): $($result.error)" }
    $pageUsers = @($result.data.users)
    if ($pageUsers.Count -eq 0) { break }
    foreach ($u in $pageUsers) {
      $isTestEmail = $u.email -and $u.email.ToLowerInvariant().EndsWith('@nzamy.test')
      $hasUatRun = $u.user_metadata -and $u.user_metadata.uat_run
      if ($isTestEmail -or $hasUatRun) { $users += $u }
    }
    # Only the `-eq 0` check above may terminate the loop. GoTrue is not guaranteed to
    # honour `per_page=1000` exactly -- a deployment that clamps the page size would
    # return fewer than 1000 rows on page 1 and stop here, silently tearing down (or
    # reporting) a subset of the synthetic accounts while claiming full coverage.
    $page++
  }
  return , $users
}

Write-Host "Listing auth users on '$($uatEnv.ProjectRef)' ..."
$syntheticUsers = Get-SyntheticUsers
$userIds = @($syntheticUsers | ForEach-Object { $_.id })
Write-Host "Found $($userIds.Count) synthetic auth user(s)."

if ($userIds.Count -eq 0) {
  Write-Host 'Nothing to tear down.'
  [ordered]@{ format = 'nzamy-uat-teardown/v1'; createdAt = (Get-Date).ToUniversalTime().ToString('o'); execute = [bool]$Execute; syntheticUsers = 0 } |
    ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'teardown-summary.json') -Encoding utf8
  return
}

# --- 2. Derive the synthetic entity set (owner_user_id membership) ---------

$firmIds        = @((Select-ByIn -Table 'firm_profiles'       -SelectCols 'id' -Column 'owner_user_id' -Ids $userIds) | ForEach-Object { $_.id })
$businessIds    = @((Select-ByIn -Table 'business_profiles'   -SelectCols 'id' -Column 'owner_user_id' -Ids $userIds) | ForEach-Object { $_.id })
$governmentIds  = @((Select-ByIn -Table 'government_profiles' -SelectCols 'id' -Column 'owner_user_id' -Ids $userIds) | ForEach-Object { $_.id })
$ngoIds         = @((Select-ByIn -Table 'ngo_profiles'        -SelectCols 'id' -Column 'owner_user_id' -Ids $userIds) | ForEach-Object { $_.id })

# --- 3. Capture every non-cascading dependent id BEFORE anything is deleted -

$serviceRequestRows = Select-ByAnyIn -Table 'service_requests' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'requester_user_id'; Ids = $userIds }
  @{ Column = 'business_id';       Ids = $businessIds }
  @{ Column = 'firm_id';           Ids = $firmIds }
)
$serviceRequestIds = @($serviceRequestRows | ForEach-Object { $_.id })

$caseRows = Select-ByAnyIn -Table 'cases' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'client_user_id';   Ids = $userIds }
  @{ Column = 'assigned_user_id'; Ids = $userIds }
  @{ Column = 'request_id';       Ids = $serviceRequestIds }
)
$caseIds = @($caseRows | ForEach-Object { $_.id })

# `assigned_user_id` was RENAMED to `owner_user_id` by
# 20260905_phase3_consultations_and_contracts.sql:314 (unconditional post-migration --
# the column no longer exists at all). Querying the old name 400s and aborts this
# script before it ever reaches the delete phase. `firm_id` (added :329) is a second,
# independent way a synthetic firm's contract can lack any synthetic *_user_id.
$contractRows = Select-ByAnyIn -Table 'contracts' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'client_user_id'; Ids = $userIds }
  @{ Column = 'owner_user_id';  Ids = $userIds }
  @{ Column = 'firm_id';        Ids = $firmIds }
  @{ Column = 'request_id';     Ids = $serviceRequestIds }
)
$contractIds = @($contractRows | ForEach-Object { $_.id })

$lawyerClientRows = Select-ByAnyIn -Table 'lawyer_clients' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'owner_user_id';  Ids = $userIds }
  @{ Column = 'client_user_id'; Ids = $userIds }
)
$lawyerClientIds = @($lawyerClientRows | ForEach-Object { $_.id })

$supportTicketRows = Select-ByIn -Table 'support_tickets' -SelectCols 'id' -Column 'user_id' -Ids $userIds
$supportTicketIds = @($supportTicketRows | ForEach-Object { $_.id })

$invitationRows = Select-ByAnyIn -Table 'invitations' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'inviter_id';   Ids = $userIds }
  @{ Column = 'accepted_by';  Ids = $userIds }
)
$invitationIds = @($invitationRows | ForEach-Object { $_.id })

# entitlement_requests.decided_by -> auth.users has NO on-delete clause at all (NO
# ACTION -- see header comment). `user_id` (the requester) is a separate, CASCADE
# column that needs no handling here. These rows are never deleted, only PATCHed to
# decided_by=null, because the requester side may belong to a real, non-synthetic user.
$entitlementDecisionRows = Select-ByIn -Table 'entitlement_requests' -SelectCols 'id' -Column 'decided_by' -Ids $userIds
$entitlementDecisionIds = @($entitlementDecisionRows | ForEach-Object { $_.id })

# court_cost_notices / case_disbursements reference `cases` ON DELETE RESTRICT:
# capture by case_id (of the cases above), by request_id, and by their own
# user columns, so a synthetic notice on a not-yet-captured case is still found.
$courtCostNoticeRows = Select-ByAnyIn -Table 'court_cost_notices' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'case_id';     Ids = $caseIds }
  @{ Column = 'request_id';  Ids = $serviceRequestIds }
  @{ Column = 'created_by';  Ids = $userIds }
)
$courtCostNoticeIds = @($courtCostNoticeRows | ForEach-Object { $_.id })

$caseDisbursementRows = Select-ByAnyIn -Table 'case_disbursements' -SelectCols 'id' -IdField 'id' -Conditions @(
  @{ Column = 'case_id';          Ids = $caseIds }
  @{ Column = 'request_id';       Ids = $serviceRequestIds }
  @{ Column = 'client_user_id';   Ids = $userIds }
  @{ Column = 'created_by';       Ids = $userIds }
)
$caseDisbursementIds = @($caseDisbursementRows | ForEach-Object { $_.id })

# --- 4. Storage objects under documents/<uid>/... (not a DB row; not cascaded) -

function Get-StorageObjectsForUser {
  param([string]$UserId, [int]$MaxDepth = 6)
  $found = @()
  # A real Queue, not a PowerShell array sliced with `[1..($queue.Count-1)]`:
  # that slice silently returns the array UNCHANGED (not empty) once exactly one
  # item is left, because `1..0` is a valid descending range in PowerShell --
  # which would never let this loop drain and would hang forever.
  $queue = [System.Collections.Generic.Queue[object]]::new()
  $queue.Enqueue(@{ prefix = "$UserId/"; depth = 0 })
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if ($current.depth -gt $MaxDepth) { continue }
    $listBody = @{ prefix = $current.prefix; limit = 1000; offset = 0; sortBy = @{ column = 'name'; order = 'asc' } }
    $result = Invoke-UatRest -Method Post -Uri "$baseUrl/storage/v1/object/list/documents" -Headers $adminHeaders -Body $listBody
    if (-not $result.ok) { continue }
    foreach ($entry in @($result.data)) {
      $entryPath = $current.prefix + $entry.name
      if ($null -eq $entry.id -and $null -eq $entry.metadata) {
        # No object id/metadata -> this entry is a "folder" placeholder; recurse into it.
        $queue.Enqueue(@{ prefix = "$entryPath/"; depth = $current.depth + 1 })
      } else {
        $found += $entryPath
      }
    }
  }
  return , $found
}

Write-Host 'Listing synthetic storage objects (documents bucket) ...'
$storagePaths = @()
foreach ($uid in $userIds) { $storagePaths += Get-StorageObjectsForUser -UserId $uid }
Write-Host "Found $($storagePaths.Count) synthetic storage object(s)."

# --- 5. Dry-run summary -------------------------------------------------------

function Show-Section {
  param([string]$Name, [array]$Ids)
  $sample = @($Ids | Select-Object -First 20)
  Write-Host ("{0,-24} count={1,-6} sample={2}" -f $Name, $Ids.Count, ($sample -join ', '))
  return [ordered]@{ count = $Ids.Count; sample = $sample }
}

Write-Host ''
Write-Host '=== Dry-run summary (nothing deleted unless -Execute) ==='
$summarySections = [ordered]@{
  auth_users          = Show-Section 'auth_users'          $userIds
  firm_profiles       = Show-Section 'firm_profiles'       $firmIds
  business_profiles   = Show-Section 'business_profiles'   $businessIds
  government_profiles = Show-Section 'government_profiles' $governmentIds
  ngo_profiles        = Show-Section 'ngo_profiles'        $ngoIds
  service_requests    = Show-Section 'service_requests'    $serviceRequestIds
  cases               = Show-Section 'cases'               $caseIds
  contracts           = Show-Section 'contracts'           $contractIds
  lawyer_clients      = Show-Section 'lawyer_clients'      $lawyerClientIds
  support_tickets     = Show-Section 'support_tickets'     $supportTicketIds
  invitations         = Show-Section 'invitations'         $invitationIds
  entitlement_requests_decided = Show-Section 'entitlement_requests_decided' $entitlementDecisionIds
  court_cost_notices  = Show-Section 'court_cost_notices'  $courtCostNoticeIds
  case_disbursements  = Show-Section 'case_disbursements'  $caseDisbursementIds
  storage_objects     = Show-Section 'storage_objects'     $storagePaths
}
Write-Host ''
Write-Host '(entitlement_requests_decided rows are PATCHed to decided_by=null, never deleted --'
Write-Host ' the requester side, a separate CASCADE column, may belong to a real user.)'
Write-Host ''
Write-Host 'Rows not listed above (request_events, payments, attachments, consultations,'
Write-Host 'consultation_notes, messages, case_stages, hearings, tasks, task_steps,'
Write-Host 'activity_events, case_graphs, case_notes, deadlines, notification_outbox,'
Write-Host 'contract_versions/parties/obligations/payments, subscriptions,'
Write-Host 'credit_transactions, user_settings, research_sessions/items, chat rows,'
Write-Host 'reviews, document_shares, lawyer_client_notes, ...) cascade automatically'
Write-Host 'from the tables above or from the auth user delete -- see the header comment.'

$results = @()
if ($Execute) {
  Write-Host ''
  Write-Host '=== Executing deletes (children before parents) ===' -ForegroundColor Yellow

  $results += Remove-ByIds -Table 'court_cost_notices' -Column 'id' -Ids $courtCostNoticeIds
  $results += Remove-ByIds -Table 'case_disbursements' -Column 'id' -Ids $caseDisbursementIds

  $storageDeleted = 0
  $storageErrors = @()
  foreach ($chunk in (Split-Chunks -Items $storagePaths -Size 100)) {
    if ($chunk.Count -eq 0) { continue }
    $result = Invoke-UatRest -Method Delete -Uri "$baseUrl/storage/v1/object/documents" -Headers $adminHeaders -Body @{ prefixes = $chunk }
    if ($result.ok) { $storageDeleted += $chunk.Count } else { $storageErrors += "HTTP $($result.status): $($result.error)" }
  }
  $results += [ordered]@{ table = 'storage:documents'; attempted = $storagePaths.Count; deleted = $storageDeleted; errors = $storageErrors }

  $results += Remove-ByIds -Table 'contracts'          -Column 'id' -Ids $contractIds
  $results += Remove-ByIds -Table 'cases'               -Column 'id' -Ids $caseIds
  $results += Remove-ByIds -Table 'service_requests'    -Column 'id' -Ids $serviceRequestIds
  $results += Remove-ByIds -Table 'lawyer_clients'      -Column 'id' -Ids $lawyerClientIds
  $results += Remove-ByIds -Table 'support_tickets'     -Column 'id' -Ids $supportTicketIds
  $results += Remove-ByIds -Table 'invitations'         -Column 'id' -Ids $invitationIds

  # MUST run before the auth-user delete loop below: entitlement_requests.decided_by has
  # no ON DELETE clause at all (NO ACTION -- see header comment), so a synthetic admin who
  # approved/rejected any request, own or not, would otherwise make that user's DELETE
  # fail with a 23503 and leave the account alive.
  $results += Clear-ColumnByIds -Table 'entitlement_requests' -Column 'decided_by' -Ids $userIds

  Write-Host 'Deleting synthetic auth users (cascades profiles and everything owned by them) ...'
  $authDeleted = 0
  $authErrors = @()
  foreach ($uid in $userIds) {
    $result = Invoke-UatRest -Method Delete -Uri "$baseUrl/auth/v1/admin/users/$uid" -Headers $adminHeaders
    if ($result.ok -or $result.status -eq 404) { $authDeleted++ } else { $authErrors += "user $uid`: HTTP $($result.status): $($result.error)" }
  }
  $results += [ordered]@{ table = 'auth.users'; attempted = $userIds.Count; deleted = $authDeleted; errors = $authErrors }

  foreach ($r in $results) {
    $errCount = @($r.errors).Count
    $status = if ($errCount -gt 0) { "FAILED ($errCount error(s))" } else { 'ok' }
    Write-Host ("  {0,-22} attempted={1,-6} deleted={2,-6} {3}" -f $r.table, $r.attempted, $r.deleted, $status)
  }
} else {
  Write-Host ''
  Write-Host 'Dry run only. Review the counts above, then re-run with -Execute to delete.' -ForegroundColor Yellow
}

$summary = [ordered]@{
  format    = 'nzamy-uat-teardown/v1'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  projectRef = $uatEnv.ProjectRef
  execute   = [bool]$Execute
  sections  = $summarySections
  deletes   = $results
}
$summaryFile = Join-Path $OutputDirectory 'teardown-summary.json'
$summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $summaryFile -Encoding utf8
Write-Host ''
Write-Host "Summary written to $summaryFile"
