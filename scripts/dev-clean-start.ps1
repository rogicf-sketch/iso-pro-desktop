# Encerra instancias presas e inicia I.S.O PRO (Vite + Electron).
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent

Write-Host '[I.S.O PRO] A encerrar processos Electron antigos...' -ForegroundColor Cyan
Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host '[I.S.O PRO] A libertar porta 5173...' -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }

Set-Location $root
Write-Host '[I.S.O PRO] A iniciar npm run dev...' -ForegroundColor Green
Write-Host '  Aguarde a janela "I.S.O PRO - Gestao de materiais" (Alt+Tab).' -ForegroundColor Yellow
npm run dev
