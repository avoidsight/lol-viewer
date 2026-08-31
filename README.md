# LOL Viewer（英雄联盟对战实时查看器）

基于 Electron + React 的本地英雄联盟辅助工具，直接读取本机英雄联盟客户端的本地接口（LCU），提供实时对战阵容对比、个人战绩与英雄资料查询。

## 功能

- 战绩：个人最近 20 场战绩、常用英雄、KDA、胜率、全场最佳标记
- 对战信息：英雄选择 / 游戏中的 5v5 阵容对比，展示每个位置的英雄、段位、最近 10 场 KDA、出装、召唤师技能
- 英雄资料库：英雄搜索、技能加点、出装推荐
- 设置：自动接受对局等开关

## 项目结构

```
apps/desktop   Electron 桌面应用（主进程 + preload + React 渲染进程）
docs           设计文档
```

## 环境要求

- Windows 10/11 x64
- Node.js >= 22（推荐 24）
- pnpm 10.13.1（仓库通过 packageManager 字段固定版本）
- 英雄联盟客户端已登录（对战信息依赖本机 LCU 端口；未进入游戏或英雄选择时无实时数据）
- 首次安装依赖时允许构建原生模块 better-sqlite3（已在 pnpm-workspace.yaml 中配置 allowBuilds）

## 安装与运行

```bash
pnpm install
pnpm dev
```

## 校验（提交前必须通过）

在 `apps/desktop` 下执行：

```bash
pnpm verify
```

包含：单元测试（Vitest）、类型检查（tsc）、原生模块重建、SQLite 冒烟测试、生产构建。

## 打包

在 `apps/desktop` 下执行：

```bash
# NSIS 安装包
pnpm package:win

# 免安装目录（win-unpacked）
pnpm exec electron-builder --win dir --x64 --publish never
```

产物输出到 `apps/desktop/dist`。

## 开发约定

- 不提交构建产物：`node_modules`、`out`、`dist*`、`outputs`、`test-results` 等已加入 `.gitignore`
- 修改 LCU / 对局数据链路时，同步更新 `apps/desktop/src/main/match/match-service.test.ts` 等测试
- 新增 IPC 接口时在 `src/shared/ipc.ts` 定义并校验 schema
- 提交信息遵循 conventional commits（feat / fix / docs / refactor 等）