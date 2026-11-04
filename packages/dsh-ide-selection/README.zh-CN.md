# dsh-ide-selection

[English](README.md) | 中文

在 dsh 中显示当前 VS Code 选区，并在你发送消息时带上该选区。

需要同时安装 dsh 插件和 VS Code 扩展。一方不会启动另一方。

**要求：** dsh `0.2.1-rc.5`、24.x 系列中 24.9 或更高版本的 Node.js，以及 VS Code 1.144 或更高版本。

## 安装

### dsh 插件

在 `dsh-plugins` 仓库根目录执行：

```sh
mise trust
mise install
```

在 `packages/dsh-ide-selection` 中执行：

```sh
mise run install
mise run build
```

这一步不会安装 VS Code 扩展。

安装本包目录，不要安装仓库根目录。在仓库根目录执行：

```sh
dsh plugin --profile <profile> add ./packages/dsh-ide-selection
```

也可以在 Web UI 中安装该目录。

### VS Code 扩展

在 `packages/dsh-ide-selection` 中执行：

```sh
mise run package:vsix
cd ide-plugins/vscode && code --install-extension dist/dsh-ide-selection-vscode-$(node -p "require('./package.json').version").vsix
```

也可以使用 **扩展: 从 VSIX 安装...**（Extensions: Install from VSIX...）。安装后重新加载 VS Code。

扩展在受信任的本地工作区中运行，不会启动 dsh。如果没有启动，请查看 **DSH IDE Selection** 输出通道。

## 使用

1. 在 VS Code 中选中希望 dsh 看到的文本。多个选区都会保留。没有选中文本时，dsh 只收到当前打开文件的路径。
2. 在该工作区内部的某个目录启动 dsh。
3. 发送一条消息。

发送时的选区会随消息一起加入会话，并保留在会话历史中。子代理不会带上选区。VS Code 未连接时，仍然可以发送消息。不要选中机密。

Web UI 连上 VS Code 后，输入区显示：

| 选区                 | 状态                 |
| -------------------- | -------------------- |
| 已连接，没有选中文本 | `⧉`                  |
| 一行                 | `⧉ Selected`         |
| 多行                 | `⧉ N Lines Selected` |

`N` 是选中的行数。悬停状态可查看文件和行范围，例如 `#L10-L20`。第一条消息发出之前，同一状态显示在工作区和预设控件旁边。VS Code 断开后状态消失，状态中不显示选中的文本。状态文字保持英文。

### 选择 IDE

运行 `/select-ide`。列表显示每个可连接的 VS Code 窗口及其文件夹。选择一个窗口、**自动（按工作区匹配）**，或 **关闭 IDE 集成**。选择立即作用于当前会话。关闭列表会保留当前选择。

自动选择使用打开了当前工作区的 VS Code 窗口。有多个匹配时，使用最接近的工作区。也可以改为选择打开了其他文件夹的窗口。该窗口断开后，dsh 不会改用另一个窗口。离开会话或重启插件后，该选择失效。

此功能只适用于同一台电脑上的 VS Code。
