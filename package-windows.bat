@echo off

rem Double-clicking this file first opens a dedicated console window. The second
rem invocation performs the real work inside that window and waits before exit.
if /I not "%~1"=="--console" (
  start "LOL Viewer - Windows Packaging" "%ComSpec%" /d /c call "%~f0" --console
  exit /b 0
)

setlocal
chcp 65001 >nul 2>&1
title LOL Viewer - Windows 一键打包
mode con cols=110 lines=34 >nul 2>&1

set "PROJECT_DIR=%~dp0"

echo ============================================================
echo LOL Viewer - Windows 一键打包
echo ============================================================
echo 源码目录：%PROJECT_DIR%
echo.
echo 即将执行以下步骤：
echo   [1/4] 检查 Node.js 和 pnpm 环境
echo   [2/4] 安装项目依赖
echo   [3/4] 构建 Windows x64 安装包
echo   [4/4] 整理安装包和 SHA256 校验文件
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
echo 按任意键退出……
pause >nul
exit /b %PACKAGE_EXIT_CODE%
