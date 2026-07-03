param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\release\server-release'),
  [switch]$Zip,
  [string]$NodeImage = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Set-Location $PSScriptRoot

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

docker build --build-arg "NODE_IMAGE=$NodeImage" -t "${imageName}:latest" .
docker save -o (Join-Path $OutputDir "$imageName.tar") "${imageName}:latest"

Copy-Item '.env.production' (Join-Path $OutputDir '.env.production') -Force
Copy-Item 'certs\apiclient_key.pem' (Join-Path $OutputDir 'certs\apiclient_key.pem') -Force
Copy-Item 'certs\wechatpay_public_key.pem' (Join-Path $OutputDir 'certs\wechatpay_public_key.pem') -Force
Copy-Item 'deploy.sh' (Join-Path $OutputDir 'deploy.sh') -Force
Copy-Item 'docker-entrypoint.sh' (Join-Path $OutputDir 'docker-entrypoint.sh') -Force
Copy-Item 'Dockerfile' (Join-Path $OutputDir 'Dockerfile') -Force

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
