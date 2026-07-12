# Abre os dashboards SRE (backups, infra, advisors).
# Uso: powershell -File scripts/abrir-dashboards-nivel-mundial.ps1
param(
  [string]$ProjectRef = 'huvktaxsosxrfpvdigxq'
)

$urls = @(
  "https://supabase.com/dashboard/project/$ProjectRef/database/backups/scheduled",
  "https://supabase.com/dashboard/project/$ProjectRef/settings/infrastructure",
  "https://supabase.com/dashboard/project/$ProjectRef/reports/database",
  "https://supabase.com/dashboard/project/$ProjectRef/advisors/performance",
  "https://supabase.com/dashboard/project/$ProjectRef/advisors/security"
)

Write-Host '=== Dashboards nivel mundial ===' -ForegroundColor Cyan
foreach ($u in $urls) {
  Write-Host $u
  Start-Process $u
  Start-Sleep -Milliseconds 500
}

Write-Host ''
Write-Host 'Checklist alertas Sentry: docs/CHECKLIST-ALERTAS-SENTRY.md' -ForegroundColor Yellow
Write-Host 'Checklist infra:          docs/CHECKLIST-ALERTAS-INFRA-SUPABASE.md' -ForegroundColor Yellow
Write-Host 'Guia restauro staging:    docs/GUIA-RESTAURO-STAGING.md' -ForegroundColor Yellow
Write-Host 'No backups: usa "Restore to new project (BETA)", nunca Restore em prod.' -ForegroundColor Red
