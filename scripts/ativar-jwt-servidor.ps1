# Activa JWT Fase 3 no Supabase (servidor) - automatizado.
param(
  [switch]$LigarPiloto,
  [switch]$AutoPiloto,
  [string]$TenantId = "00000000-0000-0000-0000-000000000001"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-DotEnvValue {
  param([string]$Name)
  $envPath = Join-Path $root ".env"
  if (-not (Test-Path $envPath)) { return $null }
  foreach ($line in Get-Content $envPath) {
    if ($line -match ("^\s*" + [regex]::Escape($Name) + "\s*=\s*(.+)\s*$")) {
      return $Matches[1].Trim().Trim([char]34).Trim([char]39)
    }
  }
  return $null
}

function Invoke-RemoteSql {
  param([string]$Sql)
  $sqlFile = Join-Path $env:TEMP ("iso-pro-jwt-{0}.sql" -f [Guid]::NewGuid().ToString("N"))
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($sqlFile, $Sql, $utf8NoBom)
  try {
    npx supabase db query --linked --file $sqlFile
  } finally {
    Remove-Item $sqlFile -ErrorAction SilentlyContinue
  }
}

function Sync-SecretToSnapshot {
  param([string]$Secret)
  $escaped = $Secret -replace "'", "''"
  $sql = @"
UPDATE public.iso_pro_snapshot
SET payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{configuracoesSistema,isoProLinkAuthSecret}',
      to_jsonb('$escaped'::text),
      true
    ),
    updated_at = now()
WHERE id = 'default'
  AND tenant_id = '$TenantId'::uuid;
"@
  Write-Host "A sincronizar secret em iso_pro_snapshot.configuracoesSistema..." -ForegroundColor Gray
  Invoke-RemoteSql -Sql $sql
}

function New-AuthAdminUser {
  param(
    [string]$Email,
    [string]$Password
  )
  $serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
  if (-not $serviceKey) { $serviceKey = Read-DotEnvValue -Name "SUPABASE_SERVICE_ROLE_KEY" }
  if (-not $serviceKey) { $serviceKey = Read-DotEnvValue -Name "SUPABASE_SECRET_KEY" }
  $url = $env:SUPABASE_URL
  if (-not $url) { $url = Read-DotEnvValue -Name "VITE_SUPABASE_URL" }
  if (-not $serviceKey -or -not $url) {
    throw "Falta SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL no .env para criar user Auth automaticamente."
  }
  $body = @{
    email = $Email
    password = $Password
    email_confirm = $true
  } | ConvertTo-Json -Compress
  $headers = @{
    apikey = $serviceKey
    Authorization = "Bearer $serviceKey"
    "Content-Type" = "application/json"
  }
  $resp = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/admin/users" -Headers $headers -Body $body
  return $resp.id
}

Write-Host "=== I.S.O PRO - JWT servidor (automatizado) ===" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/5] Migrations..." -ForegroundColor Yellow
npx supabase db push

Write-Host ""
Write-Host "[2/5] Auth hook (config.toml)..." -ForegroundColor Yellow
npx supabase config push --yes

Write-Host ""
Write-Host "[3/5] Edge Function iso_pro_link_auth_user..." -ForegroundColor Yellow
npx supabase functions deploy iso_pro_link_auth_user --no-verify-jwt

Write-Host ""
Write-Host "[4/5] Secret ISO_PRO_LINK_AUTH_SECRET..." -ForegroundColor Yellow
$secretFile = Join-Path $root "release\ISO_PRO_LINK_AUTH_SECRET.txt"
if (-not (Test-Path (Split-Path $secretFile))) {
  New-Item -ItemType Directory -Path (Split-Path $secretFile) -Force | Out-Null
}
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $ActiveSecret = [Convert]::ToBase64String($bytes)
  Set-Content -Path $secretFile -Value $ActiveSecret -Encoding UTF8
  Write-Host "Novo secret gerado: $secretFile" -ForegroundColor Green
} else {
  $ActiveSecret = (Get-Content $secretFile -Raw).Trim()
  Write-Host "Secret existente reutilizado: $secretFile" -ForegroundColor DarkYellow
}
npx supabase secrets set "ISO_PRO_LINK_AUTH_SECRET=$ActiveSecret"

Write-Host ""
Write-Host "[5/5] Secret no snapshot (Configuracoes nuvem)..." -ForegroundColor Yellow
Sync-SecretToSnapshot -Secret $ActiveSecret

if ($AutoPiloto) {
  $login = if ($env:ISO_PRO_PILOTO_LOGIN) { $env:ISO_PRO_PILOTO_LOGIN } else { "admin" }
  $senha = $env:ISO_PRO_PILOTO_SENHA
  if (-not $senha) {
    throw "AutoPiloto: defina ISO_PRO_PILOTO_SENHA (mesma senha do utilizador no I.S.O PRO)."
  }
  $email = if ($env:ISO_PRO_PILOTO_EMAIL) { $env:ISO_PRO_PILOTO_EMAIL } else { "${login}@isopro.local" }
  Write-Host ""
  Write-Host "[AutoPiloto] Criar Auth user e ligar $login ..." -ForegroundColor Yellow
  $authId = New-AuthAdminUser -Email $email -Password $senha
  $env:ISO_PRO_PILOTO_AUTH_USER_ID = $authId
  $env:ISO_PRO_PILOTO_LOGIN = $login
  $LigarPiloto = $true
  Write-Host "Auth user criado: $authId" -ForegroundColor Green
}

if ($LigarPiloto) {
  $login = $env:ISO_PRO_PILOTO_LOGIN
  $authId = $env:ISO_PRO_PILOTO_AUTH_USER_ID
  if (-not $login -or -not $authId) {
    throw "LigarPiloto: defina ISO_PRO_PILOTO_LOGIN e ISO_PRO_PILOTO_AUTH_USER_ID."
  }
  $loginSql = $login -replace "'", "''"
  Write-Host ""
  Write-Host "[Piloto] Ligar $login -> $authId ..." -ForegroundColor Yellow
  $sql = @"
UPDATE public.usuarios_sistema
SET auth_user_id = '$authId'::uuid
WHERE tenant_id = '$TenantId'::uuid
  AND lower(login) = lower('$loginSql')
  AND coalesce(ativo, false) = true;
SELECT login, auth_user_id FROM public.usuarios_sistema
WHERE tenant_id = '$TenantId'::uuid AND lower(login) = lower('$loginSql');
SELECT * FROM public.iso_pro_auth_membership WHERE auth_user_id = '$authId'::uuid;
"@
  Invoke-RemoteSql -Sql $sql
  Write-Host "Piloto ligado na base." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Concluido no servidor ===" -ForegroundColor Green
Write-Host "Secret local: release\ISO_PRO_LINK_AUTH_SECRET.txt" -ForegroundColor Gray
Write-Host "Proximo passo: logout + login do piloto; validar Dispositivos mobile -> jwt_forte" -ForegroundColor Cyan
