@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
 echo ERROR: Missing local worker\.env - see docs\OUTLOOK_AUTOMATION_SETUP.md
 pause
 exit /b 1
)
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
 py -3 outlook_draft_worker.py
) else (
 python outlook_draft_worker.py
)
if errorlevel 1 (
 echo Outlook draft worker stopped with an error. See logs\outlook-draft-worker.log
 pause
)
endlocal
