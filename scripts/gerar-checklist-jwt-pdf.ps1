# Gera PDF do checklist JWT (Edge/Chrome headless) ou abre HTML para impressao manual.
param(
  [string]$Saida = "",
  [switch]$AbrirHtml
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$htmlDocs = Join-Path $root "docs\checklist-ativacao-jwt.html"
$htmlPublic = Join-Path $root "public\checklist-ativacao-jwt.html"

if (-not (Test-Path $htmlDocs)) {
  throw "Ficheiro nao encontrado: $htmlDocs"
}

# Manter public/ sincronizado com docs/ (servido no deploy web).
Copy-Item -Path $htmlDocs -Destination $htmlPublic -Force

if ($AbrirHtml) {
  Start-Process $htmlDocs
  Write-Host "HTML aberto. Use 'Guardar PDF / Imprimir' na pagina."
  exit 0
}

if (-not $Saida) {
  $Saida = Join-Path $root "release\CHECKLIST-ATIVACAO-JWT.pdf"
}

$outDir = Split-Path -Parent $Saida
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$uri = [Uri]::new($htmlDocs).AbsoluteUri
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)

$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
  Write-Warning "Edge/Chrome nao encontrado. Abrindo HTML para impressao manual..."
  Start-Process $htmlDocs
  exit 1
}

& $exe --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$Saida" $uri 2>$null
Start-Sleep -Seconds 2

if (Test-Path $Saida) {
  Write-Host "PDF gerado: $Saida"
  exit 0
}

Write-Warning "Falha ao gerar PDF automaticamente. Abrindo HTML..."
Start-Process $htmlDocs
exit 1
