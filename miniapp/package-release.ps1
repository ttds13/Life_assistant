param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\release\miniapp-release'),
  [switch]$Zip,
  [string]$ReleaseId = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

$dirtyFiles = @(git -C $PSScriptRoot status --porcelain -- .)
if ($dirtyFiles.Count -gt 0) {
  throw 'miniapp source tree is dirty; commit the release source before packaging'
}

if (Test-Path $OutputDir) {
  throw "release directory already exists: $OutputDir"
}

$commit = (git -C $PSScriptRoot rev-parse HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($commit)) {
  throw 'unable to determine git commit for release manifest'
}
if ([string]::IsNullOrWhiteSpace($ReleaseId)) {
  $ReleaseId = "miniapp-$($commit.Substring(0, 12))"
}
if ($ReleaseId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') {
  throw 'ReleaseId must contain only letters, numbers, dots, underscores, or hyphens'
}

pnpm run type-check
pnpm run build:mp:prod

$bundleDir = 'dist\build\mp-weixin'
if (-not (Test-Path (Join-Path $bundleDir 'app.json'))) {
  throw "missing miniapp production bundle: $bundleDir"
}

New-Item -ItemType Directory -Path $OutputDir | Out-Null
Copy-Item $bundleDir (Join-Path $OutputDir 'miniapp-dist') -Recurse
Set-Content -Path (Join-Path $OutputDir '.release-id') -Value $ReleaseId -NoNewline -Encoding ascii

$manifest = [ordered]@{
  releaseId = $ReleaseId
  sourceCommit = $commit
  apiBaseUrl = 'https://www.xunhaoyou.com/api'
  upload = 'Use the WeChat Mini Program upload workflow with miniapp-dist; this package does not submit for review.'
  createdAtUtc = [DateTime]::UtcNow.ToString('o')
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $OutputDir 'release-manifest.json') -Encoding utf8

if ($Zip) {
  $zipPath = "$OutputDir.zip"
  Compress-Archive -Path (Join-Path $OutputDir '*') -DestinationPath $zipPath -Force
  Write-Host "packed miniapp release zip: $zipPath"
}

Write-Host "packed miniapp release dir: $OutputDir"
