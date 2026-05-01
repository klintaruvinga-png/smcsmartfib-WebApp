param(
    [string[]]$Suites = @('pine', 'js', 'browser', 'php')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

function Invoke-Suite {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host "==> Running $Name tests"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name tests failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    foreach ($suite in $Suites) {
        switch ($suite.ToLowerInvariant()) {
            'pine' {
                Invoke-Suite -Name 'pine' -Command { node --test --test-isolation=none tests/pine/*.test.js }
            }
            'js' {
                Invoke-Suite -Name 'js' -Command { node --test --test-isolation=none tests/js/*.test.js }
            }
            'browser' {
                Invoke-Suite -Name 'browser' -Command { node --test --test-isolation=none tests/browser/*.test.js }
            }
            'php' {
                Invoke-Suite -Name 'php' -Command { node tests/helpers/run-php-tests.js }
            }
            default {
                throw "Unknown suite '$suite'. Expected one of: pine, js, browser, php"
            }
        }
    }
}
finally {
    Pop-Location
}
