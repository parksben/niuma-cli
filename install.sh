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
    awk -v b="$bytes" 'BEGIN{printf "%.1fMB", b/1048576}'
  elif [ "$bytes" -gt 1024 ] 2>/dev/null; then
    awk -v b="$bytes" 'BEGIN{printf "%.0fKB", b/1024}'
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

# ── 获取最新版本（同时缓存 release JSON 供后续提取文件大小） ──
get_latest_version() {
  echo -n "获取最新版本..."
  RELEASE_JSON=$(curl -fsSL --connect-timeout 10 "https://api.github.com/repos/${NIUMA_REPO}/releases/latest" </dev/null)
  LATEST=$(echo "$RELEASE_JSON" | grep '"tag_name"' | cut -d'"' -f4)
  if [ -z "$LATEST" ]; then
    echo -e " ${RED}✗${RESET}"
    echo -e "${RED}无法获取最新版本，请检查网络连接${RESET}"
    exit 1
  fi
  echo -e " ${GREEN}${LATEST}${RESET}"
}

# ── 获取文件大小（从缓存的 release JSON 提取，macOS/Linux 通用） ──
get_file_size() {
  local filename="$1"
  local size
  size=$(echo "$RELEASE_JSON" | awk -v name="$filename" '
    /"name"/ { found = index($0, "\"" name "\"") > 0 }
    found && /"size"/ { gsub(/[^0-9]/, ""); print; exit }
  ')
  echo "${size:-0}"
}

# ── GitHub 下载镜像列表（直连失败时自动切换） ──
# 用户可通过 GITHUB_MIRROR 环境变量指定自有镜像，如:
#   GITHUB_MIRROR=https://my-proxy.example.com curl ... | bash
GITHUB_MIRRORS=(
  ""                                          # 直连 (空 = 原始 URL)
  "https://ghfast.top/"                       # ghfast 镜像
  "https://gh-proxy.com/"                     # gh-proxy 镜像
  "https://github.moeyy.xyz/"                 # moeyy 镜像
)

# 如果用户指定了自定义镜像，插入到最前面
if [ -n "${GITHUB_MIRROR:-}" ]; then
  # 确保以 / 结尾
  GITHUB_MIRROR="${GITHUB_MIRROR%/}/"
  GITHUB_MIRRORS=("$GITHUB_MIRROR" "${GITHUB_MIRRORS[@]}")
fi

CHUNKS=16

# ── 检测/安装下载工具 ─────────────────────
DOWNLOADER="curl"
if command -v aria2c &>/dev/null; then
  DOWNLOADER="aria2c"
else
  echo -e "${DIM}  检测到未安装 aria2，尝试自动安装以加速下载...${RESET}"
  case "$(uname -s)" in
    Darwin)
      if command -v brew &>/dev/null; then
        brew install aria2 </dev/null 2>/dev/null && DOWNLOADER="aria2c"
      fi
      ;;
    Linux)
      if command -v apt-get &>/dev/null; then
        sudo apt-get install -y -qq aria2 </dev/null 2>/dev/null && DOWNLOADER="aria2c"
      elif command -v yum &>/dev/null; then
        sudo yum install -y -q aria2 </dev/null 2>/dev/null && DOWNLOADER="aria2c"
      elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm aria2 </dev/null 2>/dev/null && DOWNLOADER="aria2c"
      fi
      ;;
  esac
  if [ "$DOWNLOADER" = "aria2c" ]; then
    echo -e "${GREEN}  ✓ aria2 已安装${RESET}"
  else
    echo -e "${DIM}  未能安装 aria2，使用 curl 下载（可能较慢）${RESET}"
    echo -e "${DIM}  手动安装: brew install aria2 / apt install aria2${RESET}"
  fi
fi

# ── 下载单个文件（多镜像 + aria2c/curl 自动选择） ──
download_one() {
  local url="$1"
  local dest="$2"
  local label="$3"
  local total="$4"
  local idx="$5"

  local tmpdir
  tmpdir=$(mktemp -d)
  local tmpfile="${tmpdir}/download"
  local dest_dir
  dest_dir=$(dirname "$dest")
  local dest_name
  dest_name=$(basename "$dest")

  # 构建所有候选 URL
  local urls=()
  for mirror in "${GITHUB_MIRRORS[@]}"; do
    if [ -z "$mirror" ]; then
      urls+=("$url")
    else
      urls+=("${mirror}${url}")
    fi
  done

  if [ "$DOWNLOADER" = "aria2c" ]; then
    # ── aria2c: 原生多线程+多源+断点续传 ──
    # 写入 URL 列表文件
    local url_file="${tmpdir}/urls.txt"
    for u in "${urls[@]}"; do
      echo "$u" >> "$url_file"
    done

    printf "  ${CYAN}[%s]${RESET} %-13s 下载中 (aria2c ×%d)...\n" "$idx" "$label" "$CHUNKS"

    if aria2c \
      --input-file="$url_file" \
      --dir="$tmpdir" \
      --out="download" \
      --split="$CHUNKS" \
      --max-connection-per-server="$CHUNKS" \
      --min-split-size=1M \
      --max-tries=5 \
      --retry-wait=2 \
      --connect-timeout=10 \
      --timeout=600 \
      --file-allocation=none \
      --console-log-level=warn \
      --summary-interval=3 \
      --download-result=hide \
      </dev/null 2>&1 | while IFS= read -r line; do
        # 提取进度信息
        if echo "$line" | grep -qE '\[.*\]'; then
          printf "\r  ${CYAN}[%s]${RESET} %-13s %s" "$idx" "$label" "$line"
        fi
      done; then
      :
    fi

    # 检查 aria2c 结果
    if [ -f "$tmpfile" ]; then
      local actual
      actual=$(wc -c < "$tmpfile" 2>/dev/null | tr -d ' ')
      if [ "${total:-0}" -eq 0 ] || [ "$actual" -ge $(( total * 99 / 100 )) ]; then
        mv "$tmpfile" "$dest"
        chmod +x "$dest"
        printf "\r  ${GREEN}[%s] %-13s █████████████████████████ 100%%  %s ✓${RESET}%30s\n" \
          "$idx" "$label" "$(format_size ${total:-$actual})" ""
        rm -rf "$tmpdir"
        return 0
      fi
    fi

    printf "\r  ${RED}[%s] %-13s aria2c 下载失败${RESET}%40s\n" "$idx" "$label" ""
    rm -rf "$tmpdir"
    return 1
  fi

  # ── curl 回退: 逐个镜像尝试（单连接） ──
  for try_url in "${urls[@]}"; do
    rm -f "$tmpfile"

    curl -fSL --connect-timeout 10 --max-time 600 \
      --speed-limit 10240 --speed-time 15 \
      -o "$tmpfile" "$try_url" </dev/null 2>/dev/null &
    local pid=$!

    while kill -0 "$pid" 2>/dev/null; do
      sleep 0.5
      local downloaded=0
      if [ -f "$tmpfile" ]; then
        downloaded=$(wc -c < "$tmpfile" 2>/dev/null || echo 0)
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

    if wait "$pid" 2>/dev/null; then
      local actual
      actual=$(wc -c < "$tmpfile" 2>/dev/null | tr -d ' ')
      if [ "${total:-0}" -eq 0 ] || [ "$actual" -ge $(( total * 99 / 100 )) ]; then
        mv "$tmpfile" "$dest"
        chmod +x "$dest"
        printf "\r  ${GREEN}[%s] %-13s █████████████████████████ 100%%  %s ✓${RESET}%20s\n" \
          "$idx" "$label" "$(format_size ${total:-$actual})" ""
        rm -rf "$tmpdir"
        return 0
      fi
      printf "\r  ${YELLOW}[%s] %-13s 文件不完整，切换源...${RESET}%30s\n" "$idx" "$label" ""
    else
      printf "\r  ${YELLOW}[%s] %-13s 失败，切换下一个源...${RESET}%30s\n" "$idx" "$label" ""
    fi
    sleep 1
  done

  printf "\r  ${RED}[%s] %-13s 所有下载源均失败${RESET}%40s\n" "$idx" "$label" ""
  rm -rf "$tmpdir"
  return 1
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
  cli_size=$(get_file_size "$CLI_BINARY")
  srv_size=$(get_file_size "$SERVER_BINARY")
  cli_size=${cli_size:-0}
  srv_size=${srv_size:-0}
  local total_all=$(( cli_size + srv_size ))
  echo -e " 共 ${BOLD}$(format_size $total_all)${RESET} (CLI $(format_size $cli_size) + Server $(format_size $srv_size))"
  echo ""

  # 顺序下载（download_one 内部自动切换镜像）
  local item
  for item in "cli" "srv"; do
    local _url _dest _label _size _idx
    if [ "$item" = "cli" ]; then
      _url="$cli_url"; _dest="$cli_dest"; _label="niuma CLI"; _size="$cli_size"; _idx="1/2"
    else
      _url="$srv_url"; _dest="$srv_dest"; _label="niuma Server"; _size="$srv_size"; _idx="2/2"
    fi
    if ! download_one "$_url" "$_dest" "$_label" "$_size" "$_idx"; then
      echo -e "\n${RED}${_label} 下载失败: ${_url}${RESET}"
      echo -e "${YELLOW}提示: 可设置 GITHUB_MIRROR 环境变量指定镜像，如:${RESET}"
      echo -e "  ${CYAN}GITHUB_MIRROR=https://ghfast.top/ curl -fsSL ... | bash${RESET}"
      exit 1
    fi
  done

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

# ── 生成默认配置 ──────────────────────────
init_config() {
  mkdir -p "$INSTALL_DIR"
  if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" <<CONF
{
  "OPENCLAW_GATEWAY_URL": "ws://localhost:18789",
  "OPENCLAW_GATEWAY_TOKEN": "",
  "PORT": 3000
}
CONF
  fi
}

# ── 下载桌面客户端 ────────────────────────
download_desktop_app() {
  echo ""
  echo -e "${BOLD}下载桌面客户端${RESET}"
  echo "──────────────────────────────────────"

  local app_file=""
  local app_url=""
  local download_dir="$HOME/Downloads"
  mkdir -p "$download_dir"

  case "$PLATFORM" in
    macos-arm64|macos-x64)
      app_file="niuma-desktop_${LATEST#v}_aarch64.dmg"
      [ "$PLATFORM" = "macos-x64" ] && app_file="niuma-desktop_${LATEST#v}_x64.dmg"
      ;;
    linux-x64)
      app_file="niuma-desktop_${LATEST#v}_amd64.AppImage"
      ;;
    linux-arm64)
      app_file="niuma-desktop_${LATEST#v}_aarch64.AppImage"
      ;;
    win-x64)
      app_file="niuma-desktop_${LATEST#v}_x64-setup.exe"
      ;;
  esac

  if [ -z "$app_file" ]; then
    echo -e "  ${DIM}暂无此平台的桌面客户端${RESET}"
    return
  fi

  app_url="https://github.com/${NIUMA_REPO}/releases/download/${LATEST}/${app_file}"
  local dest="${download_dir}/${app_file}"

  echo -e "  正在下载 ${BOLD}${app_file}${RESET} ..."

  # 获取文件大小
  local app_size
  app_size=$(get_file_size "$app_file")
  app_size=${app_size:-0}

  if ! download_one "$app_url" "$dest" "桌面客户端" "$app_size" "⬇"; then
    echo ""
    echo -e "  ${YELLOW}桌面客户端下载失败，手动下载：${RESET}"
    echo -e "  ${CYAN}https://github.com/${NIUMA_REPO}/releases${RESET}"
    return
  fi

  echo ""
  echo -e "  ${GREEN}✓${RESET} 已下载到: ${BOLD}${dest}${RESET}"

  # 打开下载目录
  case "$(uname -s)" in
    Darwin) open "$download_dir" 2>/dev/null ;;
    Linux)  xdg-open "$download_dir" 2>/dev/null ;;
    MINGW*|MSYS*|CYGWIN*) explorer.exe "$download_dir" 2>/dev/null ;;
  esac
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
init_config
setup_path
download_desktop_app

RELEASES_URL="https://github.com/${NIUMA_REPO}/releases/tag/${LATEST}"

echo ""
echo -e "${GREEN}${BOLD}✅ 安装完成！${RESET}"
echo "──────────────────────────────────────"
echo -e "  版本: ${BOLD}${LATEST}${RESET}"
echo -e "  CLI:  ${BIN_DIR}/niuma"
echo -e "  服务: ${BIN_DIR}/niuma-server"
echo ""
echo -e "${BOLD}快速开始${RESET}"
echo "──────────────────────────────────────"
echo ""
echo -e "  ${BOLD}1.${RESET} 启动服务"
echo -e "     ${CYAN}niuma server start${RESET}"
echo ""
echo -e "  ${BOLD}2.${RESET} 安装桌面客户端"
echo -e "     安装包已下载到 ~/Downloads，双击即可安装"
echo ""
echo -e "  ${BOLD}3.${RESET} 打开客户端，在首次配置页面填入 OpenClaw Token"
echo -e "     ${DIM}在 OpenClaw 服务器上运行:${RESET} ${CYAN}openclaw token${RESET}"
echo ""
echo -e "${BOLD}下载更多客户端${RESET}"
echo "──────────────────────────────────────"
echo -e "  📱 Android APK:  ${CYAN}${RELEASES_URL}${RESET}"
echo -e "  🖥  桌面客户端:   ${CYAN}${RELEASES_URL}${RESET}"
echo ""
echo -e "${BOLD}常用命令${RESET}"
echo "──────────────────────────────────────"
echo -e "  ${CYAN}niuma server start${RESET}     启动服务"
echo -e "  ${CYAN}niuma server stop${RESET}      停止服务"
echo -e "  ${CYAN}niuma server status${RESET}    查看状态"
echo -e "  ${CYAN}niuma --help${RESET}           查看帮助"
echo "──────────────────────────────────────"
