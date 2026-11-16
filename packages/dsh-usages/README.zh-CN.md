# dsh-usages

[English](README.md) | 简体中文

在内容区边缘显示一枚悬浮胶囊。会话里跟随当前模型的渠道，只显示金额或剩余额度，不写渠道名。离开会话界面时，已配置 DeepSeek 就显示其余额；没有配置 DeepSeek 时才显示第一个已配置渠道。点击可查看已配置渠道的详情。金额保留两位小数。

OpenCode 密钥只留在主机侧。插件先从凭据库读取 `OPENCODE_GO_API_KEY`，没有时再读进程环境变量。密钥不会发到页面。

其他插件可以在主机上登记用量，而不引用本包。本插件提供 Cordis 服务 `usageSources`。`register({ id, providers, read })` 返回解除函数；同一 `id` 再次登记会换掉旧的。`read(refresh, signal)` 返回 `ready`（`title` 和窗口）、`signed-out`、`failed` 或 `unavailable`。窗口含 `id`、`label`、`usedPercent`、`remainingPercent`，以及可选的 `resetsAt`。服务不在时，来源插件继续显示自己的用量。

## 安装

先构建本包，再安装这个目录：

```sh
mise run build
dsh plugin --profile <profile> add ./packages/dsh-usages
```

拖动胶囊可移动，松手后吸附到最近的左或右边缘。刷新页面后位置重置。系统开启“减少动态效果”时会跳过吸附动画。

## 设置

| 设置        | 默认值                                | 作用                    |
| ----------- | ------------------------------------- | ----------------------- |
| `usageUrl`  | `https://opencode.ai/zen/go/v1/usage` | OpenCode Go 用量地址    |
| `apiKeyEnv` | `OPENCODE_GO_API_KEY`                 | Go API 密钥的环境变量名 |
| `timeoutMs` | `15000`                               | 请求超时，单位毫秒      |
