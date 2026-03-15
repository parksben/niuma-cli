#!/bin/bash
set -e

# ─────────────────────────────────────────
#  牛马（Niuma）安装脚本
#  从 github.com/parksben/niuma/releases 下载对应平台二进制
# ─────────────────────────────────────────

NIUMA_REPO="parksben/niuma"
INSTALL_DIR="$HOME/.niuma"
BIN_DIR="$INSTALL_DIR/bin"
CONFIG_FILE="$INSTALL_DIR/config.json"

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}🐂🐴 牛马（Niuma）安装向导${RESET}"
echo "──────────────────────────────────────"

# ── 检测平台 ──────────────────────────────
detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS" in
    linux*)
      case "$ARCH" in
        x86_64)  PLATFORM="linux-x64" ;;
        aarch64) PLATFORM="linux-arm64" ;;
        arm64)   PLATFORM="linux-arm64" ;;
        *)       echo -e "${RED}不支持的架构: $ARCH${RESET}"; exit 1 ;;
      esac
      ;;
    darwin*)
      case "$ARCH" in
        x86_64) PLATFORM="macos-x64" ;;
        arm64)  PLATFORM="macos-arm64" ;;
        *)      echo -e "${RED}不支持的架构: $ARCH${RESET}"; exit 1 ;;
      esac
      ;;
    msys*|mingw*|cygwin*)
      PLATFORM="win-x64"
      EXE_SUFFIX=".exe"
      ;;
    *)
      echo -e "${RED}不支持的操作系统: $OS${RESET}"
      exit 1
      ;;
  esac

  CLI_BINARY="niuma-${PLATFORM}${EXE_SUFFIX:-}"
  SERVER_BINARY="niuma-server-${PLATFORM}${EXE_SUFFIX:-}"
  echo -e "检测到平台: ${BOLD}${PLATFORM}${RESET}"
}

# ── 获取最新版本 ──────────────────────────
get_latest_version() {
  echo "获取最新版本..."
  LATEST=$(curl -fsSL "https://api.github.com/repos/${NIUMA_REPO}/releases/latest" \
    | grep '"tag_name"' | cut -d'"' -f4)
  if [ -z "$LATEST" ]; then
    echo -e "${RED}无法获取最新版本，请检查网络连接${RESET}"
    exit 1
  fi
  echo -e "最新版本: ${BOLD}${LATEST}${RESET}"
}

# ── 下载文件 ──────────────────────────────
download_file() {
  local url="$1"
  local dest="$2"
  local name="$3"

  echo -n "下载 ${name}..."

  # 先尝试直连 GitHub（海外/macOS 用户通常无障碍）
  if curl -fsSL --connect-timeout 10 --max-time 120 -o "$dest" "$url" 2>/dev/null; then
    chmod +x "$dest"
    echo -e " ${GREEN}✓${RESET}"
    return
  fi

  # 直连失败，尝试 ghproxy 镜像（国内加速）
  echo -n " (直连超时，尝试镜像)..."
  PROXY_URL="https://ghproxy.net/${url}"
  if curl -fsSL --connect-timeout 10 --max-time 120 -o "$dest" "$PROXY_URL" 2>/dev/null; then
    chmod +x "$dest"
    echo -e " ${GREEN}✓${RESET}"
    return
  fi

  echo -e " ${RED}✗ 下载失败${RESET}"
  echo -e "${RED}请手动下载: ${url}${RESET}"
  exit 1
}

# ── 主流程 ────────────────────────────────
detect_platform
get_latest_version

BASE_URL="https://github.com/${NIUMA_REPO}/releases/download/${LATEST}"

mkdir -p "$BIN_DIR"

# 下载 CLI 二进制
download_file \
  "${BASE_URL}/${CLI_BINARY}" \
  "${BIN_DIR}/niuma${EXE_SUFFIX:-}" \
  "niuma CLI"

# 下载 Server 二进制
download_file \
  "${BASE_URL}/${SERVER_BINARY}" \
  "${BIN_DIR}/niuma-server${EXE_SUFFIX:-}" \
  "niuma server"

# ── 配置向导 ──────────────────────────────
echo ""
echo -e "${BOLD}配置向导${RESET}"
echo "──────────────────────────────────────"

read -p "OpenClaw Gateway URL [ws://localhost:18789]: " GATEWAY_URL
GATEWAY_URL=${GATEWAY_URL:-ws://localhost:18789}

read -sp "OpenClaw Gateway Token: " GATEWAY_TOKEN
echo ""

read -p "服务端口 [3000]: " PORT
PORT=${PORT:-3000}

mkdir -p "$INSTALL_DIR"
cat > "$CONFIG_FILE" <<CONF
{
  "OPENCLAW_GATEWAY_URL": "${GATEWAY_URL}",
  "OPENCLAW_GATEWAY_TOKEN": "${GATEWAY_TOKEN}",
  "PORT": ${PORT}
}
CONF

# ── 写入 PATH ─────────────────────────────
SHELL_RC=""
case "$SHELL" in
  */zsh)  SHELL_RC="$HOME/.zshrc" ;;
  */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
  *)      SHELL_RC="$HOME/.bashrc" ;;
esac

if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# niuma" >> "$SHELL_RC"
  echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
fi

export PATH="$BIN_DIR:$PATH"

# ── 完成 ──────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✅ 安装完成！${RESET}"
echo "──────────────────────────────────────"
echo -e "  版本: ${BOLD}${LATEST}${RESET}"
echo -e "  CLI:  ${BIN_DIR}/niuma"
echo -e "  服务: ${BIN_DIR}/niuma-server"
echo ""
echo -e "启动服务端："
echo -e "  ${BOLD}niuma server start${RESET}"
echo ""
echo -e "App 扫码连接后即可使用 🚀"
echo "──────────────────────────────────────"
