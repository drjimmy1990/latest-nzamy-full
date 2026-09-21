<#
Shared UAT environment guard. Dot-sourced by every scripts/uat/*.ps1 script.
It replaces each script's private .env.local parsing and adds one thing none
of them had: a project allow-list, plus a hard deny-list for production that
a write cannot cross by accident.

Exposes:
  Get-UatEnv         -> parses the file named by $env:NZAMY_UAT_ENV_FILE, or
                         ..\..\.env.local next to this file, and returns an
                         object with Url / AnonKey / ServiceKey / ProjectRef /
                         EnvFile / RawMap (the full parsed key=value map, for
                         scripts that read other integration settings).
  Assert-UatProject  -> calls Get-UatEnv, then refuses to continue unless the
                         resolved ProjectRef is on the NZAMY_UAT_PROJECT_REFS
                         allow-list (comma-separated project refs). Returns
                         the same object Get-UatEnv returns on success.

                         -AllowWrites additionally refuses when ProjectRef is
                         the hard-coded production ref, UNLESS the caller both
                         passes -IUnderstandThisIsProduction and the
                         environment has NZAMY_UAT_ALLOW_PRODUCTION=1 -- in
                         which case it prints a red banner and continues.
                         Read-only scripts call this WITHOUT -AllowWrites but
                         still need the allow-list entry.

Every refusal below writes to stderr directly (not Write-Error) and then
calls `exit 3`, so the exit code is always 3 regardless of a calling script's
own $ErrorActionPreference -- Write-Error would otherwise become a
terminating error under 'Stop' and short-circuit before the exit statement.
#>

# A true constant, not a plain variable a caller could reassign before calling
# Assert-UatProject to defeat the deny-list. Guarded so re-dot-sourcing this file in the
# same session/runspace (e.g. a test harness) does not error trying to redeclare it.
if (-not (Get-Variable -Name NzamyProductionProjectRef -Scope Script -ErrorAction SilentlyContinue)) {
  Set-Variable -Name NzamyProductionProjectRef -Scope Script -Option Constant -Value 'gdqfqfcxnwrwgaphtfhu'
}

function Write-UatGuardError {
  param([Parameter(Mandatory = $true)][string]$Message)
  try { $Host.UI.WriteErrorLine($Message) } catch { [Console]::Error.WriteLine($Message) }
}

function Get-UatEnv {
  [CmdletBinding()]
  param()

  $envFile = $env:NZAMY_UAT_ENV_FILE
  if ([string]::IsNullOrWhiteSpace($envFile)) {
    $envFile = Join-Path $PSScriptRoot '..\..\.env.local'
  }
  if (-not (Test-Path -LiteralPath $envFile)) {
    Write-UatGuardError "UAT environment file not found: $envFile (set NZAMY_UAT_ENV_FILE to point elsewhere)."
    exit 3
  }

  $map = @{}
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $match = [regex]::Match($_, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
    if ($match.Success) { $map[$match.Groups[1].Value] = $match.Groups[2].Value.Trim().Trim('"').Trim("'") }
  }

  $url = $map['NEXT_PUBLIC_SUPABASE_URL']
  $serviceKey = $map['SUPABASE_SERVICE_ROLE_KEY']
  if ([string]::IsNullOrWhiteSpace($url) -or [string]::IsNullOrWhiteSpace($serviceKey)) {
    Write-UatGuardError "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in $envFile."
    exit 3
  }

  $projectRef = $null
  $hostMatch = [regex]::Match($url, '^https?://([^./]+)\.')
  if ($hostMatch.Success) { $projectRef = $hostMatch.Groups[1].Value }
  if ([string]::IsNullOrWhiteSpace($projectRef)) {
    Write-UatGuardError "Could not parse a Supabase project ref out of NEXT_PUBLIC_SUPABASE_URL ('$url') in $envFile."
    exit 3
  }

  return [pscustomobject]@{
    Url        = $url
    AnonKey    = $map['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    ServiceKey = $serviceKey
    ProjectRef = $projectRef
    EnvFile    = $envFile
    RawMap     = $map
  }
}

function Assert-UatProject {
  [CmdletBinding()]
  param(
    [switch]$AllowWrites,
    [switch]$IUnderstandThisIsProduction
  )

  $uatEnv = Get-UatEnv

  $allowListRaw = $env:NZAMY_UAT_PROJECT_REFS
  $allowList = @()
  if (-not [string]::IsNullOrWhiteSpace($allowListRaw)) {
    $allowList = @($allowListRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
  if ($allowList -notcontains $uatEnv.ProjectRef) {
    Write-UatGuardError (
      "Refusing to run: Supabase project '$($uatEnv.ProjectRef)' (from $($uatEnv.EnvFile)) is not in the " +
      "NZAMY_UAT_PROJECT_REFS allow-list ('$allowListRaw'). Set NZAMY_UAT_PROJECT_REFS to a comma-separated " +
      "list of approved TEST project refs before running any scripts/uat/*.ps1 script."
    )
    exit 3
  }

  if ($AllowWrites -and $uatEnv.ProjectRef -eq $script:NzamyProductionProjectRef) {
    $envOverride = $env:NZAMY_UAT_ALLOW_PRODUCTION -eq '1'
    if (-not ($IUnderstandThisIsProduction -and $envOverride)) {
      Write-UatGuardError (
        "Refusing to write: '$($uatEnv.ProjectRef)' is the PRODUCTION project. This script would create, " +
        "change, or delete real data. Pass -IUnderstandThisIsProduction AND set NZAMY_UAT_ALLOW_PRODUCTION=1 " +
        "to override -- only do this if you mean it."
      )
      exit 3
    }
    Write-Host '============================================================' -ForegroundColor Red
    Write-Host " WRITING TO PRODUCTION ($($uatEnv.ProjectRef)) -- override active" -ForegroundColor Red
    Write-Host '============================================================' -ForegroundColor Red
  }

  return $uatEnv
}
