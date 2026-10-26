# PJS OMS manual-only baseline. This script may not install an agent autostart.
# Previously installed tasks are NOT removed automatically by a website update.
param([string]$PythonExe = '')
Write-Warning 'Worker autostart installation is disabled while the PJS OMS manual-only base is redesigned.'
Write-Host "If you already installed the PJS OMS DataDoc Worker scheduled task, disable it in Windows Task Scheduler or run uninstall_autostart.ps1."
exit 0
