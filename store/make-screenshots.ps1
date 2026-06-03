#!/usr/bin/env pwsh
# Converts the HTML mockups in store/assets/ into PNG screenshots ready for
# Chrome Web Store upload.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File store/make-screenshots.ps1
#   powershell ... -OnlyPromo                 # rebuild only the promo tiles
#
# Requires Google Chrome installed in a standard location.

[CmdletBinding()]
param(
  [switch]$OnlyPromo,
  [switch]$OnlyScreens
)

$ErrorActionPreference = 'Stop'
$root   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$assets = Join-Path $root 'store/assets'

# Find Chrome
$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "Google Chrome not found. Install it to run this script."
  exit 1
}
Write-Host "Using Chrome at: $chrome" -ForegroundColor Cyan

function Convert-Page {
  param([string]$Html, [int]$Width, [int]$Height)
  $abs = (Resolve-Path $Html).Path
  $uri = 'file:///' + ($abs -replace '\\','/' -replace ' ', '%20')
  $out = [System.IO.Path]::ChangeExtension($abs, '.png')
  if (Test-Path $out) { Remove-Item $out -Force }
  Write-Host "  → $($abs | Split-Path -Leaf)  [${Width}×${Height}]"

  # Each invocation gets its own throwaway profile dir to avoid singleton lock issues
  $profile = Join-Path $env:TEMP ("ais-chrome-" + [guid]::NewGuid().ToString('N'))
  $cmd = "& `"$chrome`" --headless=new --disable-gpu --hide-scrollbars --no-sandbox " +
         "--user-data-dir=`"$profile`" --default-background-color=00000000 " +
         "--window-size=$Width,$Height --screenshot=`"$out`" `"$uri`" 2>&1 | Out-Null"
  try {
    Invoke-Expression $cmd
  } catch { }   # suppress NativeCommandError — exit code 0 is success even if stderr was noisy
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $out)) {
    Write-Warning "  failed to produce $out"
  }
}

# === 5 screenshots, 1280×800 ===
if (-not $OnlyPromo) {
  Write-Host "`nProducing 5 Chrome Web Store screenshots (1280×800)…" -ForegroundColor Yellow
  foreach ($n in 1..5) {
    $h = Join-Path $assets ("ss-{0:00}.html" -f $n)
    if (Test-Path $h) { Convert-Page -Html $h -Width 1280 -Height 800 }
    else { Write-Warning "Missing $h" }
  }
}

# === Promo tiles ===
if (-not $OnlyScreens) {
  Write-Host "`nProducing CWS promo tiles…" -ForegroundColor Yellow
  $promos = @(
    @{ name='promo-small.html';   w=440;  h=280 },
    @{ name='promo-large.html';   w=920;  h=680 },
    @{ name='promo-marquee.html'; w=1400; h=560 }
  )
  foreach ($p in $promos) {
    $h = Join-Path $assets $p.name
    if (Test-Path $h) { Convert-Page -Html $h -Width $p.w -Height $p.h }
    else { Write-Warning "Missing $h" }
  }
}

# === Report ===
Write-Host ""
Write-Host "Done. PNG files in: $assets" -ForegroundColor Green
Get-ChildItem $assets -Filter '*.png' | Sort-Object Name | ForEach-Object {
  $kb = [math]::Round($_.Length / 1024, 1)
  Write-Host ("  {0,-25} {1,8} KB" -f $_.Name, $kb)
}

Write-Host ""
Write-Host "Upload these to Chrome Web Store:" -ForegroundColor Cyan
Write-Host "  - ss-01.png … ss-05.png  → Screenshots (1280×800)"
Write-Host "  - promo-small.png        → Small promo tile (optional)"
Write-Host "  - promo-large.png        → Large promo tile (optional)"
Write-Host "  - promo-marquee.png      → Marquee promo (optional, featured shelves)"
