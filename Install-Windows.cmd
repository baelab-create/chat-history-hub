@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1"
if errorlevel 1 (
 echo Installation did not complete. Check the message above.
) else (
 echo Installed. Keep the ChatGPT desktop app signed in and running.
)
pause
