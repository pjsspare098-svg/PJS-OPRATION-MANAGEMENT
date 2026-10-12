# Start both independent PJS OMS desktop workers in separate Windows sessions.
# Does not install, change .env or enable live external actions.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envPath)) {
  Write-Error 'Missing local worker/.env. See README.md and OUTLOOK_AUTOMATION_SETUP.md. Do not share credentials.'
  exit 1
}
$settings = Get-Content $envPath -Raw
if ($settings -match 'PASTE_INDEPENDENT_SUPABASE_SERVICE_ROLE_KEY_HERE|PASTE_YOUR_OMS_USER_UUID_HERE') {
  Write-Error 'Fill in your independent Supabase credentials and authorized owner ID in the local .env first.'
  exit 1
}
$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
  $exe = $py.Source
  $prefix = '-3'
} else {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) { Write-Error 'Python 3.12+ is required'; exit 1 }
  $exe = $py.Source
  $prefix = ''
}
function Start-PJSWorker([string] $file) {
  if (-not (Test-Path (Join-Path $PSScriptRoot $file))) { throw "Missing $file" }
  $arguments = if ($prefix) { "-3 $file" } else { $file }
  Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -PassThru | Out-Null
  Write-Host "Launched $file. Check its heartbeat in PJS Control Tower."
}
Start-PJSWorker 'independent_worker.py'
Start-PJSWorker 'outlook_draft_worker.py'
Write-Host 'Both processes were launched, not confirmed online. Refresh Control Tower and check worker/logs.'
Write-Host 'No safety flags were modified. If live modes are disabled they should report PAUSED.'
Write-Host 'Carrier Tracking is not an unattended Supabase worker yet; do not expect an online heartbeat.'
