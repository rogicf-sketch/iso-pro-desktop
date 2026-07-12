# Activa secrets do workflow Smoke diario ops a partir do .env local.
# Uso (PowerShell, na pasta iso-pro-desktop):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/activar-secrets-smoke-github.ps1
#
# Requer: gh auth login + repo com Actions activo.
# Nao imprime valores dos secrets.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -le 0) { continue }
    $k = $t.Substring(0, $i).Trim()
    if ($k -eq $Key) {
      return $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$envFile = Join-Path $root '.env'
$url = Get-EnvValue $envFile 'VITE_SUPABASE_URL'
$anon = Get-EnvValue $envFile 'VITE_SUPABASE_ANON_KEY'
$tenant = Get-EnvValue $envFile 'ISO_PRO_E2E_TENANT_ID'
if (-not $tenant) { $tenant = '00000000-0000-0000-0000-000000000001' }

if (-not $url -or -not $anon) {
  Write-Host 'Faltam VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY em .env' -ForegroundColor Red
  exit 1
}

try {
  $null = Get-Command gh -ErrorAction Stop
} catch {
  Write-Host 'GitHub CLI (gh) nao instalado neste PC.' -ForegroundColor Red
  Write-Host 'Opcao A: winget install --id GitHub.cli' -ForegroundColor Yellow
  Write-Host 'Opcao B (manual no browser):' -ForegroundColor Yellow
  Write-Host '  1) Repo → Settings → Secrets and variables → Actions'
  Write-Host '  2) Criar VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ISO_PRO_E2E_TENANT_ID'
  Write-Host '  3) Actions → Smoke diario ops → Run workflow'
  exit 1
}

$null = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host 'gh nao autenticado. Corre: gh auth login' -ForegroundColor Red
  exit 1
}

Write-Host 'A gravar secrets no GitHub (valores ocultos)...' -ForegroundColor Cyan
$url | gh secret set VITE_SUPABASE_URL
$anon | gh secret set VITE_SUPABASE_ANON_KEY
$tenant | gh secret set ISO_PRO_E2E_TENANT_ID

Write-Host 'OK. Disparar manualmente:' -ForegroundColor Green
Write-Host '  gh workflow run "Smoke diario ops"'
Write-Host '  gh run list --workflow=smoke-diario.yml --limit 3'
