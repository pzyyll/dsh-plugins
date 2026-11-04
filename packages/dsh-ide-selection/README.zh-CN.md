# dsh-ide-selection

[English](README.md) | 中文

在 dsh 中显示当前 VS Code 选区，并在你发送消息时带上该选区。

需要同时安装 dsh 插件和 VS Code 扩展。一方不会启动另一方。

<img width="1499" height="807" alt="image" src="https://github.com/user-attachments/assets/b3183386-b595-4414-95d7-ce0051d5b1b2" />

<img width="1497" height="430" alt="image" src="https://github.com/user-attachments/assets/c9fecce4-821a-4fcf-b0ba-ee8b3272ceb3" />

## 安装

### dsh 插件

从 npm 安装 [@balaenis/dsh-ide-selection](https://www.npmjs.com/package/@balaenis/dsh-ide-selection)：

```sh
dsh plugin --profile <profile> add @balaenis/dsh-ide-selection
```

将 `<profile>` 替换为你的 dsh 配置名称。

### VS Code 扩展

从 VS Code Marketplace 安装 [DSH IDE Selection](https://marketplace.visualstudio.com/items?itemName=balaenis.dsh-ide-selection-vscode)，或执行：

```sh
code --install-extension balaenis.dsh-ide-selection-vscode
```

安装后重新加载 VS Code。

扩展在受信任的本地工作区中运行，不会启动 dsh。如果没有启动，请查看 **DSH IDE Selection** 输出通道。

## 使用

1. 在 VS Code 中选中希望 dsh 看到的文本。多个选区都会保留。没有选中文本时，dsh 只收到当前打开文件的路径。
2. 在包含 VS Code 文件夹的工作区根目录启动 dsh。
3. 发送一条消息。

发送时的选区会随消息一起加入会话，并保留在会话历史中。子代理不会带上选区。VS Code 未连接时，仍然可以发送消息。不要选中机密。

Web UI 输入区始终显示 IDE 状态：

| 选区                 | 状态            |
| -------------------- | --------------- |
| 未连接               | `⧉` （变灰）    |
| 已连接，没有选中文本 | `⧉`             |
| 一行                 | `⧉ 已选中`      |
| 多行                 | `⧉ 已选中 N 行` |

VS Code 未连接时，状态仍会显示，图标变暗；连接后图标恢复正常亮度。`N` 是选中的行数。悬停状态可查看文件和行范围，例如 `#L10-L20`。第一条消息发出之前，同一状态显示在工作区和预设控件旁边，状态中不显示选中的文本。状态和 `/select-ide` 的说明跟随 Web UI 的语言。

### 发送诊断

1. 打开 VS Code 工作区对应的 dsh Web 会话，保持输入框打开。
2. 在 VS Code 中将光标放到错误或警告上，打开 **快速修复**（Windows/Linux：`Ctrl+.`，macOS：`Cmd+.`）。
3. 选择 **DSH: Send diagnostic**。

诊断、文件路径、文档版本和附近代码会插入 dsh 输入框的光标位置。输入框选区以外的原有文本和引用标签保持不变。检查草稿后自行发送；此操作不会启动代理。不要发送包含机密的代码。

诊断沿用会话的 IDE 选择；关闭 IDE 集成也会停止诊断接收。多个匹配的输入框同时打开时，只有最先连接的输入框接收，不会广播。需要指定接收方时，请关闭其他匹配的输入框。诊断不会排队，也不会在重新连接后重放。输入框锁定时，Web UI 会保留诊断文本，并显示重试面板。

此功能需要同时更新 dsh 插件和 VS Code 扩展，仅支持 Web UI，不支持无界面会话。

### 选择 IDE

点击状态按钮或运行 `/select-ide` 打开选择器。状态弹窗显示所有可连接的 VS Code 窗口及文件夹；dsh 工作区之外的条目可见但不可选。`/select-ide` 只列出可选的匹配窗口，以及 **自动（按工作区匹配）** 和 **关闭 IDE 集成**。选择一项后会立即应用于当前会话。关闭列表会保留当前选择。

当 VS Code 窗口的任一工作区文件夹等于 dsh 工作区目录，或是它的子目录时，该窗口才匹配；IDE 文件夹是 dsh 工作区的上级目录时不匹配。自动选择优先使用同一目录，其次选择最近的子目录；距离相同时优先使用最近有更新的窗口。所选窗口断开后，dsh 不会改用另一个窗口。离开会话或重启插件后，该选择失效。

此功能只适用于同一台电脑上的 VS Code。
