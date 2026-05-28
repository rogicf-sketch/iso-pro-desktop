#Requires -Version 5.1
<#
.SYNOPSIS
Copia config + chave API OCI para %USERPROFILE%\.oci (Windows).

.DESCRIPTION
No Cloud Shell Oracle:
  1) Crie a chave se ainda nao tiver: oci setup config (ou use a existente em ~/.oci)
  2) Compacte: cd ~/.oci && zip -r ~/oci-config.zip config oci_api_key*.pem
  3) Download do zip para o PC (menu Download no Cloud Shell)

No PC:
  .\scripts\instalar-oci-config-windows.ps1 -ConfigZip "C:\Users\...\Downloads\oci-config.zip"

Depois:
  npm run snapshot:export
  npm run backup:upload-oci
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ConfigZip
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigZip)) {
  throw "Zip nao encontrado: $ConfigZip"
}

$dest = Join-Path $env:USERPROFILE '.oci'
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$temp = Join-Path $env:TEMP ("oci-config-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $temp -Force | Out-Null

try {
  Expand-Archive -LiteralPath $ConfigZip -DestinationPath $temp -Force
  Get-ChildItem -LiteralPath $temp -Recurse -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $_.Name) -Force
  }
}
finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

$configPath = Join-Path $dest 'config'
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "config nao encontrado dentro do zip."
}

# Ajusta caminho da chave privada para Windows (linha key_file=...)
$lines = Get-Content -LiteralPath $configPath -Encoding UTF8
$pem = Get-ChildItem -LiteralPath $dest -Filter 'oci_api_key*.pem' -File | Select-Object -First 1
if ($pem) {
  $pemWin = ($pem.FullName -replace '\\', '/')
  $lines = $lines | ForEach-Object {
    if ($_ -match '^\s*key_file\s*=') {
      "key_file=$pemWin"
    } else {
      $_
    }
  }
  Set-Content -LiteralPath $configPath -Value $lines -Encoding UTF8
}

Write-Host "OCI config instalado em: $dest"
Write-Host "Teste: oci os ns get"
