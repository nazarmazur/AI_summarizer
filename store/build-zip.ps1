#!/usr/bin/env pwsh
# Build an AI Summarizer .zip ready to upload to the Chrome Web Store.
#
# Usage:
#   pwsh ./store/build-zip.ps1
#   pwsh ./store/build-zip.ps1 -Version 1.2.3 -Out dist
#
# What it does:
#   1. Validates extension/manifest.json (JSON parse + required fields).
#   2. Optionally bumps the version in manifest.json.
#   3. Sanity-checks that the pdfjs lib is either present or not referenced.
#   4. Copies extension/ to a temp staging dir, excluding dev files.
#   5. Zips the staging dir to dist/ai-summarizer-<version>.zip.
#   6. Prints the final size and SHA-256.

[CmdletBinding()]
param(
  [string]$Version,
  [string]$Out = 'dist'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ext  = Join-Path $root 'extension'
$manifestPath = Join-Path $ext 'manifest.json'

if (-not (Test-Path $manifestPath)) { throw "manifest.json not found at $manifestPath" }

# 1. Validate manifest
$raw = Get-Content $manifestPath -Raw -Encoding UTF8
$manifest = $raw | ConvertFrom-Json
foreach ($f in 'manifest_version','name','version','description') {
  if (-not $manifest.$f) { throw "manifest.json missing required field: $f" }
}

# 2. Bump version if requested
if ($Version) {
  if ($Version -notmatch '^\d+(\.\d+){0,3}$') {
    throw "Version must be 1-4 dot-separated numbers (e.g. 1.2.3). Got: $Version"
  }
  Write-Host "Bumping version $($manifest.version) -> $Version"
  $newRaw = $raw -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$Version`""
  Set-Content $manifestPath $newRaw -Encoding UTF8 -NoNewline
  $manifest = (Get-Content $manifestPath -Raw -Encoding UTF8) | ConvertFrom-Json
}
$ver = $manifest.version
Write-Host "Building AI Summarizer v$ver" -ForegroundColor Cyan

# 3. Sanity-check pdfjs files. If they're referenced in code but missing,
#    pdfjs PDF mode will fail at runtime — warn the developer.
$pdfjsDir = Join-Path $ext 'lib/pdfjs'
$hasMjs   = Test-Path (Join-Path $pdfjsDir 'pdf.min.mjs')
$hasWorker= Test-Path (Join-Path $pdfjsDir 'pdf.worker.min.mjs')
if (-not $hasMjs -or -not $hasWorker) {
  Write-Warning 'pdfjs files not found in lib/pdfjs/. pdfjs PDF mode will not work in this build.'
  Write-Warning 'See README "Підтримка PDF" section to bundle pdfjs-dist before publishing.'
}

# 4. Stage with exclusions
$stage = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP "ais-stage-$([guid]::NewGuid())")
try {
  Write-Host "Staging extension files at: $stage"

  $exclude = @(
    '*.map', '*.test.js', '*.spec.js',
    '.DS_Store', 'Thumbs.db',
    'node_modules', '.git', '.gitignore',
    '*.log', '*.tmp', '*.bak'
  )
  $robocopyArgs = @(
    "$ext", $stage.FullName,
    '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP',
    '/XD','node_modules','.git','dist',
    '/XF','*.map','*.test.js','*.spec.js','.DS_Store','Thumbs.db','*.log','*.tmp','*.bak'
  )
  & robocopy @robocopyArgs | Out-Null
  # robocopy returns 1 on success (files copied) — only fail on >= 8
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

  # 5. Zip
  $outDir = Join-Path $root $Out
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $zipPath = Join-Path $outDir "ai-summarizer-$ver.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Write-Host "Zipping -> $zipPath"
  Compress-Archive -Path (Join-Path $stage.FullName '*') -DestinationPath $zipPath -CompressionLevel Optimal

  # 6. Report
  $size = (Get-Item $zipPath).Length
  $sha  = (Get-FileHash $zipPath -Algorithm SHA256).Hash
  Write-Host ""
  Write-Host "✓ Built: $zipPath" -ForegroundColor Green
  Write-Host "  Size:   $([Math]::Round($size / 1024, 1)) KB"
  Write-Host "  SHA256: $sha"
  Write-Host ""
  Write-Host "Upload at: https://chrome.google.com/webstore/devconsole/" -ForegroundColor Cyan
}
finally {
  if (Test-Path $stage) { Remove-Item $stage.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}
