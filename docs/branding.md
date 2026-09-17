# 峡谷雷达品牌名称

2026-09-17 将客户端对外名称统一为“峡谷雷达”：导航、窗口标题、重连提示、赞赏文案、安装程序/快捷方式的 productName，以及一键打包窗口。安装包文件名为 `峡谷雷达-<版本>-windows-x64-setup.exe`；对应 SHA256 文本使用 UTF-8，保留中文文件名。

内部 `@lol-viewer/desktop` 包名、`cn.lolviewer.desktop` appId、数据库文件及设备标识命名空间不变，也不新增顶层 productName 或调用 app.setName，以保持既有 Electron 数据目录解析。Electron 的 getName 优先读取顶层 productName，其次 name；参见 [Electron app 文档](https://www.electronjs.org/docs/latest/api/app#appgetname)。历史设计文档中的旧名称保留。

验证：类型检查、10 项打包/版本/赞赏相关测试、构建和 3 项 Electron 交互流程通过；窗口标题及导航名称已由真实 Electron 检查。Windows 安装、旧版覆盖升级与中文快捷方式需新 Windows 包实机确认。安装版不会因网页部署自动更名，需重新打包安装；本次版本号仍为 1.0.0。
