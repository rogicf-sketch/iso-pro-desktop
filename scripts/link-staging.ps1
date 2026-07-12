# Liga o CLI ao projecto de STAGING (não produção).
# Uso:
#   $env:ISO_PRO_STAGING_PROJECT_REF = "abcdefghijklmnop"
#   powershell -File scripts/link-staging.ps1
param(
  [string]$ProjectRef = $env:ISO_PRO_STAGING_PROJECT_REF
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $ProjectRef) {
  Write-Host "Defina ISO_PRO_STAGING_PROJECT_REF ou passe -ProjectRef <ref>." -ForegroundColor Red
  Write-Host "Crie o projecto em https://supabase.com/dashboard → New project" -ForegroundColor Yellow
  exit 1
}

if ($ProjectRef -eq "huvktaxsosxrfpvdigxq") {
  Write-Host "Recusado: esse ref e PRODUCAO. Use o project-ref de staging." -ForegroundColor Red
  exit 1
}

Write-Host "A ligar staging: $ProjectRef" -ForegroundColor Cyan
npx supabase link --project-ref $ProjectRef
Write-Host "Seguinte: npx supabase db push ; npx supabase config push --yes" -ForegroundColor Green
