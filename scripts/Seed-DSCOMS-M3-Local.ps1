# Apply only synthetic demo data to a Wrangler LOCAL D1 database.
# Existing records are preserved; fixed IDs prevent duplicate fixture insertion.
param([switch]$SkipMigrations)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
if (!(Test-Path '.dev.vars')) { throw 'Missing .dev.vars. Configure local test authentication first.' }
$devvars = Get-Content '.dev.vars' -Raw
if ($devvars -notmatch '(?m)^\s*APP_ENV\s*=\s*local\s*$') { throw 'Refusing to seed: APP_ENV=local is required.' }
if (!(Test-Path 'wrangler.jsonc')) { throw 'This is not the DSC OMS project root.' }
if (!$SkipMigrations) {
  & npx wrangler d1 migrations apply DB --local
  if ($LASTEXITCODE -ne 0) { throw 'Local migrations failed. No seed was executed.' }
}
& npx wrangler d1 execute DB --local --file (Join-Path $PSScriptRoot 'm3_local_demo_seed.sql')
if ($LASTEXITCODE -ne 0) { throw 'Local demo seed failed. See Wrangler output.' }
Write-Host 'Synthetic local fixture counts:' -ForegroundColor Green
& npx wrangler d1 execute DB --local --command 'SELECT (SELECT count(*) FROM users) AS members, (SELECT count(*) FROM projects) AS projects, (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM tasks) AS tasks;'
Write-Host 'To run the local application: npm run dev' -ForegroundColor Green
