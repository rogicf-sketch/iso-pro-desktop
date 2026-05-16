# Executar na pasta docs:  .\remap-apresentacao-assets-ordem-menu.ps1
# Copia os PNG antigos (nomes slide-01...18) para os nomes do novo deck (ordem do menu).
$ErrorActionPreference = "Stop"
$assets = Join-Path $PSScriptRoot "apresentacao-assets"
if (-not (Test-Path -LiteralPath $assets)) {
  Write-Host "Pasta nao encontrada: $assets"
  exit 1
}

function Copy-Map($src, $dst) {
  if ($src -eq $dst) {
    Write-Host "SKIP (igual) $dst"
    return
  }
  $from = Join-Path $assets $src
  $to = Join-Path $assets $dst
  if (Test-Path -LiteralPath $from) {
    Copy-Item -LiteralPath $from -Destination $to -Force
    Write-Host "OK $dst <- $src"
  } else {
    Write-Host "SKIP (falta $src) -> $dst"
  }
}

Copy-Map "slide-18-cta.png"            "slide-02-login.png"
Copy-Map "slide-04-painel.png"        "slide-03-painel.png"
Copy-Map "slide-01-obra.png"          "slide-04-fornecedores.png"
Copy-Map "slide-03-problema.png"      "slide-05-colaboradores.png"
Copy-Map "slide-07-materiais.png"     "slide-06-materiais.png"
Copy-Map "slide-07-planejamento.png"  "slide-07-planejamento.png"  # no-op: mantem ficheiro
Copy-Map "slide-06-recebimentos.png"  "slide-08-recebimentos.png"
Copy-Map "slide-09-etiquetas.png"     "slide-10-etiquetas.png"
Copy-Map "slide-11-desktop.png"       "slide-11-atendimento.png"
Copy-Map "slide-09-inventario.png"    "slide-12-inventario.png"
Copy-Map "slide-08-rir.png"           "slide-14-rir.png"
Copy-Map "slide-08-rnc.png"           "slide-15-rnc.png"
Copy-Map "slide-12-relatorios.png"    "slide-16-relatorios.png"
Copy-Map "slide-13-rel-foto.png"      "slide-17-rel-fotografico.png"
Copy-Map "slide-16-usuarios.png"      "slide-19-usuarios.png"
Copy-Map "slide-14-config.png"        "slide-21-configuracoes.png"
Copy-Map "slide-07-planejamento.png"  "slide-22-tema-neon.png"
Copy-Map "slide-07-materiais.png"     "slide-22-tema-azul.png"
Copy-Map "slide-05-mobile.png"        "slide-23-mobile-campo.png"
Copy-Map "slide-18-cta.png"           "slide-24-cta.png"

Write-Host "`nAdicione manualmente (captura real) se ainda nao existirem:"
Write-Host "  slide-09-conferencia.png"
Write-Host "  slide-13-equipamentos.png"
Write-Host "  slide-18-dispositivos-mobile.png"
Write-Host "  slide-20-licencas-desktop.png"
Write-Host "Opcional: slide-01-capa.png (foto de obra / abertura)"
