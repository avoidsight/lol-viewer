[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Utf8Encoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $Utf8Encoding
[Console]::OutputEncoding = $Utf8Encoding
$OutputEncoding = $Utf8Encoding

$RequiredNodeMajor = 22
$PnpmVersion = "10.13.1"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DesktopDirectory = Join-Path $ProjectRoot "apps\desktop"
$PortableDirectory = Join-Path $DesktopDirectory "dist\win-unpacked"

function Write-Step {
    param(
        [int]$Number,
        [string]$Message
    )

    Write-Host ""
    Write-Host "[$Number/2] $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathParts = @()

    foreach ($programFilesPath in @($env:ProgramW6432, $env:ProgramFiles)) {
        if ($programFilesPath) {
            $officialNodePath = Join-Path $programFilesPath "nodejs"
            if ((Test-Path (Join-Path $officialNodePath "node.exe")) -and $pathParts -notcontains $officialNodePath) {
                $pathParts += $officialNodePath
            }
        }
    }
    if ($machinePath) {
        $pathParts += $machinePath
    }
    if ($userPath) {
        $pathParts += $userPath
    }
    $env:Path = $pathParts -join ";"
}

function Install-Or-UpdateNode {
    param([bool]$IsUpgrade)

    $winget = Get-Command "winget.exe" -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "未找到 Node.js $RequiredNodeMajor+，并且当前系统没有 winget。请先从 https://nodejs.org/ 安装 Node.js LTS 后重新运行。"
    }

    $wingetArguments = @(
        "--id", "OpenJS.NodeJS.LTS",
        "--exact",
        "--source", "winget",
        "--accept-package-agreements",
        "--accept-source-agreements"
    )

    if ($IsUpgrade) {
        Write-Host "Node.js 版本过低，正在通过 winget 更新 LTS 版本……" -ForegroundColor Yellow
        & $winget.Source upgrade @wingetArguments
        $wingetExitCode = $LASTEXITCODE

        if ($wingetExitCode -ne 0) {
            Write-Host "winget 未识别现有的 Node.js 安装，改为安装并覆盖为最新 LTS 版本……" -ForegroundColor Yellow
            $installArguments = $wingetArguments + "--force"
            & $winget.Source install @installArguments
            $wingetExitCode = $LASTEXITCODE
        }
    } else {
        Write-Host "未检测到 Node.js，正在通过 winget 安装 LTS 版本……" -ForegroundColor Yellow
        & $winget.Source install @wingetArguments
        $wingetExitCode = $LASTEXITCODE
    }

    if ($wingetExitCode -ne 0) {
        throw "winget 安装 Node.js 失败（退出码：$wingetExitCode）。请从 https://nodejs.org/ 手动安装 LTS 版本后重试。"
    }

    Refresh-ProcessPath
}

function Get-BestNodeInstallation {
    $candidatePaths = @()

    foreach ($programFilesPath in @($env:ProgramW6432, $env:ProgramFiles)) {
        if ($programFilesPath) {
            $candidatePaths += Join-Path $programFilesPath "nodejs\node.exe"
        }
    }

    $pathCommands = @(Get-Command "node.exe" -All -ErrorAction SilentlyContinue)
    foreach ($pathCommand in $pathCommands) {
        $candidatePaths += $pathCommand.Source
    }

    $bestInstallation = $null
    foreach ($candidatePath in @($candidatePaths | Select-Object -Unique)) {
        if (-not $candidatePath -or -not (Test-Path $candidatePath)) {
            continue
        }

        try {
            $versionOutput = (& $candidatePath --version 2>$null).Trim()
            if ($LASTEXITCODE -ne 0) {
                continue
            }
            $version = [version]$versionOutput.TrimStart("v")
        } catch {
            continue
        }

        if (-not $bestInstallation -or $version -gt $bestInstallation.Version) {
            $bestInstallation = [PSCustomObject]@{
                Path = $candidatePath
                Directory = Split-Path -Parent $candidatePath
                Version = $version
            }
        }
    }

    return $bestInstallation
}

function Invoke-Pnpm {
    param([string[]]$PnpmArguments)

    & $script:NpxCommand --yes "pnpm@$PnpmVersion" @PnpmArguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm 命令执行失败（退出码：$LASTEXITCODE）：pnpm $($PnpmArguments -join ' ')"
    }
}

if ($env:OS -ne "Windows_NT") {
    throw "此脚本只能在 Windows 10/11 上运行。"
}

try {
    Write-Host "正在检查 Node.js 和 pnpm 环境……" -ForegroundColor Cyan

    $nodeInstallation = Get-BestNodeInstallation
    if (-not $nodeInstallation) {
        Install-Or-UpdateNode -IsUpgrade $false
    } elseif ($nodeInstallation.Version.Major -lt $RequiredNodeMajor) {
        Install-Or-UpdateNode -IsUpgrade $true
    }

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        Refresh-ProcessPath
        $nodeInstallation = Get-BestNodeInstallation
        if ($nodeInstallation -and $nodeInstallation.Version.Major -ge $RequiredNodeMajor) {
            break
        }
        Start-Sleep -Seconds 1
    }

    if (-not $nodeInstallation -or $nodeInstallation.Version.Major -lt $RequiredNodeMajor) {
        throw "Node.js 安装完成后仍无法找到 $RequiredNodeMajor+ 版本。请重启电脑后再次运行本脚本。"
    }

    # 将选中的 Node 目录放到 PATH 最前面，避免 pnpm 等子进程的启动器从 PATH
    # 解析到旧版本 node（例如 D:\env\nodejs 下的 v16），导致 pnpm 拒绝运行。
    if ($env:Path -notlike "$($nodeInstallation.Directory)*") {
        $env:Path = "$($nodeInstallation.Directory);$env:Path"
    }

    $npxPath = Join-Path $nodeInstallation.Directory "npx.cmd"
    if (-not (Test-Path $npxPath)) {
        throw "未找到 npx.cmd。请重新安装 Node.js LTS 后再试。"
    }

    $script:NpxCommand = $npxPath
    Write-Host "Node.js $($nodeInstallation.Version)（$($nodeInstallation.Path)）" -ForegroundColor Green
    Write-Host "pnpm $PnpmVersion（脚本会自动下载并使用固定版本）" -ForegroundColor Green

    # 国内网络优化：默认从 npmmirror 下载 Electron 与 electron-builder 工具链，
    # 避免直连 GitHub 超时；若用户已自行设置镜像，则尊重已有配置。
    if (-not $env:ELECTRON_MIRROR) {
        $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
    }
    if (-not $env:ELECTRON_BUILDER_BINARIES_MIRROR) {
        $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
    }

    while ($true) {
        Write-Host ""
        Write-Host "请选择要执行的操作：" -ForegroundColor Cyan
        Write-Host "  [1] 启动开发模式（热更新，不打包直接运行）"
        Write-Host "  [2] 打包免安装可执行版（win-unpacked，双击 exe 直接运行）"
        Write-Host "  [0] 退出"
        $choice = Read-Host "请输入数字后回车"

        switch ($choice) {
            "1" {
                Push-Location $ProjectRoot
                try {
                    Write-Step 1 "安装项目依赖"
                    Invoke-Pnpm -PnpmArguments @("install", "--frozen-lockfile")

                    Write-Step 2 "启动开发模式（关闭应用后返回本菜单）"
                    Invoke-Pnpm -PnpmArguments @("--dir", "apps/desktop", "dev")
                } finally {
                    Pop-Location
                }
            }
            "2" {
                Push-Location $ProjectRoot
                try {
                    Write-Step 1 "安装项目依赖"
                    Invoke-Pnpm -PnpmArguments @("install", "--frozen-lockfile")

                    Write-Step 2 "打包免安装可执行版"
                    Invoke-Pnpm -PnpmArguments @("--dir", "apps/desktop", "package:portable")

                    $portableExe = Get-ChildItem -Path $PortableDirectory -Filter "*.exe" -File |
                        Sort-Object LastWriteTime -Descending |
                        Select-Object -First 1
                    if (-not $portableExe) {
                        throw "打包命令已结束，但在 $PortableDirectory 中没有找到可执行文件。"
                    }

                    Write-Host ""
                    Write-Host "免安装版已生成，可直接双击运行：" -ForegroundColor Green
                    Write-Host "  $($portableExe.FullName)"
                    Write-Host "也可以把 win-unpacked 文件夹整个复制给其他电脑直接运行。" -ForegroundColor Green
                } finally {
                    Pop-Location
                }
            }
            "0" {
                exit 0
            }
            default {
                Write-Host "无效输入，请输入 1、2 或 0。" -ForegroundColor Yellow
            }
        }
    }
} catch {
    Write-Host ""
    Write-Host "执行失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "如果错误来自网络下载，请确认可以访问 npm 和 Electron 下载源后重试。" -ForegroundColor Yellow
    exit 1
}

exit 0
