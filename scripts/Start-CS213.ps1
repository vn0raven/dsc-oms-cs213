param(
    [ValidateRange(1024, 65535)][int]$Port = 8787
)
$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $appRoot
try {
    Write-Host "DSC OMS CS 213 folder: $appRoot"
    $localUrl = "http://127.0.0.1:$Port"
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
    $wranglerPath = Join-Path $appRoot 'node_modules\wrangler\bin\wrangler.js'
    if (!(Test-Path -LiteralPath $wranglerPath)) {
        Write-Host 'Installing locked project dependencies...'
        & npm.cmd ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    & $pythonPath 'scripts/prepare_cs213_local.py'
    if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare wrangler.cs213.jsonc.' }
    & $nodePath $wranglerPath d1 migrations apply DB --local --config wrangler.cs213.jsonc --persist-to .cs213-state
    if ($LASTEXITCODE -ne 0) { throw 'Local migrations failed.' }
    & $nodePath $wranglerPath d1 execute DB --local --config wrangler.cs213.jsonc --persist-to .cs213-state --file scripts/m3_local_demo_seed.sql
    if ($LASTEXITCODE -ne 0) { throw 'Base demo seed failed.' }
    & $nodePath $wranglerPath d1 execute DB --local --config wrangler.cs213.jsonc --persist-to .cs213-state --file scripts/cs213_demo_seed.sql
    if ($LASTEXITCODE -ne 0) { throw 'CS 213 demo seed failed.' }
    Write-Host "Open $localUrl in your browser. Sign in with demo.lead@example.test / LeadPass#2026 (see README_CS213.md)."
    & $nodePath $wranglerPath dev --local --config wrangler.cs213.jsonc --persist-to .cs213-state --ip 127.0.0.1 --port $Port
} finally {
    Pop-Location
}
