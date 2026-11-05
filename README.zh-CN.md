# dsh-plugins

[English](README.md) | 简体中文

本地 dsh 插件的 pnpm workspace。依赖版本集中在根目录 catalog（`pnpm-workspace.yaml`）。每个插件仍是单独可安装的目录。

## 包

| 包                  | 路径                         | 作用               |
| ------------------- | ---------------------------- | ------------------ |
| `dsh-xai-auth`      | `packages/dsh-xai-auth`      | xAI SuperGrok 登录 |
| `dsh-ide-selection` | `packages/dsh-ide-selection` | VS Code 选区上下文 |
| `dsh-my-preset`     | `packages/dsh-my-preset`     | 我的预设           |

## 环境要求

Node.js 24.x 系列中的 24.9 或更高版本，以及 pnpm 12.16.1。两者都由 mise 安装。

## 初始化

在本目录执行：

```sh
mise trust
mise install
pnpm install
```

首次 `pnpm install` 会写入 `pnpm-lock.yaml`。之后在本目录安装依赖时，使用 `mise run install`。

## 任务

根任务只安装共享 lockfile。构建和检查每个插件时，进入该插件自己的目录执行 `mise run`。

## 发布

`release-please-config.json` 中的每个包各自独立定版并打 tag。插件包发布到 npm。VS Code 扩展的 VSIX 会先附加到对应的 GitHub Release，再发布到 Visual Studio Marketplace。参见 [RELEASE.md](RELEASE.md)。

## 安装插件

dsh 安装的是单个包目录，而不是本仓库根目录。

```sh
dsh plugin --profile <profile> add ./packages/dsh-xai-auth
dsh plugin --profile <profile> add ./packages/dsh-ide-selection
dsh plugin --profile <profile> add ./packages/dsh-my-preset
```

安装 `dsh-ide-selection` 之前需要先构建。`dsh-xai-auth` 已包含 `dist/index.js`，`dsh-my-preset` 只随附补丁文件。

本仓库放到 GitHub 之后：

```sh
dsh plugin --profile <profile> add github:pzyyll/dsh-plugins#path:/packages/dsh-xai-auth
```
