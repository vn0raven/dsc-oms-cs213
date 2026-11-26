param(
    [ValidateSet('lead','member','executive')][string]$Identity = 'lead',
    [ValidateRange(1024,65535)][int]$Port = 8787,
    [switch]$InstallDependencies
)
$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $appRoot
try {
    Write-Host "DSC OMS folder: $appRoot"
    $localUrl = "http://127.0.0.1:$Port"
    $running = $null
    try { $running = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2 } catch {}
    if ($running -and $running.service -eq 'dsc-oms-cloudflare') {
        if ($InstallDependencies) { throw 'DSC OMS is running. Stop its server with Ctrl+C before reinstalling dependencies.' }
        Write-Host "DSC OMS is already running: $localUrl"
        return
    }
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
    $wranglerPath = Join-Path $appRoot 'node_modules\wrangler\bin\wrangler.js'
    if ($InstallDependencies -or !(Test-Path -LiteralPath $wranglerPath)) {
        Write-Host 'Installing the locked project dependencies...'
        & npm.cmd ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Do not continue to migrations or start the server.' }
    }
    & $pythonPath 'scripts/prepare_local_qa.py' --identity $Identity
    if ($LASTEXITCODE -ne 0) { throw 'Local configuration preparation failed.' }
    & $nodePath $wranglerPath d1 migrations apply DB --local --config wrangler.qa.jsonc --persist-to .qa-state
    if ($LASTEXITCODE -ne 0) { throw 'Local migrations failed.' }
    & $nodePath $wranglerPath d1 execute DB --local --config wrangler.qa.jsonc --persist-to .qa-state --file scripts/m3_local_demo_seed.sql
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic demo setup failed.' }
    Write-Host "Open $localUrl in your browser. Keep this window open; press Ctrl+C to stop."
    & $nodePath $wranglerPath dev --local --config wrangler.qa.jsonc --persist-to .qa-state --ip 127.0.0.1 --port $Port
} finally {
    Pop-Location
}
