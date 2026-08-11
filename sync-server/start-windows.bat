@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo Kedu sync server failed to start. See the error above.
echo Press any key to close this window.
pause >nul
exit /b %EXIT_CODE%
