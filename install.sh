#!/bin/bash
set -e

# ─────────────────────────────────────────
#  牛马（Niuma）安装脚本
#  从 github.com/parksben/niuma/releases 下载对应平台二进制
#  支持分片并发下载 + 实时进度条
# ─────────────────────────────────────────

NIUMA_REPO="parksben/niuma"
INSTALL_DIR="$HOME/.niuma"
BIN_DIR="$INSTALL_DIR/bin"
CONFIG_FILE="$INSTALL_DIR/config.json"
CHUNKS=4  # 每个文件分4片并发

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

# ── 格式化文件大小 ────────────────────────
format_size() {
  local bytes=$1
  if [ "$bytes" -gt 1048576 ]; then
    awk "BEGIN{printf \"%.1fMB\", $bytes/1048576}"
  elif [ "$bytes" -gt 1024 ]; then
    awk "BEGIN{printf \"%.0fKB\", $bytes/1024}"
  else
    echo "${bytes}B"
  fi
}

# ── 解析重定向获取真实 URL ────────────────
resolve_url() {
  curl -fsSIL --connect-timeout 10 "$1" 2>/dev/null | grep -i "^location:" | tail -1 | tr -d '\r' | awk '{print $2}'
}

# ── 获取文件大小 ──────────────────────────
get_file_size() {
  local url="$1"
  curl -fsSIL --connect-timeout 10 "$url" 2>/dev/null | grep -i "^content-length:" | tail -1 | tr -d '\r' | awk '{print $2}'
}

# ── 分片并发下载单个文件（带进度） ────────
# 参数: url dest label total_size line_num
chunked_download() {
  local url="$1"
  local dest="$2"
  local label="$3"
  local total="$4"
  local line="$5"
  local tmpdir
  tmpdir=$(mktemp -d)

  # 优先尝试获取直连真实 URL（GitHub releases 会 302 到 CDN）
  local real_url
  real_url=$(resolve_url "$url")
  if [ -z "$real_url" ]; then
    real_url="$url"
  fi

  # 检查是否支持 Range
  local supports_range=false
  if curl -fsSI -r 0-0 "$real_url" 2>/dev/null | grep -qi "content-range"; then
    supports_range=true
  fi

  if [ "$supports_range" = true ] && [ "$total" -gt 0 ] && [ "$CHUNKS" -gt 1 ]; then
    # 分片下载
    local chunk_size=$(( total / CHUNKS ))
    local pids=()

    for i in $(seq 0 $(( CHUNKS - 1 ))); do
      local start=$(( i * chunk_size ))
      local end
      if [ "$i" -eq $(( CHUNKS - 1 )) ]; then
        end=$(( total - 1 ))
      else
        end=$(( start + chunk_size - 1 ))
      fi

      curl -fsSL --connect-timeout 10 --max-time 300 \
        -r "${start}-${end}" \
        -o "${tmpdir}/chunk_${i}" \
        "$real_url" &
      pids+=($!)
    done

    # 监控进度
    local all_done=false
    while ! $all_done; do
      sleep 0.3
      local downloaded=0
      all_done=true
      for i in $(seq 0 $(( CHUNKS - 1 ))); do
        if [ -f "${tmpdir}/chunk_${i}" ]; then
          local sz
          sz=$(wc -c < "${tmpdir}/chunk_${i}" 2>/dev/null || echo 0)
          downloaded=$(( downloaded + sz ))
        fi
        # 检查进程是否还在跑
        if kill -0 "${pids[$i]}" 2>/dev/null; then
          all_done=false
        fi
      done

      local pct=0
      if [ "$total" -gt 0 ]; then
        pct=$(( downloaded * 100 / total ))
      fi
      [ "$pct" -gt 100 ] && pct=100

      # 绘制进度条（覆盖当前行）
      local bar_width=20
      local filled=$(( pct * bar_width / 100 ))
      local empty=$(( bar_width - filled ))
      local bar=""
      for j in $(seq 1 $filled); do bar="${bar}█"; done
      for j in $(seq 1 $empty); do bar="${bar}░"; done

      printf "\r  ${CYAN}[%s]${RESET} %-14s ${bar} %3d%% (%s/%s)" \
        "$line" "$label" "$bar" "$pct" "$(format_size $downloaded)" "$(format_size $total)"
    done

    # 等待所有分片完成
    local fail=false
    for pid in "${pids[@]}"; do
      if ! wait "$pid" 2>/dev/null; then
        fail=true
      fi
    done

    if $fail; then
      printf "\r  ${RED}[%s] %-14s 下载失败${RESET}%40s\n" "$line" "$label" ""
      rm -rf "$tmpdir"
      return 1
    fi

    # 合并分片
    cat "${tmpdir}"/chunk_* > "$dest"
  else
    # 不支持 Range，普通下载
    curl -fL --connect-timeout 10 --max-time 300 -o "$dest" "$real_url" 2>/dev/null &
    local pid=$!
    while kill -0 "$pid" 2>/dev/null; do
      sleep 0.3
      local downloaded=0
      if [ -f "$dest" ]; then
        downloaded=$(wc -c < "$dest" 2>/dev/null || echo 0)
      fi
      local pct=0
      if [ "$total" -gt 0 ]; then
        pct=$(( downloaded * 100 / total ))
      fi
      [ "$pct" -gt 100 ] && pct=100
      local bar_width=20
      local filled=$(( pct * bar_width / 100 ))
      local empty=$(( bar_width - filled ))
      local bar=""
      for j in $(seq 1 $filled); do bar="${bar}█"; done
      for j in $(seq 1 $empty); do bar="${bar}░"; done
      printf "\r  ${CYAN}[%s]${RESET} %-14s ${bar} %3d%% (%s/%s)" \
        "$line" "$label" "$bar" "$pct" "$(format_size $downloaded)" "$(format_size $total)"
    done
    if ! wait "$pid" 2>/dev/null; then
      printf "\r  ${RED}[%s] %-14s 下载失败${RESET}%40s\n" "$line" "$label" ""
      rm -rf "$tmpdir"
      return 1
    fi
  fi

  chmod +x "$dest"
  printf "\r  ${GREEN}[%s] %-14s ████████████████████ 100%% (%s) ✓${RESET}%10s\n" \
    "$line" "$label" "$(format_size $total)" ""

  rm -rf "$tmpdir"
  return 0
}

# ── 并发下载两个文件 ──────────────────────
parallel_download() {
  local base_url="$1"

  local cli_dest="${BIN_DIR}/niuma${EXE_SUFFIX:-}"
  local srv_dest="${BIN_DIR}/niuma-server${EXE_SUFFIX:-}"
  local cli_url="${base_url}/${CLI_BINARY}"
  local srv_url="${base_url}/${SERVER_BINARY}"

  echo ""
  echo -e "${BOLD}下载组件${RESET} ${DIM}(${CHUNKS} 分片并发 × 2 文件)${RESET}"
  echo "──────────────────────────────────────"

  # 先获取文件大小
  echo -n "  获取文件信息..."
  local cli_size srv_size
  cli_size=$(get_file_size "$cli_url")
  srv_size=$(get_file_size "$srv_url")
  cli_size=${cli_size:-0}
  srv_size=${srv_size:-0}
  local total_size=$(( cli_size + srv_size ))
  echo -e " CLI $(format_size "$cli_size") + Server $(format_size "$srv_size") = ${BOLD}$(format_size "$total_size")${RESET}"
  echo ""

  # 预留两行给进度条
  echo ""
  echo ""

  # 两个文件并发，各自分片
  local tmpdir_status
  tmpdir_status=$(mktemp -d)

  (
    if chunked_download "$cli_url" "$cli_dest" "niuma CLI" "$cli_size" "1/2"; then
      touch "$tmpdir_status/cli.ok"
    fi
  ) &
  local pid_cli=$!

  (
    if chunked_download "$srv_url" "$srv_dest" "niuma Server" "$srv_size" "2/2"; then
      touch "$tmpdir_status/srv.ok"
    fi
  ) &
  local pid_srv=$!

  wait $pid_cli $pid_srv 2>/dev/null

  echo ""

  if [ ! -f "$tmpdir_status/cli.ok" ] || [ ! -f "$tmpdir_status/srv.ok" ]; then
    echo -e "${RED}下载失败，请检查网络后重试${RESET}"
    [ ! -f "$tmpdir_status/cli.ok" ] && echo -e "  ${RED}CLI:    ${cli_url}${RESET}"
    [ ! -f "$tmpdir_status/srv.ok" ] && echo -e "  ${RED}Server: ${srv_url}${RESET}"
    rm -rf "$tmpdir_status"
    exit 1
  fi

  rm -rf "$tmpdir_status"
}

# ── 主流程 ────────────────────────────────
detect_platform
get_latest_version

BASE_URL="https://github.com/${NIUMA_REPO}/releases/download/${LATEST}"

mkdir -p "$BIN_DIR"

# 并发分片下载
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
