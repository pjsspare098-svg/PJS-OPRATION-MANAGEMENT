@echo off
setlocal
cd /d "%~dp0"
echo PJS Operations: checking office agents and opening the website...
call "%~dp0START_OFFICE_WORKERS.bat"
set "PJS_START_RESULT=%ERRORLEVEL%"
start "" "https://pjs-oms-independent-pjsspare098-2655.vercel.app/"
if not "%PJS_START_RESULT%"=="0" (
  echo.
  echo PJS website opened, but local worker startup failed.
  echo See the error above. Check your worker folder and the local .env; do not share keys.
  pause
  exit /b 1
)
echo.
echo Website opened. The Control Tower will confirm agents online once heartbeats arrive.
endlocal
