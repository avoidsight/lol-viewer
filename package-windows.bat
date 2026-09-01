@echo off

rem Double-clicking this file first opens a dedicated console window. The second
rem invocation performs the real work inside that window and waits before exit.
if /I not "%~1"=="--console" (
  start "LOL Viewer - Windows Packaging" "%ComSpec%" /d /c call "%~f0" --console
  exit /b 0
)

setlocal
chcp 65001 >nul 2>&1
title LOL Viewer - Windows Packaging
mode con cols=110 lines=34 >nul 2>&1

set "PROJECT_DIR=%~dp0"

echo ============================================================
echo LOL Viewer - Windows Packaging
echo ============================================================
echo Source: %PROJECT_DIR%
echo.
echo The console will show all four packaging steps below.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\package-windows.ps1"
set "PACKAGE_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%PACKAGE_EXIT_CODE%"=="0" (
  echo [FAILED] Packaging did not finish. Review the error above and retry.
) else (
  echo [DONE] The installer is available in the release directory.
)
echo.
echo Press any key to exit...
pause >nul
exit /b %PACKAGE_EXIT_CODE%
