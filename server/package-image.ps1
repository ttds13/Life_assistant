param(
  [string]$ImageName = 'life-assistant-server',
  [string]$TarName = (Join-Path $PSScriptRoot '..\release\life-assistant-server.tar'),
  [string]$DockerExe = '',
  [string]$NodeImage = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Set-Location $PSScriptRoot

function Get-DockerExePath {
  param([string]$ExplicitPath)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath) -and (Test-Path -LiteralPath $ExplicitPath)) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $fallback = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
  if (Test-Path -LiteralPath $fallback) {
    return $fallback
  }

  throw 'docker.exe not found. Install Docker Desktop and reopen PowerShell.'
}

$docker = Get-DockerExePath -ExplicitPath $DockerExe

if ([string]::IsNullOrWhiteSpace($NodeImage)) {
  if (-not [string]::IsNullOrWhiteSpace($env:NODE_IMAGE)) {
    $NodeImage = $env:NODE_IMAGE
  }
  else {
    $NodeImage = 'node:22-bookworm-slim'
  }
}

for ($i = 1; $i -le 30; $i++) {
  & $docker info | Out-Null
  if ($LASTEXITCODE -eq 0) {
    break
  }
  if ($i -eq 30) {
    throw 'Docker daemon is not ready. Restart Docker Desktop or reboot Windows, then retry.'
  }
  Start-Sleep -Seconds 5
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TarName) | Out-Null

& $docker build --build-arg "NODE_IMAGE=$NodeImage" -t "${ImageName}:latest" .
if ($LASTEXITCODE -ne 0) {
  throw 'docker build failed'
}

& $docker save -o $TarName "${ImageName}:latest"
if ($LASTEXITCODE -ne 0) {
  throw 'docker save failed'
}

Write-Host "saved ${ImageName}:latest to $TarName"
