## Exa 访问

启动 dsh 前，在其进程环境中设置 `EXA_API_KEY`。可以使用 `$DSH_HOME/.env`，或在启动 dsh 的 shell 中设置。修改后需要重启 dsh。

每个预设连接 `https://mcp.exa.ai/mcp`，以 `mcp__exa__*` 名称提供 Exa 工具。同一预设的会话共用该预设的连接。

Exa 连接失败时，预设可能仍处于启用状态，但没有搜索工具。请检查 dsh Host 日志中的认证或连接错误。
