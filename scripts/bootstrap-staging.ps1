# Bootstrap staging I.S.O PRO apos Restore-to-new-project no Dashboard.
# Uso:
#   powershell -File scripts/bootstrap-staging.ps1 -ProjectRef <REF> -AnonKey "<anon>"
#   # ou: $env:ISO_PRO_STAGING_PROJECT_REF=... ; $env:ISO_PRO_STAGING_ANON_KEY=...
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [string]$AnonKey = $env:ISO_PRO_STAGING_ANON_KEY,
  [switch]$SkipDbPush,
  [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($ProjectRef -eq 'huvktaxsosxrfpvdigxq') {
  Write-Host 'Recusado: esse ref e PRODUCAO.' -ForegroundColor Red
  exit 1
}

if (-not $AnonKey) {
  Write-Host 'Passe -AnonKey ou ISO_PRO_STAGING_ANON_KEY (anon JWT ou sb_publishable_ do staging).' -ForegroundColor Red
  exit 1
}

Write-Host "== Bootstrap staging: $ProjectRef ==" -ForegroundColor Cyan

& "$PSScriptRoot\link-staging.ps1" -ProjectRef $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$envStaging = Join-Path $root '.env.staging'
$url = "https://$ProjectRef.supabase.co"
@(
  '# Gerado por scripts/bootstrap-staging.ps1 — NAO usar em builds de campo',
  "VITE_SUPABASE_URL=$url",
  "VITE_SUPABASE_ANON_KEY=$AnonKey",
  'VITE_ISO_PRO_JWT_AUTH=true'
) | Set-Content -Encoding utf8 -Path $envStaging
Write-Host "Escrito $envStaging" -ForegroundColor Green

if (-not $SkipDbPush) {
  Write-Host 'db push + config push...' -ForegroundColor Yellow
  npx supabase db push --yes
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npx supabase config push --yes
}

if (-not $SkipSmoke) {
  Write-Host 'Smoke diario contra .env.staging...' -ForegroundColor Yellow
  # Preferir staging: smoke carrega .env depois .env.staging; forcar URL via env
  $env:VITE_SUPABASE_URL = $url
  $env:VITE_SUPABASE_ANON_KEY = $AnonKey
  npm run ops:smoke-diario
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host 'Staging bootstrap OK. Seguir: CHECKLIST-OPERACOES.md §2b + cutover JWT so em staging.' -ForegroundColor Green
