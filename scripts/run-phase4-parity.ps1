<#
.SYNOPSIS
    Phase 4 parity automation runner.

.DESCRIPTION
    Runs the Phase 4 fib parity gate from the repo root:
    1. Checks repo root and required dependencies.
    2. Resolves WordPress auth from SMC_BACKEND / SMC_WP_USER / SMC_APP_PW,
       or prompts with Get-Credential when credentials are missing.
    3. Exports MT5 fib levels through the existing backend fib-levels endpoint.
    4. Exports fresh MT5 candles through scripts/export-mt5-candles.ps1.
    5. Checks candle file presence and warns on stale candles.
    6. Runs the Pine v13 reference generator.
    7. Runs the parity validator.
    8. Writes timestamped JSON/Markdown gate artifacts and appends the tracker.

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
    Requires WordPress auth, then runs preflight checks and the Pine generator only
    against existing candle and MT5 level files, skipping MT5 export and skipping
    validator/report writes.

.PARAMETER SkipCandleExport
    Skips remote candle export and uses existing CandleDir files.

.PARAMETER CandleLimit
    Number of candles to request per symbol/timeframe from the backend candle endpoint.

.PARAMETER Symbols
    Override the symbol list (PowerShell string array).
    Default: EURUSD USDJPY XAUUSD. Use when broker does not support all default symbols.
    e.g. -Symbols EURUSD,USDJPY

.PARAMETER Timeframes
    Override the output timeframe list for MT5 row filtering and Pine generation.
    Default: M15 H1 H4 D1. Pine helper candles are derived from exported M15 source candles.
    e.g. -Timeframes M15

.EXAMPLE
    # Full run using env vars (diagnostic lane - EA direct output)
    $env:SMC_WP_USER = "admin"; $env:SMC_APP_PW = "xxxx xxxx"
    .\scripts\run-phase4-parity.ps1

.EXAMPLE
    # Official Phase 4 parity gate - backend derives all TFs from MT5 M15 candles
    # to match Pine v13 reference. Use this for gate-blocking comparison.
    $env:SMC_WP_USER = "admin"; $env:SMC_APP_PW = "xxxx xxxx"
    .\scripts\run-phase4-parity.ps1 -BackendMode pine_compatible -NoPrompt

.EXAMPLE
    # Dry run using existing candles
    .\scripts\run-phase4-parity.ps1 -DryRun

.EXAMPLE
    # Copilot/Codex slash command trigger
    # Run scripts/run-phase4-parity.ps1 from repo root using env vars SMC_BACKEND,
    # SMC_WP_USER, SMC_APP_PW. Do not modify source files. Stop if MT5 row counts
    # are incomplete, Pine rows are below the partial-output floor, or the validator fails.
#>

[CmdletBinding()]
param(
    [string]$Backend = "",
    [string]$WpUser = "",
    [string]$AppPw = "",
    [string]$CandleDir = "data",
    [string]$ReportsDir = "reports/phase4-parity",
    [int]$CandleLimit = 600,
    [string[]]$Symbols    = @(),
    [string[]]$Timeframes = @(),
    [switch]$ExpandedAudit,
    [switch]$NoPrompt,
    [switch]$DryRun,
    [switch]$SkipCandleExport,

    # Controls which backend lane is used when fetching fib levels.
    # "pine_compatible" is the official parity gate (backend derives all TFs from MT5 M15 candles,
    # mirroring generate-pine-levels-v13.cjs). "direct" returns stored EA output for diagnostics.
    # Default is "direct" for backward compatibility.
    [ValidateSet("direct", "pine_compatible")]
    [string]$BackendMode = "direct"
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

function Write-JsonFile([string]$PathValue, $Value) {
    $json = $Value | ConvertTo-Json -Depth 20
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($PathValue, $json, $utf8)
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

function Test-CandleFiles([string]$CandleRoot, [string[]]$Symbols, [string[]]$ActiveTimeframes, [DateTime]$ReferenceUtc) {
    Write-Step "Checking candle files"
    Write-Warn "The staleness guard in the Pine generator will hard-fail stale files before the validator runs."

    $staleWindows = @{
        M15 = New-TimeSpan -Minutes 15
        H1  = New-TimeSpan -Hours 1
        H4  = New-TimeSpan -Hours 4
        D1  = New-TimeSpan -Days 1
    }

    $allPresent = $true
    foreach ($sym in $Symbols) {
        foreach ($tf in $ActiveTimeframes) {
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

            $maxAge = if ($staleWindows.ContainsKey($tf)) { $staleWindows[$tf] } else { New-TimeSpan -Hours 1 }
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

function Get-RequiredM15CandleLimit([string[]]$OutputTimeframes) {
    $normalized = $OutputTimeframes | ForEach-Object { $_.Trim().ToUpperInvariant() }
    if ($normalized -contains "D1") { return 60000 }
    if ($normalized -contains "H4") { return 25000 }
    if ($normalized -contains "H1") { return 10000 }
    return 2000
}

function Get-ObjectPropertyValue($Object, [string]$Name) {
    if ($null -eq $Object) {
        return $null
    }
    if ($Object -is [hashtable] -and $Object.ContainsKey($Name)) {
        return $Object[$Name]
    }
    if ($Object.PSObject.Properties.Name -contains $Name) {
        return $Object.$Name
    }
    return $null
}

function Get-SessionTfForTimeframe([string]$Timeframe) {
    switch ($Timeframe.ToUpperInvariant()) {
        "M15" { return "Daily" }
        "H1"  { return "Weekly" }
        "H4"  { return "Monthly" }
        "D1"  { return "Quarterly" }
        default { return $null }
    }
}

function Get-AuthorityTfForSessionTf([string]$SessionTf) {
    switch ($SessionTf) {
        "Daily"     { return "Weekly" }
        "Weekly"    { return "Monthly" }
        "Monthly"   { return "Quarterly" }
        "Quarterly" { return "Yearly" }
        default     { return $null }
    }
}

function Get-CompressionThreshold([string]$Symbol) {
    $pipSize = 0.0001
    if ($Symbol -match "JPY$" -or $Symbol -eq "XAUUSD" -or $Symbol -eq "XAGUSD") {
        $pipSize = 0.01
    }
    $minPips = if ($Symbol -match "JPY$") { 40.0 } else { 20.0 }
    return $pipSize * $minPips
}

function Get-LevelPrice($Levels, [double]$Ratio) {
    foreach ($level in @($Levels)) {
        if ([Math]::Abs(([double]$level.ratio) - $Ratio) -lt 0.0000001) {
            return [double]$level.price
        }
    }
    return $null
}

function New-EmptyAnchorComponent([string]$Slot, $Key, $Weight) {
    return [PSCustomObject]@{
        slot             = $Slot
        key              = $Key
        high             = $null
        low              = $null
        range            = $null
        compression_pass = $null
        weight           = $Weight
        candle_count     = $null
        first_candle     = ""
        last_candle      = ""
    }
}

function ConvertTo-AnchorComponents($Debug) {
    $components = Get-ObjectPropertyValue $Debug "components"
    if ($null -ne $components) {
        return @($components)
    }

    return @(
        (New-EmptyAnchorComponent "F1" (Get-ObjectPropertyValue $Debug "ltf_f1_key") $null),
        (New-EmptyAnchorComponent "F2" (Get-ObjectPropertyValue $Debug "ltf_f2_key") $null),
        (New-EmptyAnchorComponent "F3" (Get-ObjectPropertyValue $Debug "ltf_f3_key") $null)
    )
}

function New-Mt5AnchorDebugRecord([string]$Symbol, [string]$Timeframe, [string]$Family, $Levels, $Debug) {
    $anchorHigh = Get-LevelPrice $Levels 0
    $anchorLow = Get-LevelPrice $Levels 100
    if ($null -eq $anchorHigh -or $null -eq $anchorLow) {
        return $null
    }

    $sessionTf = Get-ObjectPropertyValue $Debug "session_tf"
    if ([string]::IsNullOrWhiteSpace([string]$sessionTf)) {
        $sessionTf = Get-SessionTfForTimeframe $Timeframe
    }
    $authorityTf = Get-ObjectPropertyValue $Debug "authority_tf"
    if ([string]::IsNullOrWhiteSpace([string]$authorityTf)) {
        $authorityTf = Get-AuthorityTfForSessionTf $sessionTf
    }

    $threshold = Get-ObjectPropertyValue $Debug "compression_threshold"
    if ($null -eq $threshold) {
        $threshold = Get-CompressionThreshold $Symbol
    }

    $record = [ordered]@{
        symbol                = $Symbol
        timeframe             = $Timeframe
        family                = $Family
        session_tf            = $sessionTf
        authority_tf          = $authorityTf
        anchor_high           = $anchorHigh
        anchor_low            = $anchorLow
        anchor_range          = $anchorHigh - $anchorLow
        compression_threshold = [double]$threshold
        candle_lineage        = Get-ObjectPropertyValue $Debug "candle_lineage"
        source_period         = Get-ObjectPropertyValue $Debug "source_period"
        source_feed_bars      = Get-ObjectPropertyValue $Debug "source_feed_bars"
        debug_source          = if ($null -ne $Debug) { "endpoint_anchor_debug" } else { "derived_from_levels" }
    }

    if ($Family -eq "LTF_SF") {
        $record["components"] = @(ConvertTo-AnchorComponents $Debug)
    } else {
        $record["source"] = "auth_f1"
        $record["key"] = Get-ObjectPropertyValue $Debug "htf_anchor_key"
        $record["high"] = $anchorHigh
        $record["low"] = $anchorLow
        $record["range"] = $anchorHigh - $anchorLow
        $record["candle_count"] = Get-ObjectPropertyValue $Debug "candle_count"
        $record["first_candle"] = [string](Get-ObjectPropertyValue $Debug "first_candle")
        $record["last_candle"] = [string](Get-ObjectPropertyValue $Debug "last_candle")
        $record["components"] = @()
    }

    return [PSCustomObject]$record
}

function ConvertTo-Mt5AnchorDebugRecords([string]$Symbol, $Response) {
    $records = New-Object System.Collections.Generic.List[object]
    $debugRoot = Get-ObjectPropertyValue $Response "anchor_debug"

    foreach ($tfProp in $Response.fibs.PSObject.Properties) {
        $tf = $tfProp.Name
        $tfDebug = Get-ObjectPropertyValue $debugRoot $tf
        if ($null -eq $tfDebug) {
            $tfDebug = $debugRoot
        }
        foreach ($familyProp in $tfProp.Value.PSObject.Properties) {
            $family = $familyProp.Name
            $familyDebug = Get-ObjectPropertyValue $tfDebug $family
            if ($null -eq $familyDebug) {
                $familyDebug = $tfDebug
            }
            $record = New-Mt5AnchorDebugRecord $Symbol $tf $family @($familyProp.Value) $familyDebug
            if ($null -ne $record) {
                $records.Add($record)
            }
        }
    }

    return $records.ToArray()
}

function ConvertTo-Mt5AnchorDebugRecordsFromLevelRows($Rows) {
    $groups = @{}
    foreach ($row in @($Rows)) {
        $key = "$($row.symbol)|$($row.timeframe)|$($row.family)"
        if (-not $groups.ContainsKey($key)) {
            $groups[$key] = New-Object System.Collections.Generic.List[object]
        }
        $groups[$key].Add($row)
    }

    $records = New-Object System.Collections.Generic.List[object]
    foreach ($key in $groups.Keys) {
        $parts = $key -split "\|"
        $record = New-Mt5AnchorDebugRecord $parts[0] $parts[1] $parts[2] @($groups[$key]) $null
        if ($null -ne $record) {
            $records.Add($record)
        }
    }
    return $records.ToArray()
}

function Build-AnchorDebugIndex([string]$PathValue) {
    $index = @{}
    if (-not (Test-Path -LiteralPath $PathValue)) {
        return $index
    }

    $rows = Get-Content -LiteralPath $PathValue -Raw | ConvertFrom-Json
    foreach ($row in @($rows)) {
        $key = "$($row.symbol)|$($row.timeframe)|$($row.family)"
        $index[$key] = $row
    }
    return $index
}

function Format-AnchorNumber($Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return ""
    }
    return ("{0:0.########}" -f [double]$Value)
}

function Format-AnchorHighLow($Component) {
    if ($null -eq $Component) {
        return ""
    }
    $high = Format-AnchorNumber (Get-ObjectPropertyValue $Component "high")
    $low = Format-AnchorNumber (Get-ObjectPropertyValue $Component "low")
    if ($high -eq "" -and $low -eq "") {
        return ""
    }
    return "$high / $low"
}

function Format-AnchorDebugSummaryMarkdown($Gate, [string]$Mt5DebugFile, [string]$PineDebugFile) {
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.AppendLine("## Anchor Debug Summary")
    [void]$builder.AppendLine("")

    if ([int]$Gate.critical_mismatches_count -le 0) {
        [void]$builder.AppendLine("_None_")
        return $builder.ToString()
    }

    $mt5Index = Build-AnchorDebugIndex $Mt5DebugFile
    $pineIndex = Build-AnchorDebugIndex $PineDebugFile
    $seen = @{}

    foreach ($mismatch in @($Gate.critical_mismatches)) {
        $key = "$($mismatch.symbol)|$($mismatch.timeframe)|$($mismatch.family)"
        if ($seen.ContainsKey($key)) {
            continue
        }
        $seen[$key] = $true

        $mt5 = if ($mt5Index.ContainsKey($key)) { $mt5Index[$key] } else { $null }
        $pine = if ($pineIndex.ContainsKey($key)) { $pineIndex[$key] } else { $null }

        [void]$builder.AppendLine("### Anchor Debug: $($mismatch.symbol) $($mismatch.timeframe) $($mismatch.family)")
        [void]$builder.AppendLine("")
        [void]$builder.AppendLine("| Source | Candle Lineage | Anchor High | Anchor Low | Range |")
        [void]$builder.AppendLine("|---|---|---:|---:|---:|")
        $mt5AnchorHigh = Get-ObjectPropertyValue $mt5 "anchor_high"
        $mt5AnchorLow = Get-ObjectPropertyValue $mt5 "anchor_low"
        $mt5AnchorRange = Get-ObjectPropertyValue $mt5 "anchor_range"
        $pineAnchorHigh = Get-ObjectPropertyValue $pine "anchor_high"
        $pineAnchorLow = Get-ObjectPropertyValue $pine "anchor_low"
        $pineAnchorRange = Get-ObjectPropertyValue $pine "anchor_range"
        # candle_lineage and source_period are emitted by Patch 1 (lineage metadata).
        # If absent (pre-patch artifacts) fall back to the legacy debug_source field.
        $mt5Lineage  = [string](Get-ObjectPropertyValue $mt5  "candle_lineage")
        $pinLineage  = [string](Get-ObjectPropertyValue $pine "candle_lineage")
        $mt5Period   = [string](Get-ObjectPropertyValue $mt5  "source_period")
        $pinePeriod  = [string](Get-ObjectPropertyValue $pine "source_period")
        $mt5BarsStr  = [string](Get-ObjectPropertyValue $mt5  "source_feed_bars")
        $pineBarsStr = [string](Get-ObjectPropertyValue $pine "source_feed_bars")
        if ([string]::IsNullOrWhiteSpace($mt5Lineage))  { $mt5Lineage  = [string](Get-ObjectPropertyValue $mt5  "debug_source") }
        if ([string]::IsNullOrWhiteSpace($pinLineage))  { $pinLineage  = [string](Get-ObjectPropertyValue $pine "debug_source") }
        $mt5LineageStr  = if ($mt5Period  -and $mt5BarsStr)  { "$mt5Lineage ($mt5Period, $mt5BarsStr bars)" }  else { $mt5Lineage }
        $pineLineageStr = if ($pinePeriod -and $pineBarsStr) { "$pinLineage ($pinePeriod, $pineBarsStr bars)" } else { $pinLineage }
        $lineageMismatch = ($mt5Lineage -ne $pinLineage) -and
                           -not [string]::IsNullOrWhiteSpace($mt5Lineage) -and
                           -not [string]::IsNullOrWhiteSpace($pinLineage)
        $lineageTag = if ($lineageMismatch) { " ⚠ LINEAGE_MISMATCH" } else { "" }

        [void]$builder.AppendLine("| MT5 | $mt5LineageStr$lineageTag | $(Format-AnchorNumber $mt5AnchorHigh) | $(Format-AnchorNumber $mt5AnchorLow) | $(Format-AnchorNumber $mt5AnchorRange) |")
        [void]$builder.AppendLine("| Pine | $pineLineageStr | $(Format-AnchorNumber $pineAnchorHigh) | $(Format-AnchorNumber $pineAnchorLow) | $(Format-AnchorNumber $pineAnchorRange) |")
        if ($null -ne $mt5 -and $null -ne $pine) {
            [void]$builder.AppendLine("| Delta | | $(Format-AnchorNumber ([double]$pineAnchorHigh - [double]$mt5AnchorHigh)) | $(Format-AnchorNumber ([double]$pineAnchorLow - [double]$mt5AnchorLow)) | $(Format-AnchorNumber ([double]$pineAnchorRange - [double]$mt5AnchorRange)) |")
        }
        [void]$builder.AppendLine("")
        [void]$builder.AppendLine("#### Components")
        [void]$builder.AppendLine("")

        $mt5Components = if ($null -ne $mt5) { @($mt5.components) } else { @() }
        $pineComponents = if ($null -ne $pine) { @($pine.components) } else { @() }
        $mt5ComponentCount = (@($mt5Components) | Measure-Object).Count
        $pineComponentCount = (@($pineComponents) | Measure-Object).Count
        if ($mt5ComponentCount -eq 0 -and $pineComponentCount -eq 0) {
            [void]$builder.AppendLine("_No component debug available for this group._")
            [void]$builder.AppendLine("")
            continue
        }

        [void]$builder.AppendLine("| Slot | MT5 Key | Pine Key | MT5 High/Low | Pine High/Low | MT5 Count | Pine Count | Weight |")
        [void]$builder.AppendLine("|---|---|---|---|---|---:|---:|---:|")
        foreach ($slot in @("F1", "F2", "F3")) {
            $mt5Component = $mt5Components | Where-Object { $_.slot -eq $slot } | Select-Object -First 1
            $pineComponent = $pineComponents | Where-Object { $_.slot -eq $slot } | Select-Object -First 1
            $weight = Get-ObjectPropertyValue $pineComponent "weight"
            if ($null -eq $weight) {
                $weight = Get-ObjectPropertyValue $mt5Component "weight"
            }
            $mt5Key = Get-ObjectPropertyValue $mt5Component "key"
            $pineKey = Get-ObjectPropertyValue $pineComponent "key"
            $mt5Count = Get-ObjectPropertyValue $mt5Component "candle_count"
            $pineCount = Get-ObjectPropertyValue $pineComponent "candle_count"
            [void]$builder.AppendLine("| $slot | $mt5Key | $pineKey | $(Format-AnchorHighLow $mt5Component) | $(Format-AnchorHighLow $pineComponent) | $mt5Count | $pineCount | $(Format-AnchorNumber $weight) |")
        }
        [void]$builder.AppendLine("")
    }

    return $builder.ToString()
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
if (-not (Test-Path -LiteralPath "scripts/export-mt5-candles.ps1")) {
    Write-Fail "MT5 candle exporter not found at scripts/export-mt5-candles.ps1"
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

$runInstant = [DateTimeOffset]::UtcNow
$runTs = $runInstant.ToString("o")
$timestamp = $runInstant.ToString("yyyy-MM-dd_HHmmss")
$officialSymbols   = @("EURUSD", "USDJPY", "XAUUSD")
$expandedSymbols   = @("EURUSD", "USDJPY", "XAUUSD", "BTCUSD", "NAS100")
$defaultTimeframes = @("M15", "H1", "H4", "D1")

# -Symbols overrides official/expanded. Use for broker-specific runs, e.g. when XAUUSD is unsupported.
if ($Symbols.Count -gt 0) {
    $symbols = ($Symbols -join ',') -split '[,;\s]+'
    $symbols = $symbols | ForEach-Object { $_.Trim().ToUpperInvariant() } | Where-Object { $_ -ne "" }
    $symbols = @($symbols)
} elseif ($ExpandedAudit) {
    $symbols = $expandedSymbols
} else {
    $symbols = $officialSymbols
}
$gateSymbols = if ($Symbols.Count -gt 0) { $symbols } else { $officialSymbols }

# -Timeframes overrides MT5 row filtering + Pine generator output.
# Candle export stays M15-only; the generator derives Pine helper feeds from M15.
if ($Timeframes.Count -gt 0) {
    $timeframes = ($Timeframes -join ',') -split '[,;\s]+'
    $timeframes = $timeframes | ForEach-Object { $_.Trim().ToUpperInvariant() } | Where-Object { $_ -ne "" }
    $timeframes = @($timeframes)
} else {
    $timeframes = $defaultTimeframes
}
$candleExportTimeframes = @("M15")
$candleExportLimit = [Math]::Max($CandleLimit, (Get-RequiredM15CandleLimit $timeframes))

$mt5LevelsFile = Join-Path $reportsRoot "mt5-levels.json"
$mt5ExpandedFile = Join-Path $reportsRoot "mt5-levels-expanded.json"
$pineLevelsFile = Join-Path $reportsRoot "pine-levels.json"
$mt5AnchorDebugFile = Join-Path $reportsRoot "mt5-anchor-debug.json"
$pineAnchorDebugFile = Join-Path $reportsRoot "pine-anchor-debug.json"
$mt5Rows = 0

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

if (-not $DryRun) {
    Write-Step "Exporting MT5 fib levels (symbols: $($symbols -join ', '))"
    $pair = "${WpUser}:${AppPw}"
    $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    $headers = @{ Authorization = "Basic $basic" }
    $combined = New-Object System.Collections.Generic.List[object]
    $mt5AnchorDebug = New-Object System.Collections.Generic.List[object]

    foreach ($sym in $symbols) {
        Write-Host "  Fetching $sym..."
        $url = "$Backend/wp-json/sniper/v1/market-data/fib-levels?symbol=$sym&mode=$BackendMode"
        try {
            $response = Invoke-RestMethod -Uri $url -Headers $headers -Method GET -ErrorAction Stop
        } catch {
            Write-Fail "MT5 export failed for ${sym}: $($_.Exception.Message)"
        }

        $rawFile = Join-Path $reportsRoot "mt5-${sym}-raw.json"
        Write-JsonFile $rawFile $response

        if (-not $response.fibs) {
            Write-Fail "No fibs in response for $sym"
        }

        foreach ($debugRecord in @(ConvertTo-Mt5AnchorDebugRecords $sym $response)) {
            $mt5AnchorDebug.Add($debugRecord)
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

    $official = @($combined | Where-Object { ($gateSymbols -contains $_.symbol) -and ($timeframes -contains $_.timeframe) })
    Write-JsonFile $mt5LevelsFile ($official | Sort-Object symbol, timeframe, family, ratio)
    $officialAnchorDebug = @($mt5AnchorDebug | Where-Object { ($gateSymbols -contains $_.symbol) -and ($timeframes -contains $_.timeframe) })
    Write-JsonFile $mt5AnchorDebugFile ($officialAnchorDebug | Sort-Object symbol, timeframe, family)

    $mt5Rows = @($official).Count
    # Dynamic: symbols × timeframes × 2 families × 16 ratios. Respects -Symbols/-Timeframes overrides.
    $mt5ExpectedRows = $gateSymbols.Count * $timeframes.Count * 2 * 16
    Write-Ok "MT5 official: $mt5Rows rows -> $mt5LevelsFile (expected $mt5ExpectedRows)"
    Write-Ok "MT5 anchor debug: $(@($officialAnchorDebug).Count) rows -> $mt5AnchorDebugFile"
    if ($mt5Rows -ne $mt5ExpectedRows) {
        Write-Fail "MT5 official row count $mt5Rows != $mt5ExpectedRows"
    }

    if ($ExpandedAudit) {
        $expanded = @($combined | Where-Object { $timeframes -contains $_.timeframe })
        Write-JsonFile $mt5ExpandedFile ($expanded | Sort-Object symbol, timeframe, family, ratio)
        Write-Ok "MT5 expanded: $($expanded.Count) rows -> $mt5ExpandedFile"
    }

    if (-not $SkipCandleExport) {
        Write-Step "Exporting MT5 candles"
        $exporterScript = Join-Path (Get-Location) "scripts/export-mt5-candles.ps1"
        # Hashtable splat: [string[]] params need this or only the first element is received.
        # Flat-array positional splatting (@array) breaks multi-value named params.
        $candleParams = @{
            Backend    = $Backend
            WpUser     = $WpUser
            AppPw      = $AppPw
            CandleDir  = $candleRoot
            Limit      = $candleExportLimit
            Symbols    = [string[]]$gateSymbols
            Timeframes = [string[]]$candleExportTimeframes
        }
        if ($NoPrompt) {
            $candleParams["NoPrompt"] = $true
        }
        & $exporterScript @candleParams
        if (-not $?) {
            Write-Fail "MT5 candle export failed"
        }
    } else {
        Write-Warn "Skipping MT5 candle export because -SkipCandleExport is active"
    }

    $referenceUtc = (Get-Item -LiteralPath $mt5LevelsFile).LastWriteTimeUtc
    Test-CandleFiles $candleRoot $gateSymbols $candleExportTimeframes $referenceUtc
} else {
    Write-Step "DryRun mode - skipping MT5 export"
    if (-not (Test-Path -LiteralPath $mt5LevelsFile)) {
        Write-Fail "DryRun: no existing MT5 levels file at $mt5LevelsFile"
    }

    $existingMt5 = Get-Content -LiteralPath $mt5LevelsFile -Raw | ConvertFrom-Json
    $mt5Rows = @($existingMt5).Count
    Write-Ok "Using existing MT5 levels: $mt5LevelsFile ($mt5Rows rows)"
    $dryRunAnchorDebug = ConvertTo-Mt5AnchorDebugRecordsFromLevelRows @($existingMt5)
    Write-JsonFile $mt5AnchorDebugFile ($dryRunAnchorDebug | Sort-Object symbol, timeframe, family)
    Write-Ok "MT5 anchor debug: $(@($dryRunAnchorDebug).Count) rows -> $mt5AnchorDebugFile"

    $referenceUtc = (Get-Item -LiteralPath $mt5LevelsFile).LastWriteTimeUtc
    Test-CandleFiles $candleRoot $gateSymbols $candleExportTimeframes $referenceUtc
}

Write-Step "Generating Pine v13-compatible reference levels"
$nodeArgs = @(
    (Join-Path "scripts" "generate-pine-levels-v13.cjs"),
    "--candle-dir", $candleRoot,
    "--mt5-file", $mt5LevelsFile,
    "--reports-dir", $reportsRoot,
    "--run-ts", $runTs,
    "--symbols",    ($gateSymbols -join ","),
    "--timeframes", ($timeframes -join ",")
)
Invoke-ExternalCommand "node" $nodeArgs "Pine generator failed"

if (-not (Test-Path -LiteralPath $pineLevelsFile)) {
    Write-Fail "Pine generator did not produce output file: $pineLevelsFile"
}
if (-not (Test-Path -LiteralPath $pineAnchorDebugFile)) {
    Write-Fail "Pine generator did not produce anchor debug file: $pineAnchorDebugFile"
}

$pineRows = @((Get-Content -LiteralPath $pineLevelsFile -Raw | ConvertFrom-Json)).Count
$pineExpectedRows = $gateSymbols.Count * $timeframes.Count * 2 * 16
$pineMinimumRows = $gateSymbols.Count * $timeframes.Count * 1 * 16
$pineRequireHtf = [Environment]::GetEnvironmentVariable("PINE_REQUIRE_HTF") -eq "1"
if ($pineRequireHtf) {
    $pineMinimumRows = $pineExpectedRows
}
Write-Ok "Pine levels: $pineRows rows -> $pineLevelsFile (allowed $pineMinimumRows-$pineExpectedRows)"
Write-Ok "Anchor debug artifacts: MT5=$(Split-Path $mt5AnchorDebugFile -Leaf) Pine=$(Split-Path $pineAnchorDebugFile -Leaf)"
if ($pineRows -lt $pineMinimumRows -or $pineRows -gt $pineExpectedRows) {
    Write-Fail "Pine row count $pineRows outside allowed range $pineMinimumRows-$pineExpectedRows"
}
if ($pineRows -lt $pineExpectedRows) {
    Write-Warn "Pine partial output accepted: $pineRows/$pineExpectedRows rows. Missing HTF_AF rows will be reported by the validator."
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
    "--out", $gateFile,
    "--run-ts", $runTs,
    "--symbols", ($gateSymbols -join ","),
    "--timeframes", ($timeframes -join ",")
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
$anchorDebugMarkdown = Format-AnchorDebugSummaryMarkdown $gate $mt5AnchorDebugFile $pineAnchorDebugFile

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
| MT5 anchor debug | $(Split-Path $mt5AnchorDebugFile -Leaf) |
| Pine anchor debug | $(Split-Path $pineAnchorDebugFile -Leaf) |

## Critical mismatches

$criticalLines

$anchorDebugMarkdown
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
