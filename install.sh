#!/usr/bin/env bash
set -e

REPO="parksben/niuma-cli"
BRANCH="main"
INSTALL_DIR="$HOME/.niuma-cli"
ARCHIVE_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}🐂🐴 牛马 CLI 安装脚本${NC}"
echo ""

# 检测 Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ 未检测到 Node.js，请先安装 Node.js 18+${NC}"
  echo "  下载地址：https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 版本过低（当前 v${NODE_VERSION}），需要 Node.js 18+${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Node.js v$(node --version | tr -d v) 检测通过${NC}"

# 判断是全新安装还是更新
if [ -d "$INSTALL_DIR" ]; then
  echo ""
  echo "检测到已安装的版本，正在更新到最新代码..."
  IS_UPDATE=1
else
  echo ""
  echo "正在下载 niuma-cli..."
  IS_UPDATE=0
fi

# 下载到临时目录，成功后再替换，避免下载失败破坏现有安装
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if command -v curl &> /dev/null; then
  curl -fsSL --progress-bar "$ARCHIVE_URL" | tar -xz -C "$TMP_DIR" --strip-components=1
  echo -e "${GREEN}✓ 下载完成${NC}"
elif command -v wget &> /dev/null; then
  wget --progress=bar:force -O- "$ARCHIVE_URL" 2>&1 | tar -xz -C "$TMP_DIR" --strip-components=1
  echo -e "${GREEN}✓ 下载完成${NC}"
else
  echo -e "${RED}✗ 需要 curl 或 wget${NC}"
  exit 1
fi

# 安装依赖（跳过 npm 缓存，确保拉取最新）
echo "安装依赖..."
cd "$TMP_DIR"
npm install --production --prefer-online

# 替换安装目录（保留旧版用户配置文件 niuma.config.json）
if [ "$IS_UPDATE" = "1" ] && [ -f "$INSTALL_DIR/niuma.config.json" ]; then
  cp "$INSTALL_DIR/niuma.config.json" "$TMP_DIR/niuma.config.json"
fi

rm -rf "$INSTALL_DIR"
mv "$TMP_DIR" "$INSTALL_DIR"
trap - EXIT  # 取消 EXIT 清理，目录已移走

# 创建全局命令
NIUMA_BIN="$HOME/.local/bin/niuma"
mkdir -p "$HOME/.local/bin"
cat > "$NIUMA_BIN" << 'EOF'
#!/usr/bin/env bash
node "$HOME/.niuma-cli/src/index.js" "$@"
EOF
chmod +x "$NIUMA_BIN"

# 检查 PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo ""
  echo -e "${CYAN}提示：将以下内容添加到你的 ~/.bashrc 或 ~/.zshrc：${NC}"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo ""
if [ "$IS_UPDATE" = "1" ]; then
  echo -e "${GREEN}${BOLD}✅ niuma-cli 已更新到最新版本！${NC}"
else
  echo -e "${GREEN}${BOLD}✅ niuma-cli 安装完成！${NC}"
fi
echo ""
echo -e "  运行 ${BOLD}niuma install${NC} 开始部署 niuma 服务"
echo ""

# 仅首次安装时询问是否立即运行
if [ "$IS_UPDATE" = "0" ]; then
  read -p "是否立即运行 niuma install？[Y/n] " yn
  yn=${yn:-Y}
  if [[ "$yn" =~ ^[Yy]$ ]]; then
    node "$INSTALL_DIR/src/index.js" install
  fi
fi
