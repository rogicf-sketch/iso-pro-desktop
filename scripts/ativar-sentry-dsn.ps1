# Grava o DSN Sentry nos .env locais (desktop + mobile + deploy-web se existir).
# Uso:
#   npm run sentry:ativar -- -Dsn "https://KEY@oXXXX.ingest.sentry.io/PROJECT"
#   powershell -File scripts/ativar-sentry-dsn.ps1 -Dsn "https://..."
param(
  [Parameter(Mandatory = $true)]
  [string]$Dsn,
  [switch]$SkipMobile,
  [switch]$SkipDeployEnv
)

$ErrorActionPreference = 'Stop'

function Test-SentryDsnFormat([string]$Value) {
  try {
    $u = [Uri]$Value
    if ($u.Scheme -ne 'https' -and $u.Scheme -ne 'http') { return $false }
    if (-not $u.UserInfo) { return $false }
    $project = $u.AbsolutePath.TrimStart('/')
    return $project -match '^\d+$'
  } catch {
    return $false
  }
}

function Set-EnvKey([string]$Path, [string]$Key, [string]$Value) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $lines = @()
  if (Test-Path $Path) {
    $lines = Get-Content -LiteralPath $Path -Encoding UTF8
  }
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) {
    if ($out.Count -gt 0 -and $out[-1] -ne '') { $out += '' }
    $out += "$Key=$Value"
  }
  Set-Content -LiteralPath $Path -Value $out -Encoding UTF8
  Write-Host "OK  $Key -> $Path" -ForegroundColor Green
}

$Dsn = $Dsn.Trim().Trim('"').Trim("'")
if (-not (Test-SentryDsnFormat $Dsn)) {
  Write-Host "DSN com formato invalido. Esperado: https://<key>@<host>/<projectId>" -ForegroundColor Red
  exit 1
}

$desktopRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path (Split-Path -Parent $desktopRoot) 'iso_pro_mobile'

Write-Host '=== Activar Sentry DSN ===' -ForegroundColor Cyan
Set-EnvKey (Join-Path $desktopRoot '.env') 'VITE_SENTRY_DSN' $Dsn

if (-not $SkipDeployEnv) {
  $deployEnv = Join-Path $desktopRoot 'scripts\deploy-web.env'
  if (Test-Path $deployEnv) {
    Set-EnvKey $deployEnv 'VITE_SENTRY_DSN' $Dsn
  } else {
    Write-Host "Aviso: scripts/deploy-web.env ausente - so .env local actualizado." -ForegroundColor Yellow
  }
}

if (-not $SkipMobile) {
  if (Test-Path (Join-Path $mobileRoot 'app.config.ts')) {
    Set-EnvKey (Join-Path $mobileRoot '.env') 'EXPO_PUBLIC_SENTRY_DSN' $Dsn
  } else {
    Write-Host "Aviso: iso_pro_mobile nao encontrado em $mobileRoot" -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'Proximos passos:' -ForegroundColor Cyan
Write-Host '  1) npm run sentry:validate-dsn'
Write-Host '  2) npm run deploy:web   (ou rebuild PC)'
Write-Host '  3) Mobile: novo APK / EAS com EXPO_PUBLIC_SENTRY_DSN'
Write-Host '  4) Configuracoes -> Sentry -> Enviar evento de teste'
Write-Host '  5) No Sentry: alertas para message contendo iso.'
Write-Host ''
Write-Host 'DSN mascarado:' ($Dsn -replace '//[^@]+@', '//***@')
