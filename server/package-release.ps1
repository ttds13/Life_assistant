param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\release\server-release'),
  [switch]$Zip,
  [string]$NodeImage = '',
  [string]$ImageTag = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Set-Location $PSScriptRoot

$dirtyFiles = @(git -C $PSScriptRoot status --porcelain -- .)
if ($dirtyFiles.Count -gt 0) {
  throw 'server source tree is dirty; commit the release source before packaging'
}

$imageName = $env:IMAGE_NAME
if ([string]::IsNullOrWhiteSpace($imageName)) {
  $imageName = 'life-assistant-server'
}

if ([string]::IsNullOrWhiteSpace($NodeImage)) {
  $NodeImage = $env:NODE_IMAGE
}
if ([string]::IsNullOrWhiteSpace($NodeImage)) {
  $NodeImage = 'node:22-bookworm-slim'
}

if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  $commit = (git -C $PSScriptRoot rev-parse --short HEAD).Trim()
  if ([string]::IsNullOrWhiteSpace($commit)) {
    throw 'unable to determine git commit for release tag'
  }
  $ImageTag = "release-$commit"
}

if ($ImageTag -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') {
  throw 'ImageTag must be a valid Docker tag'
}

$imageRef = "${imageName}:$ImageTag"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

docker build --build-arg "NODE_IMAGE=$NodeImage" -t $imageRef .
docker run --rm --entrypoint node $imageRef -e "const { Prisma } = require('@prisma/client'); if (new Prisma.Decimal(0).toString() !== '0') process.exit(1)"
docker save -o (Join-Path $OutputDir "$imageName.tar") $imageRef

Copy-Item 'deploy.sh' (Join-Path $OutputDir 'deploy.sh') -Force
Copy-Item 'backup-before-migration.sh' (Join-Path $OutputDir 'backup-before-migration.sh') -Force
Copy-Item 'docker-entrypoint.sh' (Join-Path $OutputDir 'docker-entrypoint.sh') -Force
Copy-Item 'Dockerfile' (Join-Path $OutputDir 'Dockerfile') -Force
Set-Content -Path (Join-Path $OutputDir '.image-tag') -Value $ImageTag -NoNewline -Encoding ascii
$manifest = [ordered]@{
  image = $imageRef
  sourceCommit = (git -C $PSScriptRoot rev-parse HEAD).Trim()
  secrets = 'Inject ENV_FILE and CERTS_DIR from the cloud secret store; they are intentionally excluded from this artifact.'
  backup = 'deploy.sh creates and restore-verifies a MySQL backup before migration.'
  createdAtUtc = [DateTime]::UtcNow.ToString('o')
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $OutputDir 'release-manifest.json') -Encoding utf8

if ($Zip) {
  $zipPath = "$OutputDir.zip"
  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $OutputDir '*') -DestinationPath $zipPath -Force
  Write-Host "packed release zip: $zipPath"
}

Write-Host "packed release dir: $OutputDir"
