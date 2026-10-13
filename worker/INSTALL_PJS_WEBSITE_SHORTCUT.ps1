# Run once on the actual office Windows account, from the permanent worker folder.
# No administrator privileges, API keys, web browser permissions or scheduled task needed.
$ErrorActionPreference = 'Stop'
$folder = (Resolve-Path $PSScriptRoot).Path
$launcher = Join-Path $folder 'OPEN_PJS_WEBSITE.bat'
if (-not (Test-Path $launcher)) { throw 'OPEN_PJS_WEBSITE.bat is missing; update your PJS worker folder.' }
if (-not (Test-Path (Join-Path $folder 'office_preflight.py'))) { throw 'Office preflight missing; update the worker folder.' }
if (-not (Test-Path (Join-Path $folder '.env'))) { throw 'Private worker/.env is missing. Preserve the authorized local credentials.' }
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
if (-not $desktop -or -not (Test-Path $desktop)) { throw 'Could not find the Windows desktop folder.' }
$path = Join-Path $desktop 'PJS Operations - Start Agents.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($path)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $folder
$shortcut.Description = 'Open PJS Operations and start its authorized office DataDoc, Outlook and carrier tracking agents'
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,43"
$shortcut.Save()
Write-Host "SUCCESS: Desktop shortcut created: $path"
Write-Host 'Use this shortcut to open PJS Operations and start missing agents.'
Write-Host 'Opening the ordinary website URL from any browser cannot directly launch Windows programs.'
Write-Host 'Existing .env settings and existing jobs were not changed.'
