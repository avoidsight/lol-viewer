@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"

echo ============================================================
echo LOL Viewer - Windows 一键打包
echo ============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\package-windows.ps1"
set "PACKAGE_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%PACKAGE_EXIT_CODE%"=="0" (
  echo [失败] 打包没有完成，请根据上面的错误提示处理后重试。
) else (
  echo [完成] 安装包已生成到 release 目录。
)
echo.
pause
exit /b %PACKAGE_EXIT_CODE%
