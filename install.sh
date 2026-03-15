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
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
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
  echo -n "获取最新版本..."
  LATEST=$(curl -fsSL --connect-timeout 10 "https://api.github.com/repos/${NIUMA_REPO}/releases/latest" \
    | grep '"tag_name"' | cut -d'"' -f4)
  if [ -z "$LATEST" ]; then
    echo -e " ${RED}✗${RESET}"
    echo -e "${RED}无法获取最新版本，请检查网络连接${RESET}"
    exit 1
  fi
  echo -e " ${GREEN}${LATEST}${RESET}"
}

# ── 进度条下载 ────────────────────────────
# 使用 curl 内置进度条（#号风格），紧凑美观
download_with_progress() {
  local url="$1"
  local dest="$2"
  local label="$3"
  local logfile="$4"

  # 先尝试直连 GitHub
  if curl -fL --connect-timeout 10 --max-time 300 --progress-bar -o "$dest" "$url" 2>>"$logfile"; then
    return 0
  fi

  # 直连失败，尝试 ghproxy 镜像
  local proxy_url="https://ghproxy.net/${url}"
  if curl -fL --connect-timeout 10 --max-time 300 --progress-bar -o "$dest" "$proxy_url" 2>>"$logfile"; then
    return 0
  fi

  return 1
}

# ── 并发下载 ──────────────────────────────
parallel_download() {
  local base_url="$1"
  local tmpdir
  tmpdir=$(mktemp -d)

  local cli_dest="${BIN_DIR}/niuma${EXE_SUFFIX:-}"
  local srv_dest="${BIN_DIR}/niuma-server${EXE_SUFFIX:-}"
  local cli_url="${base_url}/${CLI_BINARY}"
  local srv_url="${base_url}/${SERVER_BINARY}"

  echo ""
  echo -e "${BOLD}下载组件${RESET} ${DIM}(并发下载中...)${RESET}"
  echo "──────────────────────────────────────"

  # 后台启动两个下载任务
  (
    echo -e "  ${CYAN}[1/2]${RESET} niuma CLI"
    if download_with_progress "$cli_url" "$cli_dest" "CLI" "$tmpdir/cli.log"; then
      chmod +x "$cli_dest"
      echo -e "  ${GREEN}[1/2] niuma CLI ✓${RESET}"
    else
      echo -e "  ${RED}[1/2] niuma CLI ✗${RESET}" 
      echo "FAIL" > "$tmpdir/cli.fail"
    fi
  ) &
  local pid_cli=$!

  (
    echo -e "  ${CYAN}[2/2]${RESET} niuma Server"
    if download_with_progress "$srv_url" "$srv_dest" "Server" "$tmpdir/srv.log"; then
      chmod +x "$srv_dest"
      echo -e "  ${GREEN}[2/2] niuma Server ✓${RESET}"
    else
      echo -e "  ${RED}[2/2] niuma Server ✗${RESET}"
      echo "FAIL" > "$tmpdir/srv.fail"
    fi
  ) &
  local pid_srv=$!

  # 等待两个任务完成
  wait $pid_cli $pid_srv 2>/dev/null

  echo ""

  # 检查结果
  if [ -f "$tmpdir/cli.fail" ] || [ -f "$tmpdir/srv.fail" ]; then
    echo -e "${RED}部分下载失败，请检查网络后重试${RESET}"
    [ -f "$tmpdir/cli.fail" ] && echo -e "${RED}  CLI 下载地址:    ${cli_url}${RESET}"
    [ -f "$tmpdir/srv.fail" ] && echo -e "${RED}  Server 下载地址: ${srv_url}${RESET}"
    rm -rf "$tmpdir"
    exit 1
  fi

  rm -rf "$tmpdir"

  # 验证文件大小
  local cli_size srv_size
  cli_size=$(wc -c < "$cli_dest" 2>/dev/null || echo 0)
  srv_size=$(wc -c < "$srv_dest" 2>/dev/null || echo 0)

  if [ "$cli_size" -lt 1000 ] || [ "$srv_size" -lt 1000 ]; then
    echo -e "${RED}下载文件异常（文件过小），可能是网络问题${RESET}"
    exit 1
  fi

  # 显示文件大小
  format_size() {
    local bytes=$1
    if [ "$bytes" -gt 1048576 ]; then
      echo "$(awk "BEGIN{printf \"%.1f\", $bytes/1048576}")MB"
    elif [ "$bytes" -gt 1024 ]; then
      echo "$(awk "BEGIN{printf \"%.0f\", $bytes/1024}")KB"
    else
      echo "${bytes}B"
    fi
  }

  echo -e "  niuma CLI:    $(format_size "$cli_size")"
  echo -e "  niuma Server: $(format_size "$srv_size")"
}

# ── 主流程 ────────────────────────────────
detect_platform
get_latest_version

BASE_URL="https://github.com/${NIUMA_REPO}/releases/download/${LATEST}"

mkdir -p "$BIN_DIR"

# 并发下载两个二进制
parallel_download "$BASE_URL"

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
