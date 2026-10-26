# Run once on the actual office Windows account, from the permanent worker folder.
# No administrator privileges, API keys, web browser permissions or scheduled task needed.
$ErrorActionPreference = 'Stop'
$folder = (Resolve-Path $PSScriptRoot).Path
$launcher = Join-Path $folder 'OPEN_PJS_WEBSITE.bat'
if (-not (Test-Path $launcher)) { throw 'OPEN_PJS_WEBSITE.bat is missing; update your PJS worker folder.' }
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
if (-not $desktop -or -not (Test-Path $desktop)) { throw 'Could not find the Windows desktop folder.' }
$path = Join-Path $desktop 'PJS Operations - Open Website.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($path)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $folder
$shortcut.Description = 'Open PJS Operations website in manual-only mode; no agents'
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,43"
$shortcut.Save()
Write-Host "SUCCESS: Desktop shortcut created: $path"
Write-Host 'Use this shortcut to open PJS Operations. No agents will start.'
Write-Host 'Opening the ordinary website URL from any browser cannot directly launch Windows programs.'
Write-Host 'Existing .env settings and historical jobs were not changed. Remove the old 'Start Agents' shortcut from Desktop if present.'
