# Gera apresentacao-iso-pro-slides-embedded.html com imagens de apresentacao-assets embutidas (base64).
$ErrorActionPreference = "Stop"
$docs = $PSScriptRoot
$htmlPath = Join-Path $docs "apresentacao-iso-pro-slides.html"
$outPath = Join-Path $docs "apresentacao-iso-pro-slides-embedded.html"
$assets = Join-Path $docs "apresentacao-assets"

$html = [System.IO.File]::ReadAllText($htmlPath, [System.Text.UTF8Encoding]::new($false))

function Get-Mime([string]$path) {
  $e = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($e -eq ".jpg" -or $e -eq ".jpeg") { return "image/jpeg" }
  return "image/png"
}

$matches = [regex]::Matches($html, 'src="apresentacao-assets/([^"]+)"')
$rels = [System.Collections.Generic.HashSet[string]]::new()
foreach ($m in $matches) { [void]$rels.Add($m.Groups[1].Value) }

foreach ($enc in $rels) {
  $leaf = [Uri]::UnescapeDataString($enc)
  $full = Join-Path $assets $leaf
  if (-not (Test-Path -LiteralPath $full)) {
    Write-Warning "Ficheiro em falta: $leaf"
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes($full)
  $b64 = [Convert]::ToBase64String($bytes)
  $mime = Get-Mime $full
  $dataUri = "data:$mime;base64,$b64"
  $old = 'src="apresentacao-assets/' + $enc + '"'
  $new = 'src="' + $dataUri + '"'
  $html = $html.Replace($old, $new)
}

$html = [regex]::Replace($html, '\s+data-fallback="[^"]*"', '')

$i1 = $html.IndexOf("      function buildCandidateList")
$i2 = $html.IndexOf("      var slides =")
if ($i1 -lt 0 -or $i2 -lt 0) {
  throw "Nao encontrei o bloco JS (buildCandidateList / var slides). Atualize o script."
}

$replacement = @"
      function initAssetSlots() {
        document.querySelectorAll(".asset-slot").forEach(function (slot) {
          var img = slot.querySelector("img.shot");
          if (!img) return;
          function markLoaded() {
            slot.classList.add("loaded");
          }
          img.addEventListener("load", markLoaded);
          if (img.complete && img.naturalWidth > 0) markLoaded();
          else if (img.decode) {
            img.decode().then(markLoaded).catch(function () {});
          }
        });
        setTimeout(function () {
          document.querySelectorAll(".asset-slot").forEach(function (slot) {
            var img = slot.querySelector("img.shot");
            if (!img || !img.complete) return;
            if (img.naturalWidth > 0 || img.naturalHeight > 0) slot.classList.add("loaded");
          });
        }, 400);
      }


"@

$html = $html.Substring(0, $i1) + $replacement + $html.Substring($i2)

$html = $html.Replace("<title>", "<title>[EMBUTIDAS] ")

[System.IO.File]::WriteAllText($outPath, $html, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: $outPath"
Write-Host ("Tamanho: {0:N0} bytes" -f (Get-Item -LiteralPath $outPath).Length)
