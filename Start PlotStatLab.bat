@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap.ps1" %*
set "PSL_EXIT=%ERRORLEVEL%"
if not "%PSL_EXIT%"=="0" (
  echo.
  echo PlotStatLab could not start. The message above explains why.
  pause
)
exit /b %PSL_EXIT%
