<#
.SYNOPSIS
    Export MT5-authoritative candle files for Phase 4 parity.

.DESCRIPTION
    Calls the authenticated WordPress candle endpoint and writes
    data/{SYMBOL}_{TF}.json files consumed by generate-pine-levels-v13.cjs.
    Uses only /market-data/candles MT5 output. No TwelveData fallback is valid
    for Phase 4 parity evidence.
#>

[CmdletBinding()]
param(
    [string]$Backend = "",
    [string]$WpUser = "",
    [string]$AppPw = "",
    [string]$CandleDir = "data",
    [string[]]$Symbols = @("EURUSD", "USDJPY", "XAUUSD"),
    [string[]]$Timeframes = @("M15", "H1", "H4", "D1"),
    [int]$Limit = 600,
    [switch]$NoPrompt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "[candles] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "  OK   $Message" -ForegroundColor Green
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

function Test-CandleShape([object]$Candle, [string]$Label) {
    foreach ($field in @("time", "open", "high", "low", "close")) {
        if (-not ($Candle.PSObject.Properties.Name -contains $field)) {
            Write-Fail "$Label missing required time/open/high/low/close field: $field"
        }
    }

    $parsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$Candle.time, [ref]$parsed)) {
        Write-Fail "$Label has invalid UTC time: $($Candle.time)"
    }

    foreach ($field in @("open", "high", "low", "close")) {
        $text = [string]$Candle.$field
        if ([string]::IsNullOrWhiteSpace($text)) {
            Write-Fail "$Label has invalid numeric $field value: <empty>"
        }

        $number = 0.0
        $styles = [System.Globalization.NumberStyles]::Float
        $culture = [System.Globalization.CultureInfo]::InvariantCulture
        if (-not [double]::TryParse($text, $styles, $culture, [ref]$number)) {
            Write-Fail "$Label has invalid numeric $field value: $($Candle.$field)"
        }
        if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) {
            Write-Fail "$Label has invalid numeric $field value: $($Candle.$field)"
        }
    }
}

function ConvertTo-NormalizedCandle([object]$Candle, [string]$Label) {
    $styles = [System.Globalization.NumberStyles]::Float
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $open = 0.0
    $high = 0.0
    $low = 0.0
    $close = 0.0
    $volume = 0.0

    if (-not [double]::TryParse([string]$Candle.open, $styles, $culture, [ref]$open)) {
        Write-Fail "$Label has invalid numeric open value: $($Candle.open)"
    }
    if (-not [double]::TryParse([string]$Candle.high, $styles, $culture, [ref]$high)) {
        Write-Fail "$Label has invalid numeric high value: $($Candle.high)"
    }
    if (-not [double]::TryParse([string]$Candle.low, $styles, $culture, [ref]$low)) {
        Write-Fail "$Label has invalid numeric low value: $($Candle.low)"
    }
    if (-not [double]::TryParse([string]$Candle.close, $styles, $culture, [ref]$close)) {
        Write-Fail "$Label has invalid numeric close value: $($Candle.close)"
    }
    if ($Candle.PSObject.Properties.Name -contains "volume") {
        [void][double]::TryParse([string]$Candle.volume, $styles, $culture, [ref]$volume)
    }

    [PSCustomObject]@{
        time = [string]$Candle.time
        open = $open
        high = $high
        low = $low
        close = $close
        volume = $volume
    }
}

function Get-TimeframeSeconds([string]$Timeframe) {
    switch ($Timeframe) {
        "M15" { return 900 }
        "H1" { return 3600 }
        "H4" { return 14400 }
        "D1" { return 86400 }
        default { Write-Fail "Unsupported timeframe: $Timeframe" }
    }
}

$Backend = (Resolve-ConfigValue $Backend "SMC_BACKEND" "https://trader.stokvelsociety.co.za").TrimEnd("/")
$WpUser = Resolve-ConfigValue $WpUser "SMC_WP_USER" ""
$AppPw = Resolve-ConfigValue $AppPw "SMC_APP_PW" ""
$Limit = [Math]::Max(1, [Math]::Min(100000, $Limit))
$candleRoot = ConvertTo-AbsolutePath $CandleDir
New-Item -ItemType Directory -Path $candleRoot -Force | Out-Null

Write-Step "Resolving auth"
if ([string]::IsNullOrWhiteSpace($WpUser) -or [string]::IsNullOrWhiteSpace($AppPw)) {
    if ($NoPrompt) {
        Write-Fail "Auth env vars SMC_WP_USER / SMC_APP_PW not set and -NoPrompt is active"
    }

    $credential = Get-Credential -Message "Enter WordPress username and application password"
    if ($null -eq $credential) {
        Write-Fail "Credential prompt cancelled"
    }
    $WpUser = $credential.UserName
    $AppPw = $credential.GetNetworkCredential().Password
}
Write-Ok "Auth resolved for user: $WpUser"

$pair = "${WpUser}:${AppPw}"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = "Basic $basic" }
$summary = New-Object System.Collections.Generic.List[object]

Write-Step "Exporting MT5 candles"
foreach ($symRaw in $Symbols) {
    $sym = ([string]$symRaw).Trim().ToUpperInvariant()
    if ([string]::IsNullOrWhiteSpace($sym)) {
        continue
    }

    foreach ($tfRaw in $Timeframes) {
        $tf = ([string]$tfRaw).Trim().ToUpperInvariant()
        $encodedSymbol = [Uri]::EscapeDataString($sym)
        $encodedTf = [Uri]::EscapeDataString($tf)
        $url = "$Backend/wp-json/sniper/v1/market-data/candles?symbol=$encodedSymbol&timeframe=$encodedTf&limit=$Limit"
        $label = "$sym $tf"

        try {
            $response = Invoke-RestMethod -Uri $url -Headers $headers -Method GET -ErrorAction Stop
        } catch {
            Write-Fail "Candle export failed for ${label}: $($_.Exception.Message)"
        }

        if ($response.PSObject.Properties.Name -contains "ok" -and $response.ok -eq $false) {
            Write-Fail "Candle endpoint returned ok=false for ${label}: $($response.message)"
        }

        $candles = @($response)
        if ($response.PSObject.Properties.Name -contains "candles") {
            $candles = @($response.candles)
        }

        if ($candles.Count -lt 1) {
            Write-Fail "Candle endpoint returned no rows for $label"
        }

        foreach ($candle in $candles) {
            Test-CandleShape $candle $label
        }

        $latest = [DateTimeOffset]::Parse([string]$candles[-1].time).UtcDateTime
        $maxAgeSeconds = [Math]::Max((Get-TimeframeSeconds $tf) * 2, 300)
        $ageSeconds = ([DateTime]::UtcNow - $latest).TotalSeconds
        if ($ageSeconds -gt $maxAgeSeconds) {
            Write-Fail ("Stale MT5 candles for {0}: latest={1:o} age_sec={2:N0} max_age_sec={3}" -f $label, $latest, $ageSeconds, $maxAgeSeconds)
        }

        $normalized = foreach ($candle in $candles) {
            ConvertTo-NormalizedCandle $candle $label
        }

        $file = Join-Path $candleRoot "${sym}_${tf}.json"
        $json = @($normalized) | ConvertTo-Json -Depth 8
        [System.IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding $false))

        $summary.Add([PSCustomObject]@{
            Symbol = $sym
            Timeframe = $tf
            Rows = $candles.Count
            LatestCandleUtc = $latest.ToString("o")
            File = $file
        })
    }
}

if ($summary.Count -lt 1) {
    Write-Fail "No candle files were exported"
}

$summary | Format-Table -AutoSize
Write-Ok "Exported $($summary.Count) MT5 candle files to $candleRoot"
