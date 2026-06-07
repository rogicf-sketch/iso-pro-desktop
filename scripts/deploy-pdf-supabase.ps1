# Deploy Supabase PDF (migration + Edge Functions) via npx
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Supabase: aplicar migracao pdf_jobs..." -ForegroundColor Cyan
npx supabase db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Supabase: deploy Edge Functions PDF..." -ForegroundColor Cyan
npx supabase functions deploy pdf_enqueue --no-verify-jwt
npx supabase functions deploy pdf_status --no-verify-jwt
npx supabase functions deploy pdf_cleanup --no-verify-jwt

Write-Host "Concluido." -ForegroundColor Green
