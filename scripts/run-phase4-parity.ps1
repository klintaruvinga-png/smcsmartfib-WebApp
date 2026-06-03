<#
.SYNOPSIS
    Phase 4 parity automation runner.

.DESCRIPTION
    Runs the Phase 4 fib parity gate from the repo root:
    1. Checks repo root and required dependencies.
    2. Resolves WordPress auth from SMC_BACKEND / SMC_WP_USER / SMC_APP_PW,
       or prompts with Get-Credential when credentials are missing.
    3. Exports MT5 fib levels through the existing backend fib-levels endpoint.
    4. Checks candle file presence and warns on stale candles.
    5. Runs the Pine v13 reference generator.
    6. Runs the parity validator.
    7. Writes timestamped JSON/Markdown gate artifacts and appends the tracker.

    Known limitation: candle export is a placeholder/manual step. The current
    backend MT5 export endpoint only returns fib levels, not the candle windows
    the EA used. Until a /candles endpoint or a separate export-mt5-candles.ps1
    exists, candle files must be placed manually in CandleDir before this runner
    executes. The staleness guard in the Pine generator will catch stale files
    before the validator runs.

    Requires: Node.js, PHP CLI, PowerShell 5.1+

.PARAMETER Backend
    Backend base URL. Defaults to SMC_BACKEND or https://trader.stokvelsociety.co.za.

.PARAMETER WpUser
    WordPress username. Defaults to SMC_WP_USER.

.PARAMETER AppPw
    WordPress application password. Defaults to SMC_APP_PW.

.PARAMETER CandleDir
    Directory containing {SYMBOL}_{TF}.json candle files. Default: data.

.PARAMETER ReportsDir
    Output directory for parity artifacts. Default: reports/phase4-parity.

.PARAMETER ExpandedAudit
    Also exports the expanded corpus (BTCUSD, NAS100). This does not affect the
    official 384-row gate, which remains EURUSD, USDJPY, XAUUSD only.

.PARAMETER NoPrompt
    Fails immediately if auth env vars are missing instead of showing Get-Credential.

.PARAMETER DryRun
    Runs preflight checks and the Pine generator only against existing candle and
    MT5 level files, skipping MT5 export and skipping validator/report writes.

.EXAMPLE
    # Full run using env vars
    $env:SMC_WP_USER = "admin"; $env:SMC_APP_PW = "xxxx xxxx"
    .\scripts\run-phase4-parity.ps1

.EXAMPLE
    # Dry run using existing candles
    .\scripts\run-phase4-parity.ps1 -DryRun

.EXAMPLE
    # Copilot/Codex slash command trigger
    # Run scripts/run-phase4-parity.ps1 from repo root using env vars SMC_BACKEND,
    # SMC_WP_USER, SMC_APP_PW. Do not modify source files. Stop if row counts are
    # not 384/384 or if the validator fails.
#>

[CmdletBinding()]
param(
    [string]$Backend = "",
    [string]$WpUser = "",
    [string]$AppPw = "",
    [string]$CandleDir = "data",
    [string]$ReportsDir = "reports/phase4-parity",
    [switch]$ExpandedAudit,
    [switch]$NoPrompt,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "[parity] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "  OK   $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "  WARN $Message" -ForegroundColor Yellow
}

function Write-Fail([string]$Message) {
    Write-Host "  FAIL $Message" -ForegroundColor Red
    exit 1
}

function Resolve-ConfigValue([string]$Value, [string]$EnvName, [string]$Fallback) {
    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }

    $envValue = [Environment]::GetEnvironmentVariable($EnvName)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }

    return $Fallback
}

function ConvertTo-AbsolutePath([string]$PathValue) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function ConvertTo-CommandLineArgument([string]$Argument) {
    if ($Argument.Length -gt 0 -and -not [regex]::IsMatch($Argument, '[\s"]')) {
        return $Argument
    }

    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $slashes = 0

    foreach ($char in $Argument.ToCharArray()) {
        if ($char -eq '\') {
            $slashes++
            continue
        }

        if ($char -eq '"') {
            [void]$builder.Append(('\' * (($slashes * 2) + 1)))
            [void]$builder.Append('"')
            $slashes = 0
            continue
        }

        if ($slashes -gt 0) {
            [void]$builder.Append(('\' * $slashes))
            $slashes = 0
        }
        [void]$builder.Append($char)
    }

    if ($slashes -gt 0) {
        [void]$builder.Append(('\' * ($slashes * 2)))
    }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Start-ExternalCommand([string]$Command, [string[]]$Arguments) {
    $commandInfo = Get-Command $Command -ErrorAction Stop
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $commandInfo.Source
    $psi.Arguments = (($Arguments | ForEach-Object { ConvertTo-CommandLineArgument $_ }) -join ' ')
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        Write-Host $stdout
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        Write-Host $stderr
    }

    return $process.ExitCode
}

function Invoke-ExternalCommand([string]$Command, [string[]]$Arguments, [string]$FailureMessage) {
    $exitCode = Start-ExternalCommand $Command $Arguments
    if ($exitCode -ne 0) {
        Write-Fail "$FailureMessage (exit code $exitCode)"
    }
}

function Get-CandleLastUtc([string]$PathValue) {
    try {
        $candles = Get-Content -LiteralPath $PathValue -Raw | ConvertFrom-Json
    } catch {
        Write-Warn "Could not parse candle file for freshness warning: $PathValue"
        return $null
    }

    if ($null -eq $candles) {
        Write-Warn "Empty candle file: $PathValue"
        return $null
    }

    $latest = $null
    foreach ($candle in @($candles)) {
        $rawTime = $null
        foreach ($name in @("time", "timestamp", "ts", "t")) {
            if ($candle.PSObject.Properties.Name -contains $name) {
                $rawTime = $candle.$name
                break
            }
        }

        if ($null -eq $rawTime) {
            continue
        }

        $candidate = $null
        $numericTime = 0.0
        if ([double]::TryParse([string]$rawTime, [ref]$numericTime)) {
            if ($numericTime -lt 1000000000000) {
                $candidate = [DateTimeOffset]::FromUnixTimeSeconds([int64]$numericTime).UtcDateTime
            } else {
                $candidate = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$numericTime).UtcDateTime
            }
        } else {
            $parsed = [DateTime]::MinValue
            if ([DateTime]::TryParse([string]$rawTime, [ref]$parsed)) {
                $candidate = $parsed.ToUniversalTime()
            }
        }

        if ($null -ne $candidate -and ($null -eq $latest -or $candidate -gt $latest)) {
            $latest = $candidate
        }
    }

    return $latest
}

function Test-CandleFiles([string]$CandleRoot, [string[]]$Symbols, [DateTime]$ReferenceUtc) {
    Write-Step "Checking candle files (manual step until /candles endpoint exists)"
    Write-Warn "Candle export is a manual step: place {SYMBOL}_{TF}.json files in $CandleRoot until /candles endpoint or export-mt5-candles.ps1 exists."
    Write-Warn "The staleness guard in the Pine generator will hard-fail stale files before the validator runs."

    $timeframes = @("M15", "H1", "H4", "D1")
    $staleWindows = @{
        M15 = New-TimeSpan -Minutes 15
        H1 = New-TimeSpan -Hours 1
        H4 = New-TimeSpan -Hours 4
        D1 = New-TimeSpan -Days 1
    }

    $allPresent = $true
    foreach ($sym in $Symbols) {
        foreach ($tf in $timeframes) {
            $fileName = "${sym}_${tf}.json"
            $pathValue = Join-Path $CandleRoot $fileName
            if (-not (Test-Path -LiteralPath $pathValue)) {
                Write-Warn "Missing candle file: $pathValue"
                $allPresent = $false
                continue
            }

            $lastUtc = Get-CandleLastUtc $pathValue
            if ($null -eq $lastUtc) {
                Write-Warn "No valid candle timestamp found in $pathValue"
                continue
            }

            $maxAge = $staleWindows[$tf]
            if ($lastUtc -lt $ReferenceUtc.Subtract($maxAge)) {
                Write-Warn ("Possibly stale candle file: {0} last={1:o} reference={2:o} max_gap={3}s" -f $pathValue, $lastUtc, $ReferenceUtc, [int]$maxAge.TotalSeconds)
            } else {
                Write-Ok ("Candle freshness warning check passed: {0} last={1:o}" -f $fileName, $lastUtc)
            }
        }
    }

    if (-not $allPresent) {
        Write-Warn "Some candle files are missing. The Pine generator is expected to fail until candles are exported manually."
    }
}

Write-Step "Checking repo root"
if (-not (Test-Path -LiteralPath "mt5/FibEngine.mqh")) {
    Write-Fail "Must be run from repo root (mt5/FibEngine.mqh not found)"
}
if (-not (Test-Path -LiteralPath "scripts/generate-pine-levels-v13.cjs")) {
    Write-Fail "Pine generator not found at scripts/generate-pine-levels-v13.cjs"
}
if (-not (Test-Path -LiteralPath "scripts/parity-validator.php")) {
    Write-Fail "Parity validator not found at scripts/parity-validator.php"
}
Write-Ok "Repo root confirmed"

Write-Step "Checking dependencies"
foreach ($cmd in @("node", "php")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "$cmd not found in PATH"
    }
    Write-Ok "$cmd found"
}

$Backend = Resolve-ConfigValue $Backend "SMC_BACKEND" "https://trader.stokvelsociety.co.za"
$WpUser = Resolve-ConfigValue $WpUser "SMC_WP_USER" ""
$AppPw = Resolve-ConfigValue $AppPw "SMC_APP_PW" ""

$reportsRoot = ConvertTo-AbsolutePath $ReportsDir
$candleRoot = ConvertTo-AbsolutePath $CandleDir
New-Item -ItemType Directory -Path $reportsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $candleRoot -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$officialSymbols = @("EURUSD", "USDJPY", "XAUUSD")
$expandedSymbols = @("EURUSD", "USDJPY", "XAUUSD", "BTCUSD", "NAS100")
$symbols = if ($ExpandedAudit) { $expandedSymbols } else { $officialSymbols }

$mt5LevelsFile = Join-Path $reportsRoot "mt5-levels.json"
$mt5ExpandedFile = Join-Path $reportsRoot "mt5-levels-expanded.json"
$pineLevelsFile = Join-Path $reportsRoot "pine-levels.json"
$mt5Rows = 0

if (-not $DryRun) {
    Write-Step "Resolving auth"
    if ([string]::IsNullOrWhiteSpace($WpUser) -or [string]::IsNullOrWhiteSpace($AppPw)) {
        if ($NoPrompt) {
            Write-Fail "Auth env vars SMC_WP_USER / SMC_APP_PW not set and -NoPrompt is active"
        }

        Write-Warn "Auth env vars not set; showing secure Get-Credential prompt"
        $credential = Get-Credential -Message "Enter WordPress username and application password"
        if ($null -eq $credential) {
            Write-Fail "Credential prompt cancelled"
        }
        $WpUser = $credential.UserName
        $AppPw = $credential.GetNetworkCredential().Password
    }
    Write-Ok "Auth resolved for user: $WpUser"

    Write-Step "Exporting MT5 fib levels (symbols: $($symbols -join ', '))"
    $pair = "${WpUser}:${AppPw}"
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    $headers = @{ Authorization = "Basic $basic" }
    $combined = New-Object System.Collections.Generic.List[object]

    foreach ($sym in $symbols) {
        Write-Host "  Fetching $sym..."
        $url = "$Backend/wp-json/sniper/v1/market-data/fib-levels?symbol=$sym"
        try {
            $response = Invoke-RestMethod -Uri $url -Headers $headers -Method GET -ErrorAction Stop
        } catch {
            Write-Fail "MT5 export failed for ${sym}: $($_.Exception.Message)"
        }

        $rawFile = Join-Path $reportsRoot "mt5-${sym}-raw.json"
        $response | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $rawFile -Encoding UTF8

        if (-not $response.fibs) {
            Write-Fail "No fibs in response for $sym"
        }

        foreach ($tfProp in $response.fibs.PSObject.Properties) {
            $tf = $tfProp.Name
            foreach ($familyProp in $tfProp.Value.PSObject.Properties) {
                $family = $familyProp.Name
                foreach ($level in @($familyProp.Value)) {
                    $combined.Add([PSCustomObject]@{
                        symbol = $sym
                        timeframe = $tf
                        family = $family
                        ratio = [double]$level.ratio
                        price = [double]$level.price
                    })
                }
            }
        }
    }

    $official = @($combined | Where-Object { $officialSymbols -contains $_.symbol })
    $official |
        Sort-Object symbol, timeframe, family, ratio |
        ConvertTo-Json -Depth 10 |
        Set-Content -LiteralPath $mt5LevelsFile -Encoding UTF8

    $mt5Rows = @($official).Count
    Write-Ok "MT5 official: $mt5Rows rows -> $mt5LevelsFile"
    if ($mt5Rows -ne 384) {
        Write-Fail "MT5 official row count $mt5Rows != 384"
    }

    if ($ExpandedAudit) {
        $combined |
            Sort-Object symbol, timeframe, family, ratio |
            ConvertTo-Json -Depth 10 |
            Set-Content -LiteralPath $mt5ExpandedFile -Encoding UTF8
        Write-Ok "MT5 expanded: $($combined.Count) rows -> $mt5ExpandedFile"
    }

    $referenceUtc = (Get-Item -LiteralPath $mt5LevelsFile).LastWriteTimeUtc
    Test-CandleFiles $candleRoot $officialSymbols $referenceUtc
} else {
    Write-Step "DryRun mode - skipping MT5 export"
    if (-not (Test-Path -LiteralPath $mt5LevelsFile)) {
        Write-Fail "DryRun: no existing MT5 levels file at $mt5LevelsFile"
    }

    $existingMt5 = Get-Content -LiteralPath $mt5LevelsFile -Raw | ConvertFrom-Json
    $mt5Rows = @($existingMt5).Count
    Write-Ok "Using existing MT5 levels: $mt5LevelsFile ($mt5Rows rows)"

    $referenceUtc = (Get-Item -LiteralPath $mt5LevelsFile).LastWriteTimeUtc
    Test-CandleFiles $candleRoot $officialSymbols $referenceUtc
}

Write-Step "Generating Pine v13-compatible reference levels"
$nodeArgs = @(
    (Join-Path "scripts" "generate-pine-levels-v13.cjs"),
    "--candle-dir", $candleRoot,
    "--mt5-file", $mt5LevelsFile
)
Invoke-ExternalCommand "node" $nodeArgs "Pine generator failed"

if (-not (Test-Path -LiteralPath $pineLevelsFile)) {
    Write-Fail "Pine generator did not produce output file: $pineLevelsFile"
}

$pineRows = @((Get-Content -LiteralPath $pineLevelsFile -Raw | ConvertFrom-Json)).Count
Write-Ok "Pine levels: $pineRows rows -> $pineLevelsFile"
if ($pineRows -ne 384) {
    Write-Fail "Pine row count $pineRows != 384"
}

if ($DryRun) {
    Write-Step "DryRun mode - skipping validator and report writes"
    Write-Ok "Pine generator produced $pineRows rows. Run without -DryRun for full gate."
    Write-Step "Done"
    exit 0
}

Write-Step "Running parity validator"
$gateFile = Join-Path $reportsRoot "phase4-gate-${timestamp}.json"
$phpArgs = @(
    (Join-Path "scripts" "parity-validator.php"),
    "--mt5-file", $mt5LevelsFile,
    "--pine-file", $pineLevelsFile,
    "--out", $gateFile
)
$validatorExitCode = Start-ExternalCommand "php" $phpArgs

if (-not (Test-Path -LiteralPath $gateFile)) {
    Write-Fail "Validator exited non-zero and did not produce gate file: $gateFile"
}

$gate = Get-Content -LiteralPath $gateFile -Raw | ConvertFrom-Json
$gateStatus = [string]$gate.gate
$parityPct = $gate.overall_parity_pct
Write-Ok "Gate JSON produced: $gateStatus ($parityPct% parity) -> $gateFile"

Write-Step "Writing Markdown gate report"
$mdFile = Join-Path $reportsRoot "phase4-gate-${timestamp}.md"
$criticalLines = "_None_"
if ([int]$gate.critical_mismatches_count -gt 0) {
    $criticalLines = ($gate.critical_mismatches | ForEach-Object {
        "- $($_.symbol) $($_.timeframe) $($_.family) ratio=$($_.ratio) mt5=$($_.mt5_price) pine=$($_.pine_price)"
    }) -join [Environment]::NewLine
}

$markdown = @"
# Phase 4 Parity Gate - $timestamp

| Field | Value |
| --- | --- |
| Gate | $gateStatus |
| Parity % | $parityPct |
| Total tuples | $($gate.total_tuples) |
| Exact matches | $($gate.exact_matches) |
| Critical mismatches | $($gate.critical_mismatches_count) |
| MT5 rows | $mt5Rows |
| Pine rows | $pineRows |
| MT5 file | $(Split-Path $mt5LevelsFile -Leaf) |
| Pine file | $(Split-Path $pineLevelsFile -Leaf) |

## Critical mismatches

$criticalLines
"@
$markdown | Set-Content -LiteralPath $mdFile -Encoding UTF8
Write-Ok "Markdown report -> $mdFile"

$trackerFile = "reports/fib-parity-validation.md"
if (Test-Path -LiteralPath $trackerFile) {
    $trackerEntry = @"

## Run: $timestamp
- Gate: **$gateStatus** ($parityPct%)
- MT5: $mt5Rows rows ($(Split-Path $mt5LevelsFile -Leaf))
- Pine: $pineRows rows ($(Split-Path $pineLevelsFile -Leaf))
- Report: $(Split-Path $gateFile -Leaf)
"@
    Add-Content -LiteralPath $trackerFile -Value $trackerEntry -Encoding UTF8
    Write-Ok "Updated tracker: $trackerFile"
} else {
    Write-Warn "Tracker not found at reports/fib-parity-validation.md; skipping update"
}

if ($validatorExitCode -ne 0) {
    Write-Fail "Validator exited non-zero (gate FAIL or input error; exit code $validatorExitCode)"
}

if ($gateStatus -ne "PASS") {
    Write-Fail "Gate: FAIL ($parityPct% parity) - see $gateFile for mismatches"
}

Write-Step "Done"
