param(
  [string]$Backend = "https://trader.stokvelsociety.co.za",
  [string]$WpUser = "YOUR_WP_USERNAME",
  [string]$AppPw  = "YOUR_WORDPRESS_APP_PASSWORD",
  [string]$OutDir = "reports/phase4-parity"
)

# Ensure output dir
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$pair = "${WpUser}:${AppPw}"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = "Basic $basic" }

# Expanded corpus symbols
$symbols = @("EURUSD", "USDJPY", "XAUUSD", "BTCUSD", "NAS100")

$combined = @()

foreach ($sym in $symbols) {
  Write-Host "Fetching MT5 fib levels for $sym..."

  $url = "$Backend/wp-json/sniper/v1/market-data/fib-levels?symbol=$sym"

  try {
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method GET -ErrorAction Stop
  } catch {
    Write-Warning ("Failed to fetch {0}: {1}" -f $sym, $_.Exception.Message)
    continue
  }

  # Save raw grouped backend response for evidence
  $response | ConvertTo-Json -Depth 20 | Set-Content "$OutDir/mt5-$sym-raw.json"

  if (-not $response.fibs) {
    Write-Warning "No fibs returned for $sym"
    continue
  }

  foreach ($tfProp in $response.fibs.PSObject.Properties) {
    $tf = $tfProp.Name
    $families = $tfProp.Value

    foreach ($familyProp in $families.PSObject.Properties) {
      $family = $familyProp.Name
      $levels = $familyProp.Value

      foreach ($level in $levels) {
        $combined += [PSCustomObject]@{
          symbol    = $sym
          timeframe = $tf
          family    = $family
          ratio     = [double]$level.ratio
          price     = [double]$level.price
        }
      }
    }
  }
}

$combined |
  Sort-Object symbol, timeframe, family, ratio |
  ConvertTo-Json -Depth 10 |
  Set-Content "$OutDir/mt5-levels-expanded.json"

Write-Host "Wrote $($combined.Count) rows to $OutDir/mt5-levels-expanded.json"
Write-Host "Expected expanded corpus rows: 640"

# Also write the official subset (EURUSD, USDJPY, XAUUSD)
$officialSymbols = @("EURUSD", "USDJPY", "XAUUSD")
$official = $combined | Where-Object { $officialSymbols -contains $_.symbol }
$official |
  Sort-Object symbol, timeframe, family, ratio |
  ConvertTo-Json -Depth 10 |
  Set-Content "$OutDir/mt5-levels.json"
Write-Host "Wrote official gate rows: $(($official | Measure-Object).Count)"
