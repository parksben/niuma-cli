# 🐂🐴 niuma-cli

牛马多 Agent 协作平台命令行工具。

## 快速安装

```bash
curl -fsSL https://ghproxy.net/https://raw.githubusercontent.com/parksben/niuma-cli/main/install.sh | bash
```

> 国内用户推荐使用上方镜像地址，速度更快。如需直连 GitHub：
> ```bash
> curl -fsSL https://raw.githubusercontent.com/parksben/niuma-cli/main/install.sh | bash
> ```

安装完成后运行：

```bash
niuma install
```

按照向导完成部署，即可启动你的 AI 团队。

## 功能

- `niuma install` — 一键部署 niuma-server + OpenClaw + Agent 套餐
- `niuma server start/stop/restart/status/logs` — 管理 niuma-server 服务
- `niuma agents list` — 查看已安装的 Agent
- `niuma agents install` — 安装/更新 Agent 套餐
- `niuma config` — 修改配置（SMTP、端口等）

## 系统要求

- Node.js 18+
- Linux / macOS（Windows 暂不支持）
- OpenClaw（安装向导会自动引导）

## 手动安装

```bash
git clone https://github.com/parksben/niuma-cli.git
cd niuma-cli
npm install
npm link
niuma install
```

## 更新

重新运行安装脚本即可获取最新版本：

```bash
curl -fsSL https://ghproxy.net/https://raw.githubusercontent.com/parksben/niuma-cli/main/install.sh | bash
```

## License

MIT
