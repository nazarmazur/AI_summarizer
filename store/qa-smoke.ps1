#!/usr/bin/env pwsh
# Manual smoke-test helper.
#
# Loads the extension in a fresh Chrome profile and opens the key URLs you
# need to click through before submitting v1.0.0. Each test is described in
# the console — work through them in order.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File store/qa-smoke.ps1

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ext  = Join-Path $root 'extension'
$prof = Join-Path $env:TEMP 'ais-qa-profile'

if (-not (Test-Path $ext)) { Write-Error "extension/ not found"; exit 1 }

# Clean profile so onboarding fires fresh
if (Test-Path $prof) { Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $prof | Out-Null

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error "Chrome not found"; exit 1 }

Write-Host ""
Write-Host "═════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AI Summarizer v1.0.0 — QA Smoke Test" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Going to launch Chrome with:" -ForegroundColor Yellow
Write-Host "  - Fresh user profile at $prof"
Write-Host "  - Extension loaded from $ext"
Write-Host ""
Write-Host "Run through this checklist, in order:" -ForegroundColor Yellow
Write-Host ""
Write-Host "[1] Onboarding"   -ForegroundColor White
Write-Host "    □ Wizard auto-opens"
Write-Host "    □ Step 1: 'Get started' works"
Write-Host "    □ Step 2: picks 'API key' → key fields visible"
Write-Host "    □ Step 2: 'Pool' option is HIDDEN (free release mode)"
Write-Host "    □ Step 3: demo summary streams in"
Write-Host "    □ Step 4: 'Finish' closes tab"
Write-Host ""
Write-Host "[2] YouTube"      -ForegroundColor White
Write-Host "    □ Sidebar card appears in #secondary on any /watch URL"
Write-Host "    □ 'AI Summarize' button appears next to Subscribe"
Write-Host "    □ Picking 'Сводка' streams a summary"
Write-Host "    □ 'Тайм-коди' works, no PRO badge visible"
Write-Host "    □ Q&A box appears after summary; ask a follow-up"
Write-Host ""
Write-Host "[3] Web article"  -ForegroundColor White
Write-Host "    □ Floating button bottom-right appears on theverge.com"
Write-Host "    □ Click → panel opens with URL pre-filled"
Write-Host "    □ Summary streams"
Write-Host ""
Write-Host "[4] PDF"          -ForegroundColor White
Write-Host "    □ Open https://arxiv.org/pdf/1706.03762"
Write-Host "    □ Floating button → panel"
Write-Host "    □ Summary streams (requires Gemini API key in BYOK mode)"
Write-Host ""
Write-Host "[5] History"      -ForegroundColor White
Write-Host "    □ Click history icon in popup → history.html opens"
Write-Host "    □ Recent entries visible (local storage)"
Write-Host "    □ Click entry → full summary on right"
Write-Host "    □ Delete works"
Write-Host "    □ Download .md works"
Write-Host ""
Write-Host "[6] Options"      -ForegroundColor White
Write-Host "    □ Billing card is HIDDEN (free release mode)"
Write-Host "    □ Pool source radio is HIDDEN"
Write-Host "    □ API keys persist after Save"
Write-Host ""
Write-Host "[8] Dark mode"    -ForegroundColor White
Write-Host "    □ Switch YouTube to dark theme"
Write-Host "    □ Sidebar card adopts dark colors"
Write-Host "    □ Floating panel on dark sites also dark"
Write-Host ""
Write-Host "Press any key to launch Chrome…" -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

# Use Start-Process so we don't get tripped up by Chrome's stderr noise
$args = @(
  "--user-data-dir=$prof",
  "--load-extension=$ext",
  "--disable-extensions-except=$ext",
  "--no-first-run",
  "--no-default-browser-check",
  "chrome://extensions/",
  "https://www.youtube.com/watch?v=jvFenJxHQVw",
  "https://www.theverge.com/",
  "https://arxiv.org/pdf/1706.03762"
)
Start-Process -FilePath $chrome -ArgumentList $args -WorkingDirectory $env:TEMP
Write-Host ""
Write-Host "Chrome launched. Walk through the checklist above." -ForegroundColor Green
Write-Host "When done, close Chrome — the test profile in $prof can be deleted any time."
