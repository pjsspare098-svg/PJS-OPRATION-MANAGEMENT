@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_OFFICE_WORKERS.ps1"
if errorlevel 1 (
  echo PJS worker startup failed. Fix the reported issue before queuing live jobs.
  pause
  exit /b 1
)
exit /b 0
