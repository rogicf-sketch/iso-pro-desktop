# Verifica / documenta backups Supabase (nao restaura sozinho).
# Uso: powershell -File scripts/verificar-backup-supabase.ps1
#      powershell -File scripts/verificar-backup-supabase.ps1 -OpenDashboard
param(
  [string]$ProjectRef = 'huvktaxsosxrfpvdigxq',
  [switch]$OpenDashboard
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$checklist = Join-Path $root 'CHECKLIST-OPERACOES.md'
$url = "https://supabase.com/dashboard/project/$ProjectRef/database/backups/scheduled"
$urlPitr = "https://supabase.com/dashboard/project/$ProjectRef/database/backups/pitr"
$urlProject = "https://supabase.com/dashboard/project/$ProjectRef"

Write-Host '=== Backup Supabase - verificacao TI ===' -ForegroundColor Cyan
Write-Host "Project: $ProjectRef"
Write-Host "Dashboard (scheduled): $url"
Write-Host "Dashboard (PITR):      $urlPitr"
Write-Host ''
Write-Host 'Passos manuais obrigatorios 1x para nivel mundial:' -ForegroundColor Yellow
Write-Host '  1. Abrir Database > Backups > Scheduled e confirmar backups automaticos activos'
Write-Host '  2. Anotar data/hora do ultimo backup em CHECKLIST-OPERACOES.md'
Write-Host '  3. Teste de restauro: preferir restaurar para STAGING'
Write-Host '  4. Smoke pos-restauro: login admin + listar documentos + 1 atendimento teste'
Write-Host '  Nota: Free plan nao tem backups automaticos no painel - usar dump CLI periodico.'
Write-Host ''
Write-Host "Checklist: $checklist"

if ($OpenDashboard) {
  Start-Process $url
  Write-Host 'Dashboard aberto no browser (Scheduled backups).' -ForegroundColor Green
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$logDir = Join-Path $root 'release'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$log = Join-Path $logDir 'backup-verificacao-log.txt'
Add-Content -LiteralPath $log -Value "[$stamp] verificacao iniciada project=$ProjectRef url=$url"
Write-Host "Log: $log"
Write-Host ''
Write-Host 'Quando confirmares no dashboard, marca em CHECKLIST-OPERACOES.md:' -ForegroundColor Cyan
Write-Host '  [x] Plano com backups automaticos activos'
Write-Host '  [x] Teste de restauracao feito com data'
