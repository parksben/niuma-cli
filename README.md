# 🐂🐴 niuma-cli

牛马（Niuma）多 Agent 协作平台命令行安装工具。

## 快速安装

```bash
curl -fsSL https://raw.githubusercontent.com/parksben/niuma-cli/main/install.sh | bash
```

> 国内用户推荐：
> ```bash
> curl -fsSL https://ghproxy.net/https://raw.githubusercontent.com/parksben/niuma-cli/main/install.sh | bash
> ```

安装完成后运行：

```bash
niuma install
```

按照向导完成部署，即可启动你的 AI 团队。

---

## 功能

| 命令 | 说明 |
|------|------|
| `niuma install` | 一键部署 niuma-server + OpenClaw + Agent 套餐 |
| `niuma server start/stop/restart/status/logs` | 管理 niuma-server 服务 |
| `niuma agents list` | 查看已安装的 Agent |
| `niuma agents install` | 安装/更新 Agent 套餐 |
| `niuma config` | 修改配置（SMTP、端口等） |
| `niuma update` | 更新 niuma-server 到最新版 |

---

## 系统要求

- Linux / macOS（Windows 暂不支持）
- Node.js 18+
- 已安装 [OpenClaw](https://openclaw.ai)

---

## 更新

重新运行安装脚本即可获取最新版本：

```bash
curl -fsSL https://raw.githubusercontent.com/parksben/niuma-cli/main/install.sh | bash
```

---

## 相关链接

- 客户端下载：[niuma Releases](https://github.com/parksben/niuma/releases)
- 产品主页：[github.com/parksben/niuma](https://github.com/parksben/niuma)

---

## License

MIT
