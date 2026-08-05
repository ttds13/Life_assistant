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

$requiredFiles = @(
  '.env.production',
  'certs\apiclient_key.pem',
  'certs\wechatpay_public_key.pem'
)

foreach ($file in $requiredFiles) {
  if (-not (Test-Path $file)) {
    throw "missing $file"
  }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'certs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'uploads') | Out-Null

docker build --build-arg "NODE_IMAGE=$NodeImage" -t $imageRef .
docker save -o (Join-Path $OutputDir "$imageName.tar") $imageRef

Copy-Item '.env.production' (Join-Path $OutputDir '.env.production') -Force
Copy-Item 'certs\apiclient_key.pem' (Join-Path $OutputDir 'certs\apiclient_key.pem') -Force
Copy-Item 'certs\wechatpay_public_key.pem' (Join-Path $OutputDir 'certs\wechatpay_public_key.pem') -Force
Copy-Item 'deploy.sh' (Join-Path $OutputDir 'deploy.sh') -Force
Copy-Item 'docker-entrypoint.sh' (Join-Path $OutputDir 'docker-entrypoint.sh') -Force
Copy-Item 'Dockerfile' (Join-Path $OutputDir 'Dockerfile') -Force

Set-Content -Path (Join-Path $OutputDir '.image-tag') -Value $ImageTag -NoNewline -Encoding ascii
$manifest = [ordered]@{
  image = $imageRef
  sourceCommit = (git -C $PSScriptRoot rev-parse HEAD).Trim()
  createdAtUtc = [DateTime]::UtcNow.ToString('o')
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $OutputDir 'release-manifest.json') -Encoding utf8

if (Test-Path 'uploads') {
  Copy-Item 'uploads\*' (Join-Path $OutputDir 'uploads') -Recurse -Force -ErrorAction SilentlyContinue
}

if ($Zip) {
  $zipPath = "$OutputDir.zip"
  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $OutputDir '*') -DestinationPath $zipPath -Force
  Write-Host "packed release zip: $zipPath"
}

Write-Host "packed release dir: $OutputDir"
