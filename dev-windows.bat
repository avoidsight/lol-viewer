@echo off

rem Double-clicking this file first opens a dedicated console window. The second
rem invocation performs the real work inside that window and waits before exit.
if /I not "%~1"=="--console" (
  start "LOL Viewer - Development" "%ComSpec%" /d /c call "%~f0" --console
  exit /b 0
)

setlocal
chcp 65001 >nul 2>&1
title LOL Viewer - Development
mode con cols=110 lines=34 >nul 2>&1

set "PROJECT_DIR=%~dp0"

echo ============================================================
echo LOL Viewer - Development
echo ============================================================
echo Source: %PROJECT_DIR%
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\dev-windows.ps1"
set "DEV_EXIT_CODE=%ERRORLEVEL%"

echo.
echo Press any key to exit...
pause >nul
exit /b %DEV_EXIT_CODE%
