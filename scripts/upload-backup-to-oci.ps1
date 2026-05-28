#Requires -Version 5.1
<#
.SYNOPSIS
Envia um backup (export JSON do snapshot I.S.O PRO) para Oracle Cloud Object Storage.

.DESCRIPTION
Requer OCI CLI configurado (`oci setup config`) e politica IAM que permita criar objectos no bucket.

Requisitos previos:
  1) Bucket criado na consola OCI (Object Storage).
  2) Chave API no teu utilizador OCI + politica no grupo (ver comentarios no final deste ficheiro ou documentacao Oracle).
  3) OCI CLI no PATH: https://docs.oracle.com/iaas/Content/API/Concepts/cliconcepts.htm

Fluxo tipico:
  npm run snapshot:export
  # Opcional: copie scripts/backup-oci.env.example para scripts/backup-oci.env (OCI_BUCKET_NAME=...)
  npm run backup:upload-oci
  # ou: .\scripts\upload-backup-to-oci.ps1 -BucketName "iso-pro-backups"

Automatico (desktop): ao gravar Configuracoes no app Electron, e criado
  %APPDATA%\iso-pro-desktop\oci-upload-context.json
  com cliente/projeto. O script preenche pastas no bucket se nao passar -Cliente/-Projeto.
  Opcional: copie esse JSON para backups\oci-upload-context.json ou defina ISO_PRO_OCI_CONTEXT_JSON=caminho.

Com cliente e projeto (pastas dentro do prefixo, depois ano/mes):
  .\scripts\upload-backup-to-oci.ps1 -BucketName "iso-pro-backups" -Cliente "Cliente 01" -Projeto "obra 55"
  # Object: iso-pro-snapshots/cliente-01/cliente-01-obra-55/AAAA/MM/...
  # Se Projeto ja for "Cliente 01 - obra 55", nao duplica o nome.

.PARAMETER BucketName
Nome do bucket Object Storage (ex.: iso-pro-backups).

.PARAMETER FilePath
Caminho absoluto do JSON. Se omitido, usa o ficheiro mais recente matching iso-pro-snapshot-export-*.json em backups/.

.PARAMETER Prefix
Raiz virtual no bucket. Por defeito: iso-pro-snapshots. O caminho final e:
  {Prefix}/{Cliente-sanitizado}/{Nome-da-obra-sanitizado}/AAAA/MM/nome.json
  Nome-da-obra = "Cliente - Projeto" automaticamente (ver -NoCombinarProjetoComCliente).

.PARAMETER Cliente
Opcional. Primeira pasta apos o Prefix (ex.: Cliente 01). Agrupa todas as obras desse cliente.

.PARAMETER Projeto
Opcional. Segunda pasta: por defeito junta ao Cliente como "Cliente - Projeto" (ex.: obra 55 -> Cliente 01 - obra 55).
  Se ja escrever "Cliente 01 - obra 55", mantem um unico titulo. Parametros explicitos prevalecem sobre JSON.

.PARAMETER NoCombinarProjetoComCliente
Se definido, a segunda pasta usa apenas o texto de Projeto (sem prefixar Cliente).
#>
param(
  [string] $BucketName = '',

  [string] $FilePath = '',

  [string] $Prefix = '',

  [string] $Cliente = '',

  [string] $Projeto = '',

  [switch] $NoCombinarProjetoComCliente
)

$ErrorActionPreference = 'Stop'

function Import-IsoProBackupOciEnvFile {
  param([string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -le 0) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key))) {
      Set-Item -Path "Env:$key" -Value $val
    }
  }
}

$projectRootEarly = Split-Path -Parent $PSScriptRoot
Import-IsoProBackupOciEnvFile -Path (Join-Path $PSScriptRoot 'backup-oci.env')

if ([string]::IsNullOrWhiteSpace($BucketName)) {
  $BucketName = [string]$env:OCI_BUCKET_NAME
}
if ([string]::IsNullOrWhiteSpace($Prefix)) {
  $Prefix = [string]$env:OCI_PREFIX
}
if ([string]::IsNullOrWhiteSpace($Prefix)) {
  $Prefix = 'iso-pro-snapshots'
}

if ([string]::IsNullOrWhiteSpace($BucketName)) {
  throw @"
BucketName em falta. Use uma destas opcoes:
  1) Copie scripts/backup-oci.env.example para scripts/backup-oci.env e defina OCI_BUCKET_NAME=...
  2) npm run backup:upload-oci -- -BucketName `"seu-bucket`"
"@
}

if (-not (Get-Command oci -ErrorAction SilentlyContinue)) {
  throw 'OCI CLI nao encontrado no PATH. Instala a partir de: https://docs.oracle.com/iaas/Content/API/Concepts/cliconcepts.htm'
}

function Get-OciNamespace {
  $out = & oci os ns get --query data --raw-output 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao obter namespace OCI. Corre 'oci setup config' e testa 'oci os ns get'. Detalhe: $out"
  }
  return [string]$out.Trim().Trim('"')
}

function ConvertTo-OciPathSegment {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Label,
    [Parameter(Mandatory = $true)]
    [string] $Raw
  )
  if ([string]::IsNullOrWhiteSpace($Raw)) {
    return ''
  }
  $t = $Raw.Trim()
  # Um nivel de pasta por segmento: sem barras incorporadas
  $t = $t -replace '[\\/]+', '-'
  $t = $t -replace '[:*?"<>|]', ''
  $t = $t -replace '\s+', '-'
  $t = $t.Trim('-')
  while ($t.Contains('--')) {
    $t = $t.Replace('--', '-')
  }
  if ([string]::IsNullOrWhiteSpace($t)) {
    throw "${Label}: valor invalido ou so caracteres proibidos apos normalizacao. Use letras, numeros ou hifens."
  }
  $max = 128
  if ($t.Length -gt $max) {
    $t = $t.Substring(0, $max).TrimEnd('-')
  }
  return $t.ToLowerInvariant()
}

function Resolve-OciProjetoFolderLabel {
  param(
    [string]$Cliente,
    [string]$Projeto,
    [bool]$UsarSomenteProjetoSemCliente = $false
  )
  $p = $Projeto.Trim()
  if ([string]::IsNullOrWhiteSpace($p)) {
    return ''
  }
  if ($UsarSomenteProjetoSemCliente) {
    return $p
  }
  $c = $Cliente.Trim()
  if ([string]::IsNullOrWhiteSpace($c)) {
    return $p
  }
  $pLower = $p.ToLowerInvariant()
  $cLower = $c.ToLowerInvariant()
  if ($pLower.StartsWith($cLower)) {
    $after = $p.Substring($c.Length).TrimStart()
    if ($after.StartsWith('-') -or [string]::IsNullOrWhiteSpace($after)) {
      return $p.Trim()
    }
  }
  return "$c - $p"
}

function Read-OciUploadContextMerged {
  param(
    [Parameter(Mandatory = $true)]
    [string] $BackupDir,
    [string] $ClienteAtual,
    [string] $ProjetoAtual
  )
  $c = $ClienteAtual
  $p = $ProjetoAtual
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($env:ISO_PRO_OCI_CONTEXT_JSON)) {
    [void]$candidates.Add($env:ISO_PRO_OCI_CONTEXT_JSON.Trim())
  }
  [void]$candidates.Add((Join-Path $BackupDir 'oci-upload-context.json'))
  $appData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
  [void]$candidates.Add((Join-Path $appData 'iso-pro-desktop\oci-upload-context.json'))

  foreach ($file in $candidates) {
    if ([string]::IsNullOrWhiteSpace($file)) { continue }
    if (-not (Test-Path -LiteralPath $file)) { continue }
    try {
      $raw = Get-Content -LiteralPath $file -Raw -Encoding UTF8
      $j = $raw | ConvertFrom-Json
      $jc = [string]$j.cliente
      $jp = [string]$j.projeto
      if ([string]::IsNullOrWhiteSpace($c) -and -not [string]::IsNullOrWhiteSpace($jc)) {
        $c = $jc.Trim()
      }
      if ([string]::IsNullOrWhiteSpace($p) -and -not [string]::IsNullOrWhiteSpace($jp)) {
        $p = $jp.Trim()
      }
      if (-not [string]::IsNullOrWhiteSpace($c) -and -not [string]::IsNullOrWhiteSpace($p)) {
        break
      }
    }
    catch {
      Write-Host "Aviso: contexto OCI ilegivel em $file - $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
  }
  return @{ Cliente = $c; Projeto = $p }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDirJoined = Join-Path $projectRoot 'backups'
if (-not (Test-Path -LiteralPath $backupDirJoined)) {
  throw "Pasta backups nao existe em '$backupDirJoined'. Corra primeiro: npm run snapshot:export"
}
$backupDir = (Resolve-Path -LiteralPath $backupDirJoined).Path

if (-not $FilePath) {
  $latest = Get-ChildItem -LiteralPath $backupDir -Filter 'iso-pro-snapshot-export-*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "Nenhum iso-pro-snapshot-export-*.json em '$backupDir'. Gera primeiro: npm run snapshot:export"
  }
  $FilePath = $latest.FullName
}
else {
  if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "Ficheiro nao existe: $FilePath"
  }
  $FilePath = (Resolve-Path -LiteralPath $FilePath).Path
}

$merged = Read-OciUploadContextMerged -BackupDir $backupDir -ClienteAtual $Cliente -ProjetoAtual $Projeto
$Cliente = [string]$merged.Cliente
$Projeto = [string]$merged.Projeto

$ns = Get-OciNamespace
$baseName = [System.IO.Path]::GetFileName($FilePath)
$datePart = Get-Date -Format 'yyyy/MM'

$prefixClean = ($Prefix.Trim().Trim('/'))
if ([string]::IsNullOrWhiteSpace($prefixClean)) {
  throw 'Prefix nao pode ser vazio.'
}

$pathParts = New-Object System.Collections.Generic.List[string]
[void]$pathParts.Add($prefixClean)

$projetoPastaLegivel = Resolve-OciProjetoFolderLabel -Cliente $Cliente -Projeto $Projeto -UsarSomenteProjetoSemCliente $NoCombinarProjetoComCliente.IsPresent

if (-not [string]::IsNullOrWhiteSpace($Cliente)) {
  [void]$pathParts.Add((ConvertTo-OciPathSegment -Label 'Cliente' -Raw $Cliente))
}
if (-not [string]::IsNullOrWhiteSpace($projetoPastaLegivel)) {
  [void]$pathParts.Add((ConvertTo-OciPathSegment -Label 'Projeto (pasta obra)' -Raw $projetoPastaLegivel))
}

$objectName = ($pathParts -join '/') + '/' + $datePart + '/' + $baseName

Write-Host "Namespace: $ns"
Write-Host "Bucket:    $BucketName"
Write-Host "Object:    $objectName"
Write-Host "Ficheiro:  $FilePath"
if (-not [string]::IsNullOrWhiteSpace($Cliente) -or -not [string]::IsNullOrWhiteSpace($Projeto)) {
  Write-Host "Pastas:    cliente='$Cliente' obra='$projetoPastaLegivel' (campo projeto='$Projeto')"
}
Write-Host ''

& oci os object put --namespace $ns --bucket-name $BucketName --name $objectName --file $FilePath --force
if ($LASTEXITCODE -ne 0) {
  throw "oci os object put falhou (exit $LASTEXITCODE)."
}

Write-Host ''
Write-Host 'OK - upload concluido.'
