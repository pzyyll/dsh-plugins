# dsh-usages

[English](README.md) | 简体中文

在侧栏账户上方显示当前会话的用量。默认是 DeepSeek 余额；当前模型切到 OpenCode Go 时，改为显示剩余额度。点击可查看已配置渠道的详情。未配置的渠道不会出现。金额保留两位小数。

OpenCode 密钥只留在主机侧。插件先从凭据库读取 `OPENCODE_GO_API_KEY`，没有时再读进程环境变量。密钥不会发到页面。

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
