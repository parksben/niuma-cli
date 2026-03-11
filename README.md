# niuma-cli

> 牛马产品统一命令行工具 🐂🐴

## 简介

`niuma-cli` 是牛马（niuma）产品的命令行工具，用于在服务器或本地电脑上完成：

1. 检测并连接已安装的 OpenClaw（支持多实例，可手动指定路径）
2. 配置邮箱 SMTP
3. 在 OpenClaw 上创建牛马 Agent 套件（规划师、工程师、设计师、分析师、文案）
4. 一键部署并启动 niuma-server（支持 HTTPS + 域名配置）

## 安装

```bash
npm install -g niuma-cli
```

## 快速开始

```bash
niuma install
```

按照交互式向导完成所有配置，5 步搞定。

也可以指定 OpenClaw 路径（多实例场景）：

```bash
niuma install --openclaw-path /opt/my-openclaw
```

## 命令说明

| 命令 | 说明 |
|------|------|
| `niuma install` | 交互式安装向导（首次使用从这里开始） |
| `niuma install --openclaw-path <path>` | 指定 OpenClaw 安装路径 |
| `niuma server start` | 启动 niuma-server |
| `niuma server stop` | 停止 niuma-server |
| `niuma server restart` | 重启 niuma-server |
| `niuma server status` | 查看运行状态 |
| `niuma server logs` | 查看日志（`-f` 实时跟踪） |
| `niuma agents list` | 查看已安装的 Agent |

## 前提条件

- Node.js 18+
- 已安装 [OpenClaw](https://openclaw.ai)（Gateway 正在运行）
- git（用于克隆 niuma-server）
- systemd（用于服务管理，Linux 环境）
- 可选：Caddy（用于 HTTPS 自动证书）

## 相关仓库

- App：[niuma](https://github.com/parksben/niuma)
- 服务端：[niuma-server](https://github.com/parksben/niuma-server)
