# Inicia o PDF worker no Windows (PowerShell)
# Uso:
#   1. Copie pdf-worker.env.example para pdf-worker.local.env
#   2. Preencha SUPABASE_SERVICE_ROLE_KEY (Dashboard Supabase > Settings > API)
#   3. .\scripts\start-pdf-worker.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$envFile = Join-Path $root "services\pdf-worker\pdf-worker.local.env"
if (-not (Test-Path $envFile)) {
  Write-Host "Crie services\pdf-worker\pdf-worker.local.env a partir de pdf-worker.env.example" -ForegroundColor Yellow
  exit 1
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#")) {
    $i = $line.IndexOf("=")
    if ($i -gt 0) {
      $k = $line.Substring(0, $i).Trim()
      $v = $line.Substring($i + 1).Trim()
      [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
  }
}

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "SUPABASE_SERVICE_ROLE_KEY vazio em pdf-worker.local.env" -ForegroundColor Red
  exit 1
}

Write-Host "Build worker..." -ForegroundColor Cyan
npm run build:pdf-worker
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Iniciando pdf-worker..." -ForegroundColor Green
$env:NODE_OPTIONS = "--use-system-ca"
$env:PDF_WORKER_FONTS_DIR = Join-Path $root "services\pdf-worker\fonts"
npm run pdf-worker:start
