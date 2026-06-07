# Build Windows (NSIS + portable) fora de caminhos com acentos — evita falha do makensis.
$ErrorActionPreference = 'Stop'
$Src = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BuildRoot = 'C:\ISO-PRO-BUILD\iso-pro-desktop'
$DestName = 'iso-pro-desktop'

if (Test-Path $BuildRoot) {
  Remove-Item -Recurse -Force $BuildRoot
}
New-Item -ItemType Directory -Force -Path (Split-Path $BuildRoot -Parent) | Out-Null

Write-Host "Copiando para $BuildRoot ..."
robocopy $Src $BuildRoot /MIR /XD node_modules dist dist-electron release .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falhou com codigo $LASTEXITCODE" }

Push-Location $BuildRoot
try {
  npm ci
  npm run dist:win
  $releaseSrc = Join-Path $BuildRoot 'release'
  $releaseDest = Join-Path $Src 'release'
  New-Item -ItemType Directory -Force -Path $releaseDest | Out-Null
  Copy-Item -Force (Join-Path $releaseSrc '*') $releaseDest
  Write-Host "Artefactos copiados para $releaseDest" -ForegroundColor Green
} finally {
  Pop-Location
}
