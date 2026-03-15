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
CHUNKS=4

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}🐂🐴 牛马（Niuma）安装向导${RESET}"
echo "──────────────────────────────────────"

# ── 格式化文件大小 ────────────────────────
format_size() {
  local bytes=$1
  if [ "$bytes" -gt 1048576 ] 2>/dev/null; then
    printf "%.1fMB" "$(echo "$bytes / 1048576" | bc -l)"
  elif [ "$bytes" -gt 1024 ] 2>/dev/null; then
    printf "%.0fKB" "$(echo "$bytes / 1024" | bc -l)"
  else
    printf "%dB" "$bytes"
  fi
}

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

# ── 获取文件大小 ──────────────────────────
get_file_size() {
  curl -fsSIL --connect-timeout 10 "$1" 2>/dev/null \
    | grep -i '^content-length:' | tail -1 | tr -d '\r' | awk '{print $2}'
}

# ── 解析重定向获取真实 URL ────────────────
resolve_url() {
  local loc
  loc=$(curl -fsSIL --connect-timeout 10 "$1" 2>/dev/null \
    | grep -i '^location:' | tail -1 | tr -d '\r' | awk '{print $2}')
  if [ -n "$loc" ]; then
    echo "$loc"
  else
    echo "$1"
  fi
}

# ── 下载单个文件（分片并发+进度条） ──────
download_one() {
  local url="$1"
  local dest="$2"
  local label="$3"
  local total="$4"
  local idx="$5"

  local real_url
  real_url=$(resolve_url "$url")

  # 检查是否支持 Range
  local supports_range=false
  if curl -fsSI -r 0-0 "$real_url" 2>/dev/null | grep -qi 'content-range'; then
    supports_range=true
  fi

  local tmpdir
  tmpdir=$(mktemp -d)

  if [ "$supports_range" = true ] && [ "${total:-0}" -gt 0 ] && [ "$CHUNKS" -gt 1 ]; then
    # ── 分片下载 ──
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
    while true; do
      sleep 0.5
      local downloaded=0
      local all_done=true
      for i in $(seq 0 $(( CHUNKS - 1 ))); do
        if [ -f "${tmpdir}/chunk_${i}" ]; then
          local sz
          sz=$(wc -c < "${tmpdir}/chunk_${i}" 2>/dev/null || echo 0)
          # trim whitespace (macOS wc adds spaces)
          sz=$(echo "$sz" | tr -d ' ')
          downloaded=$(( downloaded + sz ))
        fi
        if kill -0 "${pids[$i]}" 2>/dev/null; then
          all_done=false
        fi
      done

      local pct=0
      if [ "$total" -gt 0 ]; then
        pct=$(( downloaded * 100 / total ))
      fi
      [ "$pct" -gt 100 ] && pct=100

      # 绘制进度条
      local bar_w=25
      local filled=$(( pct * bar_w / 100 ))
      local empty=$(( bar_w - filled ))
      local bar=""
      for j in $(seq 1 $filled); do bar="${bar}█"; done
      for j in $(seq 1 $empty); do bar="${bar}░"; done

      printf "\r  ${CYAN}[%s]${RESET} %-13s %s %3d%%  %s / %s" \
        "$idx" "$label" "$bar" "$pct" "$(format_size $downloaded)" "$(format_size $total)"

      if $all_done; then break; fi
    done

    # 等待并检查
    local fail=false
    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || fail=true
    done

    if $fail; then
      printf "\r  ${RED}[%s] %-13s 下载失败${RESET}%50s\n" "$idx" "$label" ""
      rm -rf "$tmpdir"
      return 1
    fi

    # 合并
    cat "${tmpdir}"/chunk_* > "$dest"
  else
    # ── 普通下载 ──
    curl -fsSL --connect-timeout 10 --max-time 300 -o "$dest" "$real_url" &
    local pid=$!
    while kill -0 "$pid" 2>/dev/null; do
      sleep 0.5
      local downloaded=0
      if [ -f "$dest" ]; then
        downloaded=$(wc -c < "$dest" 2>/dev/null || echo 0)
        downloaded=$(echo "$downloaded" | tr -d ' ')
      fi
      local pct=0
      if [ "${total:-0}" -gt 0 ]; then
        pct=$(( downloaded * 100 / total ))
      fi
      [ "$pct" -gt 100 ] && pct=100
      local bar_w=25
      local filled=$(( pct * bar_w / 100 ))
      local empty=$(( bar_w - filled ))
      local bar=""
      for j in $(seq 1 $filled); do bar="${bar}█"; done
      for j in $(seq 1 $empty); do bar="${bar}░"; done
      printf "\r  ${CYAN}[%s]${RESET} %-13s %s %3d%%  %s / %s" \
        "$idx" "$label" "$bar" "$pct" "$(format_size $downloaded)" "$(format_size $total)"
    done
    wait "$pid" 2>/dev/null || {
      printf "\r  ${RED}[%s] %-13s 下载失败${RESET}%50s\n" "$idx" "$label" ""
      rm -rf "$tmpdir"
      return 1
    }
  fi

  chmod +x "$dest"
  printf "\r  ${GREEN}[%s] %-13s █████████████████████████ 100%%  %s ✓${RESET}%20s\n" \
    "$idx" "$label" "$(format_size $total)" ""

  rm -rf "$tmpdir"
  return 0
}

# ── 主下载流程 ────────────────────────────
run_downloads() {
  local base_url="$1"
  local cli_dest="${BIN_DIR}/niuma${EXE_SUFFIX:-}"
  local srv_dest="${BIN_DIR}/niuma-server${EXE_SUFFIX:-}"
  local cli_url="${base_url}/${CLI_BINARY}"
  local srv_url="${base_url}/${SERVER_BINARY}"

  echo ""
  echo -e "${BOLD}下载组件${RESET}"
  echo "──────────────────────────────────────"

  # 获取文件大小
  echo -n "  获取文件信息..."
  local cli_size srv_size
  cli_size=$(get_file_size "$cli_url")
  srv_size=$(get_file_size "$srv_url")
  cli_size=${cli_size:-0}
  srv_size=${srv_size:-0}
  local total_all=$(( cli_size + srv_size ))
  echo -e " 共 ${BOLD}$(format_size $total_all)${RESET} (CLI $(format_size $cli_size) + Server $(format_size $srv_size))"
  echo -e "  ${DIM}${CHUNKS} 分片并发下载${RESET}"
  echo ""

  # 顺序下载两个文件（各自内部分片并发），避免终端输出交错
  if ! download_one "$cli_url" "$cli_dest" "niuma CLI" "$cli_size" "1/2"; then
    echo -e "\n${RED}CLI 下载失败: ${cli_url}${RESET}"
    exit 1
  fi

  if ! download_one "$srv_url" "$srv_dest" "niuma Server" "$srv_size" "2/2"; then
    echo -e "\n${RED}Server 下载失败: ${srv_url}${RESET}"
    exit 1
  fi

  # 校验
  local actual_cli actual_srv
  actual_cli=$(wc -c < "$cli_dest" | tr -d ' ')
  actual_srv=$(wc -c < "$srv_dest" | tr -d ' ')

  if [ "$actual_cli" -lt 1000 ] || [ "$actual_srv" -lt 1000 ]; then
    echo -e "\n${RED}文件异常（过小），可能是网络问题${RESET}"
    exit 1
  fi

  echo ""
}

# ── 交互式配置（兼容 curl | bash） ───────
run_config() {
  echo ""
  echo -e "${BOLD}配置向导${RESET}"
  echo "──────────────────────────────────────"

  # curl | bash 时 stdin 是管道，必须从 /dev/tty 读取用户输入
  if [ ! -t 0 ]; then
    exec < /dev/tty
  fi

  local gw_url gw_token port

  printf "OpenClaw Gateway URL [ws://localhost:18789]: "
  read -r gw_url
  gw_url=${gw_url:-ws://localhost:18789}

  printf "OpenClaw Gateway Token: "
  stty -echo 2>/dev/null || true
  read -r gw_token
  stty echo 2>/dev/null || true
  echo ""

  printf "服务端口 [3000]: "
  read -r port
  port=${port:-3000}

  mkdir -p "$INSTALL_DIR"
  cat > "$CONFIG_FILE" <<CONF
{
  "OPENCLAW_GATEWAY_URL": "${gw_url}",
  "OPENCLAW_GATEWAY_TOKEN": "${gw_token}",
  "PORT": ${port}
}
CONF
}

# ── 配置 PATH ─────────────────────────────
setup_path() {
  local shell_rc=""
  case "${SHELL:-}" in
    */zsh)  shell_rc="$HOME/.zshrc" ;;
    */fish) shell_rc="$HOME/.config/fish/config.fish" ;;
    *)      shell_rc="$HOME/.bashrc" ;;
  esac

  if [ -n "$shell_rc" ] && ! grep -q "$BIN_DIR" "$shell_rc" 2>/dev/null; then
    echo "" >> "$shell_rc"
    echo "# niuma" >> "$shell_rc"
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$shell_rc"
  fi

  export PATH="$BIN_DIR:$PATH"
}

# ── 主流程 ────────────────────────────────
detect_platform
get_latest_version

BASE_URL="https://github.com/${NIUMA_REPO}/releases/download/${LATEST}"
mkdir -p "$BIN_DIR"

run_downloads "$BASE_URL"
run_config
setup_path

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
