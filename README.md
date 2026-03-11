# niuma-cli

> 牛马产品统一命令行工具 🐂🐴

## 简介

`niuma-cli` 是牛马（niuma）产品套件的统一命令行工具，帮助你完成：

- 一键安装并配置 OpenClaw（支持自定义路径）
- 配置邮箱 SMTP 等基础信息
- 初始化 Agent 套件
- 管理 niuma-server 服务（启动/停止/重启/状态/日志）

## 安装

```bash
npm install -g niuma-cli
```

## 快速开始

```bash
niuma install
```

按照交互式向导完成所有配置，5 步搞定。

## 命令说明

| 命令 | 说明 |
|------|------|
| `niuma install` | 交互式安装向导（首次使用请从这里开始） |
| `niuma config` | 修改已有配置 |
| `niuma server start` | 启动 niuma-server |
| `niuma server stop` | 停止 niuma-server |
| `niuma server restart` | 重启 niuma-server |
| `niuma server status` | 查看运行状态 |
| `niuma server logs` | 查看日志（支持 `-f` 实时跟踪） |
| `niuma agents list` | 查看已安装的 Agent |
| `niuma agents install` | 安装/更新 Agent 套餐 |
| `niuma version` | 查看版本信息 |

## 配置文件

配置保存在 `~/.niuma/config.json`，包括：

```json
{
  "openclawPath": "/root/.openclaw",
  "email": {
    "address": "your@email.com",
    "smtpHost": "smtp.126.com",
    "smtpPort": 465
  },
  "server": {
    "port": 3002,
    "path": "/opt/niuma-server"
  },
  "agents": ["planning", "coder", "writer", "analyst"]
}
```

## Agent 套餐

| 套餐 | 包含角色 |
|------|---------|
| 基础套餐 | Planning · Coder · Writer · Analyst |
| 研发团队 | 基础套餐 + Designer · DevOps · QA |
| 全家桶 | 所有角色 |
| 自定义 | 自由选择 |

## 系统要求

- Node.js >= 18
- Linux（推荐 systemd 环境）

## 开发

```bash
git clone https://github.com/parksben/niuma-cli.git
cd niuma-cli
npm install
node src/index.js --help
```

## License

MIT
