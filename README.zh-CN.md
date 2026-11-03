# dsh-xai-auth

[English](README.md) | 中文

通过 [cli-chat-proxy](https://cli-chat-proxy.grok.com/v1) 在 dsh 中使用 xAI SuperGrok 或 X Premium 订阅。无需 `XAI_API_KEY`，不影响内置的 `xai` API 路由。

## 安装

在 `dsh-xai-auth` 的父目录中运行：

```sh
dsh plugin --profile <profile> add ./dsh-xai-auth
```

需要 dsh `>=0.2.0 <0.3.0`。默认配置已包含所需服务。

## 使用

1. 在插件页面打开 **dsh-xai-auth**，选择 **登录**。
2. 打开验证页面，输入验证码并批准登录。
3. 选择 `xai-supergrok/...` 模型，开始对话。

插件页面提供以下操作：

- **刷新模型**：更新模型列表。
- **用量**：查看订阅额度和账单详情，结果缓存 2 分钟。选择 `xai-supergrok` 模型后，聊天输入区也会显示剩余额度百分比。
- **退出登录**：删除本地凭据，不会撤销 xAI 端的令牌。

## 注意事项

- 如果在等待登录批准时刷新页面，请重新选择 **登录**。
- 模型标价是短上下文 API 价格，不代表订阅用量。请通过 **用量** 查看订阅额度。
- 设置 `GROK_OAUTH_USE_API_URL=1`，可改用 `https://api.x.ai/v1`，而非 cli-chat-proxy。

## 许可证

[MIT](LICENSE)
