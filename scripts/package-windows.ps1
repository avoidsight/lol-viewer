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
$DesktopDistDirectory = Join-Path $DesktopDirectory "dist"
$ReleaseDirectory = Join-Path $ProjectRoot "release"

function Write-Step {
    param(
        [int]$Number,
        [string]$Message
    )

    Write-Host ""
    Write-Host "[$Number/4] $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $officialNodePath = Join-Path $env:ProgramFiles "nodejs"
    $pathParts = @()
    if (Test-Path $officialNodePath) {
        $pathParts += $officialNodePath
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

function Get-NodeVersion {
    $node = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if (-not $node) {
        return $null
    }

    $versionText = (& $node.Source --version).Trim().TrimStart("v")
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    try {
        return [version]$versionText
    } catch {
        return $null
    }
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
    Write-Step 1 "检查 Node.js 和 pnpm 环境"

    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion) {
        Install-Or-UpdateNode -IsUpgrade $false
        $nodeVersion = Get-NodeVersion
    } elseif ($nodeVersion.Major -lt $RequiredNodeMajor) {
        Install-Or-UpdateNode -IsUpgrade $true
        $nodeVersion = Get-NodeVersion
    }

    if (-not $nodeVersion -or $nodeVersion.Major -lt $RequiredNodeMajor) {
        throw "Node.js 安装完成后仍无法找到 $RequiredNodeMajor+ 版本。请重启电脑后再次运行本脚本。"
    }

    $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
    if (-not $npx) {
        throw "未找到 npx.cmd。请重新安装 Node.js LTS 后再试。"
    }

    $script:NpxCommand = $npx.Source
    Write-Host "Node.js $nodeVersion" -ForegroundColor Green
    Write-Host "pnpm $PnpmVersion（脚本会自动下载并使用固定版本）" -ForegroundColor Green

    Push-Location $ProjectRoot
    try {
        Write-Step 2 "安装项目依赖"
        Invoke-Pnpm -PnpmArguments @("install", "--frozen-lockfile")

        Write-Step 3 "构建 Windows x64 安装包"
        Invoke-Pnpm -PnpmArguments @("--dir", "apps/desktop", "package:win")

        Write-Step 4 "整理安装包和校验文件"
        $installer = Get-ChildItem -Path $DesktopDistDirectory -Filter "*-setup.exe" -File |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

        if (-not $installer) {
            throw "打包命令已结束，但在 $DesktopDistDirectory 中没有找到安装包。"
        }

        New-Item -ItemType Directory -Path $ReleaseDirectory -Force | Out-Null
        $releaseInstaller = Join-Path $ReleaseDirectory $installer.Name
        Copy-Item -Path $installer.FullName -Destination $releaseInstaller -Force

        $hash = (Get-FileHash -Path $releaseInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
        $hashFile = "$releaseInstaller.sha256"
        Set-Content -Path $hashFile -Value "$hash  $($installer.Name)" -Encoding ASCII

        Write-Host ""
        Write-Host "打包成功：" -ForegroundColor Green
        Write-Host "  安装包：$releaseInstaller"
        Write-Host "  SHA256：$hashFile"
        Write-Host ""
        Write-Host "将 release 目录中的 .exe 发给其他 Windows 10/11 x64 用户即可安装。" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} catch {
    Write-Host ""
    Write-Host "打包失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "如果错误来自网络下载，请确认可以访问 npm 和 Electron 下载源后重试。" -ForegroundColor Yellow
    exit 1
}

exit 0
