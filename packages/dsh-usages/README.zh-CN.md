# dsh-usages

[English](README.md) | 简体中文

在侧栏账户上方显示当前会话的用量。默认是 DeepSeek 余额；当前模型切到 OpenCode Go 时，改为显示剩余额度。点击可查看已配置渠道的详情。未配置的渠道不会出现。金额保留两位小数。

OpenCode 密钥只留在主机侧。插件先从凭据库读取 `OPENCODE_GO_API_KEY`，没有时再读进程环境变量。密钥不会发到页面。

其他插件可以在主机上登记用量，而不引用本包。本插件提供 Cordis 服务 `usageSources`。`register({ id, providers, read })` 返回解除函数；同一 `id` 再次登记会换掉旧的。`read(refresh, signal)` 返回 `ready`（`title` 和窗口）、`signed-out`、`failed` 或 `unavailable`。窗口含 `id`、`label`、`usedPercent`、`remainingPercent`，以及可选的 `resetsAt`。服务不在时，来源插件继续显示自己的用量。

## 安装

先构建本包，再安装这个目录：

```sh
mise run build
dsh plugin --profile <profile> add ./packages/dsh-usages
```

用量行出现在账户上方。侧栏收起时显示 OpenCode 剩余额度；点击后打开同一份详情。

## 设置

| 设置        | 默认值                                | 作用                    |
| ----------- | ------------------------------------- | ----------------------- |
| `usageUrl`  | `https://opencode.ai/zen/go/v1/usage` | OpenCode Go 用量地址    |
| `apiKeyEnv` | `OPENCODE_GO_API_KEY`                 | Go API 密钥的环境变量名 |
| `timeoutMs` | `15000`                               | 请求超时，单位毫秒      |
