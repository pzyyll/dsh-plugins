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
- **用量**：查看订阅额度和账单详情，结果缓存 2 分钟。空白会话的 Hero 和聊天输入区会在当前或默认模型为 `xai-supergrok` 时显示剩余额度百分比。
- **退出登录**：删除本地凭据，不会撤销 xAI 端的令牌。

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
