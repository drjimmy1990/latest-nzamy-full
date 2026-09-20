<#
Static UAT triage only. It does not assert that a screen is functional or
non-functional: it creates a reproducible queue for browser/API verification.
The labels deliberately distinguish an explicit "coming soon" screen from a
mock/placeholder candidate that still needs human-path testing.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string]$SourceRoot = 'src/app',
  [string]$ComponentsRoot = 'src/components'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Get-RouteFromPage([System.IO.FileInfo]$File, [string]$AppRoot) {
  $relative = $File.FullName.Substring((Resolve-Path $AppRoot).Path.Length).TrimStart('\','/')
  $directory = Split-Path $relative -Parent
  if ([string]::IsNullOrWhiteSpace($directory) -or $directory -eq '.') { return '/' }
  return '/' + ($directory -replace '\\','/')
}

function Get-Markings([string]$Content) {
  $marks = [System.Collections.Generic.List[string]]::new()
  if ($Content -match '(?i)DashboardComingSoon|ComingSoon|قريباً|قريبًا|coming soon') { $marks.Add('explicit_coming_soon') }
  if ($Content -match '(?i)\bMOCK[_A-Z]*\b|\bmock[A-Za-z_]*\b') { $marks.Add('mock_candidate') }
  if ($Content -match '(?i)placeholder') { $marks.Add('placeholder_candidate') }
  if ($Content -match '(?i)\bdemo\b|isDemoBypass|setDemoSession') { $marks.Add('demo_candidate') }
  if ($Content -match 'fetch\s*\(|/api/|createClient\s*\(|createServerClient\s*\(|\.from\s*\(') { $marks.Add('backend_reference') }
  return @($marks | Select-Object -Unique)
}

$appRoot = Resolve-Path $SourceRoot
$pages = Get-ChildItem -LiteralPath $appRoot -Filter 'page.tsx' -Recurse -File | ForEach-Object {
  $content = Get-Content -LiteralPath $_.FullName -Raw
  $marks = Get-Markings $content
  $classification = if ($marks -contains 'explicit_coming_soon') { 'قريبًا بوضوح — يحتاج قرار منتج فقط' }
    elseif (($marks -contains 'mock_candidate') -or ($marks -contains 'placeholder_candidate') -or ($marks -contains 'demo_candidate')) { 'مرشح واجهة/بيانات غير حقيقية — يلزم اختبار متصفح وخلفية' }
    elseif ($marks -contains 'backend_reference') { 'لديه مرجع خلفي — يلزم إثبات API/قاعدة بيانات' }
    else { 'غير محسوم — يلزم اختبار مسار المستخدم' }
  [ordered]@{
    route = Get-RouteFromPage $_ $appRoot
    file = $_.FullName
    classification = $classification
    markers = $marks
  }
}

$apiRoutes = Get-ChildItem -LiteralPath $appRoot -Filter 'route.ts' -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($appRoot.Path.Length).TrimStart('\','/')
  [ordered]@{ route = '/api/' + (($relative -replace '\\','/') -replace '/route\.ts$',''); file=$_.FullName }
}

$components = Get-ChildItem -LiteralPath $ComponentsRoot -Include '*.ts','*.tsx' -Recurse -File | ForEach-Object {
  $content = Get-Content -LiteralPath $_.FullName -Raw
  $marks = Get-Markings $content
  if ($marks.Count -gt 0 -and ($marks -contains 'mock_candidate' -or $marks -contains 'placeholder_candidate' -or $marks -contains 'demo_candidate')) {
    [ordered]@{ file=$_.FullName; markers=$marks; classification='مرشح واجهة/بيانات غير حقيقية — يلزم ربطه بالمسار الظاهر' }
  }
}

$result = [ordered]@{
  format='nzamy-uat-surface-inventory/v1'
  createdAt=(Get-Date).ToUniversalTime().ToString('o')
  staticOnly=$true
  caveat='Marker hits are triage candidates, not verdicts. A marker in a comment, showcase, or testable demo does not by itself make a user-facing page ghostly.'
  counts=[ordered]@{ pages=@($pages).Count; apiRoutes=@($apiRoutes).Count; pageCandidates=@($pages | Where-Object { $_.classification -notlike 'لديه مرجع*' -and $_.classification -notlike 'غير محسوم*' }).Count; componentCandidates=@($components).Count }
  pages=$pages
  apiRoutes=$apiRoutes
  componentCandidates=$components
}
$resultFile=Join-Path $OutputDirectory 'surface-inventory.json'
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultFile -Encoding utf8
$digest=(Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash
[ordered]@{output=$resultFile; pages=$result.counts.pages; apiRoutes=$result.counts.apiRoutes; pageCandidates=$result.counts.pageCandidates; componentCandidates=$result.counts.componentCandidates; sha256=$digest}|ConvertTo-Json -Compress
