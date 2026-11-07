# dsh-xai-auth

[English](README.md) | 中文

通过 [cli-chat-proxy](https://cli-chat-proxy.grok.com/v1) 在 dsh 中使用 xAI SuperGrok 或 X Premium 订阅。无需 `XAI_API_KEY`，不影响内置的 `xai` API 路由。

## 安装

从 GitHub 安装：

```sh
dsh plugin --profile <profile> add github:pzyyll/dsh-plugins#path:/packages/dsh-xai-auth
```

包内已包含预构建的服务端入口 `dist/index.js`，安装此插件无需构建。

如需重新构建本地仓库，先安装 [mise](https://mise.jdx.dev/getting-started.html)。在 `dsh-plugins` 仓库根目录安装共享工具链和锁文件：

```sh
mise trust
mise install
mise run install
```

然后在 `packages/dsh-xai-auth` 中运行：

```sh
mise run build
```

如需安装本地仓库，在 `dsh-plugins` 仓库根目录运行：

```sh
dsh plugin --profile <profile> add ./packages/dsh-xai-auth
```

需要 dsh `>=0.2.0 <0.3.0`。默认配置已包含所需服务。

## 使用

1. 在插件页面打开 **dsh-xai-auth**，选择 **登录**。
2. 打开验证页面，输入验证码并批准登录。
3. 选择 `xai-supergrok/...` 模型，开始对话。

插件页面提供以下操作：

- **刷新模型**：更新模型列表。
- **用量**：查看订阅额度和账单详情，结果缓存 2 分钟。
- **退出登录**：删除本地凭据，不会撤销 xAI 端的令牌。

登录后，在插件页面开启 **显示悬浮用量**。主内容区右边缘会显示矩形外框，内部为完整圆环，不受当前模型选择影响。外框贴边一侧为直边，外侧为圆角。蓝色圆环与中心百分比表示剩余额度，随使用量增加而减少，不显示用量文字。悬停仅显示“Grok 用量”和已用百分比提示，点击才打开用量详情，详情进度条同样表示剩余额度；再次点击、按 Escape 或点击外部可关闭。

开启 **仅在会话切换 Grok 模型时显示** 后，仅当正在显示会话页面，且当前会话使用本插件的 `xai-supergrok` 通道时显示入口。插件页面及所有其它主页面都会隐藏入口，即使后台仍保留 Grok 会话。此开关默认关闭，需同时开启 **显示悬浮用量**。其它通道（包括 API Key 的 Grok 模型）或无当前会话时隐藏入口，确认切换模型或会话后自动更新。

拖动入口可自由移动，拖出时恢复四角圆角和完整描边。松手后吸附到最近的左／右边缘，播放轻微的挤压回弹动画。系统开启“减少动态效果”时会跳过动画。内容区大小变化时会重新贴边，收起左侧栏不会隐藏图标。刷新页面后位置重置。控件使用 `shell.overlay` 插槽，保留原有 `showSidebarUsage` 配置键以兼容已保存的开关值。

## 注意事项

- 如果在等待登录批准时刷新页面，请重新选择 **登录**。
- 模型标价是短上下文 API 价格，不代表订阅用量。请通过 **用量** 查看订阅额度。
- 设置 `GROK_OAUTH_USE_API_URL=1`，可改用 `https://api.x.ai/v1`，而非 cli-chat-proxy。

## 开发

使用 Node.js `>=24.9.0`。在本包目录中，修改代码后运行：

```sh
mise run format
mise run lint
mise run typecheck
mise run test
mise run build
```

`mise run check` 会运行 lint、format、type 和 test 检查。代码编写规范见 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)
