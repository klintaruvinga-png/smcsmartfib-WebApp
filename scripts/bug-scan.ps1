# SMC SuperFIB Daily Bug Scan
# Run via Task Scheduler at 11PM:
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bug-scan.ps1

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting SMC SuperFIB Daily Bug Scan..." -ForegroundColor Cyan
$failed = $false

# 1. Run Parity Gate
Write-Host "[1/3] Running Parity Gate..."
npm run parity:dry
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Parity Gate failed with exit code $LASTEXITCODE" -ForegroundColor Red
    $failed = $true
}

# 2. Check for known fragile patterns
Write-Host "[2/3] Checking for fragile code patterns..."
$fragilePatterns = @(
    'substr\(\$sym, -3\) === ''JPY''',
    'symbol == "XAUUSD"',
    'preg_replace\(''/\[\^A-Z0-9\]/'', '''
)

foreach ($pattern in $fragilePatterns) {
    $patternMatches = Get-ChildItem -Recurse -Include *.php, *.mqh, *.ts, *.tsx -Exclude "bug-scan.ps1" | Select-String -Pattern $pattern
    if ($patternMatches) {
        Write-Host "FAIL: Found fragile pattern: $pattern" -ForegroundColor Red
        $patternMatches | ForEach-Object { Write-Host "  $($_.FileName):$($_.LineNumber)" }
        $failed = $true
    } else {
        Write-Host "PASS: Pattern not found: $pattern" -ForegroundColor Green
    }
}

# 3. Check for stale data
Write-Host "[3/3] Checking data freshness..."
node scripts/generate-pine-levels-v13.cjs --dry-run
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Data freshness check failed with exit code $LASTEXITCODE" -ForegroundColor Red
    $failed = $true
}

if ($failed) {
    Write-Host "Bug scan FAILED." -ForegroundColor Red
    exit 1
} else {
    Write-Host "Bug scan PASSED." -ForegroundColor Green
    exit 0
}
