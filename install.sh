#!/bin/bash
set -e

REPO="parksben/niuma-server"
INSTALL_DIR="$HOME/.niuma"
CONFIG_FILE="$INSTALL_DIR/config.json"

echo "🐂 牛马安装向导"
echo "================================"

# 获取最新 release
LATEST=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
echo "最新版本：$LATEST"

# 下载
mkdir -p "$INSTALL_DIR/server"
DOWNLOAD_URL=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"browser_download_url"' | grep '.tar.gz' | cut -d'"' -f4 | head -1)

echo "下载中..."
curl -L "$DOWNLOAD_URL" -o /tmp/niuma-server.tar.gz
tar -xzf /tmp/niuma-server.tar.gz -C "$INSTALL_DIR/server"
cd "$INSTALL_DIR/server" && npm install --production

# 配置向导
echo ""
echo "配置 OpenClaw Gateway 连接："
read -p "Gateway URL [ws://localhost:18789]: " GATEWAY_URL
GATEWAY_URL=${GATEWAY_URL:-ws://localhost:18789}

read -sp "Gateway Token: " GATEWAY_TOKEN
echo ""

read -p "服务端口 [3000]: " PORT
PORT=${PORT:-3000}

cat > "$CONFIG_FILE" <<EOF
{
  "OPENCLAW_GATEWAY_URL": "$GATEWAY_URL",
  "OPENCLAW_GATEWAY_TOKEN": "$GATEWAY_TOKEN",
  "PORT": $PORT
}
EOF

# 写 .env
cat > "$INSTALL_DIR/server/.env" <<EOF
OPENCLAW_GATEWAY_URL=$GATEWAY_URL
OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN
PORT=$PORT
EOF

echo ""
echo "✅ 安装完成！"
echo "启动命令：niuma start"
echo "访问地址：http://localhost:$PORT"

# 输出服务器连接二维码
echo ""
echo "正在生成连接二维码..."
cd "$INSTALL_DIR/server"
node -e "
const QRCode = require('qrcode-terminal');
const payload = Buffer.from(JSON.stringify({
  v: 1,
  type: 'niuma-connect',
  server: process.env.SERVER_URL || 'http://localhost:' + (process.env.PORT || $PORT),
  name: process.env.SERVER_NAME || '我的牛马服务器',
  ts: Date.now()
})).toString('base64');
QRCode.generate(payload, {small: true});
console.log('');
console.log('用牛马 App 扫描上方二维码完成连接');
console.log('或访问 http://localhost:$PORT/connect 获取二维码');
" 2>/dev/null || echo "访问 http://localhost:${PORT}/connect 获取连接二维码"
