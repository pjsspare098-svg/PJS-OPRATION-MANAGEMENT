@echo off
setlocal
rem MANUAL-ONLY PJS OMS: this launcher opens the website and NEVER starts a Python worker.
start "" "https://pjs-oms-independent-pjsspare098-2655.vercel.app/"
echo PJS Operations opened in manual-only mode. No agents were started.
endlocal
