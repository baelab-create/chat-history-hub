@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-manual-windows.ps1"
if errorlevel 1 pause
