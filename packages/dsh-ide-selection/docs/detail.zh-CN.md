# IDE 选区

将当前 VS Code 文件和选区带入 dsh 对话。两端集成需要运行在同一台电脑上。

## 连接 VS Code

安装 [DSH IDE Selection 扩展](https://marketplace.visualstudio.com/items?itemName=balaenis.dsh-ide-selection-vscode)，然后重新加载 VS Code。打开受信任的本地工作区，在该工作区目录或其上级目录启动 dsh。

输入框旁的 IDE 状态显示 VS Code 是否已连接。在 VS Code 中选中文本，再到 dsh 发送消息。最新选区会随消息保存；没有选区时，仅包含当前打开文件的路径。子代理不会收到该选区。

## 选择窗口

点击 IDE 状态按钮或运行 `/select-ide`，选择匹配的 VS Code 窗口、按工作区自动匹配，或为当前会话关闭 IDE 集成。

VS Code 工作区文件夹必须等于 dsh 工作区，或是它的子目录。所选窗口断开后，不会自动改用其他窗口。

## 诊断操作

保持对应的 dsh Web 输入框打开，在 VS Code 的错误或警告处打开快速修复：

- **DSH: Send diagnostic**：将诊断和附近代码加入 dsh 草稿，由你检查后发送，不会运行代理。
- **DSH: Fix it**：发送独立的修复请求，启动一轮代理任务；代理忙碌时排队。此操作可能按会话权限修改文件，但不会发送已有草稿。

每个操作只交给一个匹配的输入框，需要指定接收方时请关闭其他匹配的输入框。两个操作均需要更新后的两端集成，不支持无界面会话。

## 检查连接

VS Code 状态栏显示 `DSH: waiting` 或 `DSH: connected`，点击可打开 **DSH IDE Selection** 输出通道。

不要选中或发送包含机密的代码。
