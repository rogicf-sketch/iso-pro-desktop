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
  # Preferir node_modules da origem (npm install no sandbox/CI costuma falhar com "Exit handler never called").
  $srcModules = Join-Path $Src 'node_modules'
  $dstModules = Join-Path $BuildRoot 'node_modules'
  if (Test-Path -LiteralPath (Join-Path $srcModules 'electron')) {
    Write-Host "Copiando node_modules da origem (evita npm install) ..."
    robocopy $srcModules $dstModules /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules falhou com codigo $LASTEXITCODE" }
  } else {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install falhou com codigo $LASTEXITCODE" }
  }
  npm run dist:win
  if ($LASTEXITCODE -ne 0) { throw "npm run dist:win falhou com codigo $LASTEXITCODE" }
  $releaseSrc = Join-Path $BuildRoot 'release'
  $releaseDest = Join-Path $Src 'release'
  if (-not (Test-Path -LiteralPath $releaseSrc)) {
    throw "Pasta release ausente em $releaseSrc (build incompleto)."
  }
  New-Item -ItemType Directory -Force -Path $releaseDest | Out-Null
  Copy-Item -Force (Join-Path $releaseSrc '*') $releaseDest
  Write-Host "Artefactos copiados para $releaseDest" -ForegroundColor Green

  # Organiza: só a revisão corrente em installers\atuais; resto em anteriores
  $pkg = Get-Content (Join-Path $BuildRoot 'package.json') -Raw | ConvertFrom-Json
  $ver = [string]$pkg.version
  $atuais = Join-Path $releaseDest 'installers\atuais'
  $anteriores = Join-Path $releaseDest 'installers\anteriores'
  New-Item -ItemType Directory -Force -Path $atuais, $anteriores | Out-Null

  # Limpa revisões antigas de atuais (só a corrente deve ficar)
  Get-ChildItem -LiteralPath $atuais -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notlike "*$ver*" -and $_.Name -notin @('SHA256SUMS.txt', 'builder-debug.yml', 'latest.yml')
  } | ForEach-Object {
    Move-Item -LiteralPath $_.FullName -Destination $anteriores -Force
  }

  Get-ChildItem -LiteralPath $releaseDest -File | Where-Object {
    $_.Name -like 'I.S.O PRO Setup *' -or $_.Name -like 'I.S.O PRO-*-portable.exe' -or $_.Name -like 'I.S.O PRO Setup *.blockmap'
  } | ForEach-Object {
    if ($_.Name -like "*$ver*" -and $_.Extension -ne '.blockmap') {
      Copy-Item -LiteralPath $_.FullName -Destination $atuais -Force
    }
    Move-Item -LiteralPath $_.FullName -Destination $anteriores -Force
  }

  $dbg = Join-Path $releaseDest 'builder-debug.yml'
  if (Test-Path -LiteralPath $dbg) { Move-Item -LiteralPath $dbg -Destination $atuais -Force }
  $sumsRoot = Join-Path $releaseDest 'SHA256SUMS.txt'
  if (Test-Path -LiteralPath $sumsRoot) { Remove-Item -LiteralPath $sumsRoot -Force }

  Push-Location $atuais
  $setupName = "I.S.O PRO Setup $ver.exe"
  $portableName = "I.S.O PRO-$ver-portable.exe"
  Get-FileHash -Algorithm SHA256 @($setupName, $portableName) |
    ForEach-Object { "$($_.Hash.ToLower())  $($_.Path | Split-Path -Leaf)" } |
    Set-Content -Encoding ascii SHA256SUMS.txt
  Pop-Location
  Write-Host "installers\atuais actualizado para v$ver" -ForegroundColor Green
} finally {
  Pop-Location
}
