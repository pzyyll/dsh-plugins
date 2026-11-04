# dsh-my-preset

[English](README.md) | 中文

这个 bundle 声明两个 preset。两者都去掉原生的 `web_search` / `web_fetch`，并在该 preset 自己的 tool scope 里挂上 Exa MCP（`mcp__exa__*`）。

| Preset        | 基于          | 保留的部分                                                       |
| ------------- | ------------- | ---------------------------------------------------------------- |
| **M-PTC**     | 内置 `ptc`    | PTC 工具呈现；workflow 工具保持禁用                              |
| **M-Creator** | 内置 `cordis` | Creator 工具：`tool-cordis`、preset 编写技能、插件管理、workflow |

内置 preset（`standard`、`ptc`、`minimal`、`cordis`）看不到 Exa。这两个 preset 各自有注册 scope，所以都可以用 serverName `exa`。

## 安装

preset 通过安装声明它的 bundle 创建：

```sh
dsh plugin --profile <profile> add ./packages/dsh-my-preset
```

之后 profile 会加载这两条声明。新建会话可以在 preset 列表里选择 `M-PTC` 或 `M-Creator`；已经在运行的会话保持它启动时的组合。

## Exa MCP

每个 preset 都以 `exa` 作为 serverName 加载 `@deepseek-ai/dsh-mcp-client`，走 Streamable HTTP，地址是 `https://mcp.exa.ai/mcp`，把 `EXA_API_KEY` 放进 `x-api-key` 请求头。这个 key 必须在进程环境里（`$DSH_HOME/.env` 或启动 dsh 的 shell）；缺了它请求头为空，服务端会拒绝会话，`mcp__exa__*` 工具就不会出现。preset 本身仍会激活，客户端按重连策略继续重试并记录失败。

preset revision 只加载一次，选择它的会话共用这一份，所以是每个已加载的 preset 一条 Exa 连接，而不是每个会话一条。

## 文件

| 文件                          | 作用                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `package.json`                | bundle 清单。`dsh.bundle.patch` 是按顺序排列的 patch 列表。 |
| `presets/m-ptc.patch.yml`     | `preset-m-ptc` 的声明。                                     |
| `presets/m-creator.patch.yml` | `preset-m-creator` 的声明。                                 |

## 与内置 preset 的差异

两个 preset 都删除 `tool-web`（`web_search`、`web_fetch`），并新增 `mcp-exa`（`@deepseek-ai/dsh-mcp-client`，serverName 为 `exa`）。

- **M-PTC** 复制 `ptc`，包括禁用的 workflow 行和 `tool-presentation` 的 `ptc` 模式。显示名 `M-PTC`，`order: 5`。
- **M-Creator** 复制 `cordis`：workflow 启用、`tool-cordis`、preset 编写技能目录，以及在有 profile 时启用的插件管理工具。显示名 `M-Creator`，`order: 6`。

DSH 更新 `ptc` 或 `cordis` 后，重新复制那份列表、删掉 `tool-web`，并保留 `mcp-exa` 条目。
