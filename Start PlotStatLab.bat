@echo off
setlocal
cd /d "%~dp0"
set "PSL_APP=%~dp0.psl"
if not exist "%PSL_APP%\scripts\bootstrap.ps1" set "PSL_APP=%~dp0"
if exist "%~dp0.psl" attrib +h "%~dp0.psl" >nul 2>&1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PSL_APP%\scripts\bootstrap.ps1" %*
set "PSL_EXIT=%ERRORLEVEL%"
if not "%PSL_EXIT%"=="0" (
  echo.
  echo PlotStatLab could not start. The message above explains why.
  if not defined CI pause
)
exit /b %PSL_EXIT%
