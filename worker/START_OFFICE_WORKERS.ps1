# Launch PJS independent office workers. Does not enable live automation.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envPath)) {
  Write-Error 'Missing private worker/.env. Follow worker/README.md first.'
  exit 1
}
$settings = Get-Content $envPath -Raw
if ($settings -match 'PASTE_INDEPENDENT_SUPABASE_SERVICE_ROLE_KEY_HERE|PASTE_YOUR_OMS_USER_UUID_HERE') {
  Write-Error 'Set the independent Supabase credential and authorized owner UID locally first.'
  exit 1
}
$python = $null
$prefix = ''
if ($env:PJS_PYTHON_EXE -and (Test-Path $env:PJS_PYTHON_EXE)) {
  $python = $env:PJS_PYTHON_EXE
} else {
  $candidate = Join-Path $env:USERPROFILE 'Python313\python.exe'
  if (Test-Path $candidate) { $python = $candidate }
}
if (-not $python) {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if ($command) { $python = $command.Source }
}
if (-not $python) {
  $command = Get-Command py -ErrorAction SilentlyContinue
  if ($command) { $python = $command.Source; $prefix = '-3 ' }
}
if (-not $python) { Write-Error 'Python 3.12+ is required. Set PJS_PYTHON_EXE to your python.exe path.'; exit 1 }
$preflight = Join-Path $PSScriptRoot 'office_preflight.py'
if (-not (Test-Path $preflight)) { Write-Error 'Missing worker/office_preflight.py'; exit 1 }
Write-Host 'Verifying Python modules and Supabase credential (no changes to jobs or customer data)...'
if ($prefix) { & $python -3 $preflight } else { & $python $preflight }
if ($LASTEXITCODE -ne 0) {
  Write-Error 'Preflight failed. Worker launch cancelled to avoid repeated 401/invalid-key errors.'
  exit 1
}
$launcher = Join-Path $PSScriptRoot 'start_worker.py'
if (-not (Test-Path $launcher)) { Write-Error 'Missing worker/start_worker.py'; exit 1 }
# Opening the website again must never start duplicate job consumers.
# Check both the old direct-Python launch and the newer start_worker.py launcher.
try {
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction Stop)
} catch {
  throw 'Cannot verify existing Python processes. No workers started; check Windows WMI/CIM access.'
}
foreach ($worker in @('independent_worker.py', 'outlook_draft_worker.py', 'dispatch_tracking_worker.py')) {
  if (-not (Test-Path (Join-Path $PSScriptRoot $worker))) { throw "Missing $worker" }
  $workerPath = Join-Path $PSScriptRoot $worker
  $pattern = '(^|[\\/\s"''])(?:' + [regex]::Escape($worker) + ')(?=$|[\s"''])'
  $alreadyRunning = @($processes | Where-Object {
    $line = $_.CommandLine
    $line -and ($line.Contains($workerPath) -or
      ($line.Contains($launcher) -and [regex]::IsMatch($line,$pattern,[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)))
  }).Count -gt 0
  if ($alreadyRunning) {
    Write-Host "Already running: $worker (not starting a duplicate)."
    continue
  }
  $args = $prefix + '"' + $launcher + '" ' + $worker
  Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $PSScriptRoot | Out-Null
  Write-Host "Started $worker. Check Control Tower for a fresh heartbeat."
}
Write-Host 'Safety flags were not modified. Disabled workers should report PAUSED.'
Write-Host 'Logs: worker\logs\datadoc-worker.log, outlook-draft-worker.log, dispatch-tracking.log'
