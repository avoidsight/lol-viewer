# 中国大陆客户端冒烟测试

此检查只读访问本机 LCU。仅在测试者同意且英雄联盟客户端已打开、已登录并进入可提供当前对局参与者的状态时运行：

```powershell
pnpm --filter @lol-viewer/desktop lcu:smoke
```

命令仅打印 phase、participants 和 history 端点是否可用及其 schema 是否兼容。输出不会包含召唤师名称、召唤师 ID、认证 token、端口或原始响应。客户端未打开时命令返回退出码 2；这应记录为 `NOT RUN`，不能当作通过。

若 schema 不兼容，在获得测试者同意后保存最小化夹具：删除名称、ID、认证信息和其他个人数据，仅保留重现 schema 差异所需的字段。先添加失败测试，再修改适配器。

## Windows 安装包

`pnpm --filter @lol-viewer/desktop package:win` 在 `apps/desktop/dist/` 生成供本地测试者使用的未签名 NSIS 安装包。Windows 可能显示未知发布者警告。该产物不得公开发布；公开发布前必须配置正式代码签名、发布渠道与升级验证。
