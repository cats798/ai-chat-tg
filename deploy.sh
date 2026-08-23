#!/usr/bin/env bash
# ============================================================
#  Telegram AI Bot 一键部署脚本
#  用法: bash deploy.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "============================================"
echo "  🤖 Telegram AI Bot 一键部署"
echo "============================================"
echo ""

# ---- 检查 wrangler ----
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}⚠️  未检测到 wrangler，正在安装...${NC}"
  npm install -g wrangler
  echo -e "${GREEN}✅ wrangler 安装完成${NC}"
else
  echo -e "${GREEN}✅ wrangler 已安装${NC}"
fi

# ---- 登录 ----
echo ""
echo -e "${YELLOW}📋 请确保已登录 Cloudflare 账号${NC}"
echo "   如果未登录，wrangler 会自动打开浏览器..."
read -p "   按回车继续..." _

wrangler whoami 2>/dev/null || {
  echo -e "${YELLOW}🔐 正在登录...${NC}"
  wrangler login
}

# ---- 获取 Telegram Token ----
echo ""
echo -e "${YELLOW}🔑 请输入 Telegram Bot Token${NC}"
echo "   (从 @BotFather 获取，格式如: 1234567890:ABC...)"
read -p "   Token: " TG_TOKEN

if [ -z "$TG_TOKEN" ]; then
  echo -e "${RED}❌ Token 不能为空${NC}"
  exit 1
fi

# ---- 创建 KV Namespace ----
echo ""
echo -e "${YELLOW}📦 是否需要创建新的 KV Namespace？(y/n)${NC}"
read -p "   [y/n]: " CREATE_KV

KV_ID=""
if [ "$CREATE_KV" = "y" ] || [ "$CREATE_KV" = "Y" ]; then
  KV_NAME="ai-chat-$(date +%s)"
  echo -e "${YELLOW}   创建 KV: ${KV_NAME} ...${NC}"
  KV_OUTPUT=$(wrangler kv namespace create "$KV_NAME" 2>&1)
  echo "   $KV_OUTPUT"
  KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+' || echo "")
  
  if [ -z "$KV_ID" ]; then
    # 尝试从 JSON 输出中提取
    KV_ID=$(echo "$KV_OUTPUT" | grep -oP '"id":"\K[^"]+' | head -1)
  fi
  
  if [ -z "$KV_ID" ]; then
    echo -e "${RED}❌ 无法获取 KV ID，请手动创建${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ KV Namespace 创建成功: ${KV_ID}${NC}"
else
  read -p "  请输入已有 KV Namespace ID: " KV_ID
  if [ -z "$KV_ID" ]; then
    echo -e "${RED}❌ KV ID 不能为空${NC}"
    exit 1
  fi
fi

# ---- 更新配置文件 ----
echo ""
echo -e "${YELLOW}⚙️  正在写入配置...${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/wrangler-tg.toml"

cat > "$CONFIG_FILE" << EOF
name = "ai-chat-tg"
compatibility_date = "2024-11-15"

[kv]
[[kv]]
binding = "AI_CHAT_KV"
id = "$KV_ID"
EOF

echo -e "${GREEN}✅ 配置文件已更新${NC}"

# ---- 设置 Secret ----
echo ""
echo -e "${YELLOW}🔐 正在设置 Telegram Token...${NC}"
cd "$SCRIPT_DIR"
echo "$TG_TOKEN" | wrangler secret put TELEGRAM_TOKEN
echo -e "${GREEN}✅ Token 已设置${NC}"

# ---- 部署 ----
echo ""
echo -e "${YELLOW}🚀 正在部署到 Cloudflare Workers...${NC}"
DEPLOY_OUTPUT=$(wrangler deploy --config wrangler-tg.toml 2>&1)
echo "$DEPLOY_OUTPUT"

WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[a-zA-Z0-9-]+\.workers\.dev' | head -1)

if [ -z "$WORKER_URL" ]; then
  echo -e "${RED}❌ 部署失败，无法提取 Worker URL${NC}"
  exit 1
fi

echo -e "${GREEN}✅ 部署成功!${NC}"
echo -e "   Worker URL: ${WORKER_URL}"

# ---- 设置 Webhook ----
echo ""
echo -e "${YELLOW}🔗 正在设置 Telegram Webhook...${NC}"
WEBHOOK_URL="${WORKER_URL}/webhook"
SETWEBHOOK_API="https://api.telegram.org/bot${TG_TOKEN}/setWebhook?url=${WEBHOOK_URL}"

SETWEBHOOK_RESULT=$(curl -s "$SETWEBHOOK_API")
echo "   $SETWEBHOOK_RESULT"

if echo "$SETWEBHOOK_RESULT" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Webhook 设置成功!${NC}"
else
  echo -e "${RED}⚠️  Webhook 设置可能失败，请手动设置${NC}"
  echo -e "   打开: ${SETWEBHOOK_API}"
fi

# ---- 完成 ----
echo ""
echo "============================================"
echo -e "${GREEN}  🎉 部署完成!${NC}"
echo "============================================"
echo ""
echo -e "   Worker: ${WORKER_URL}"
echo -e "   Webhook: ${WEBHOOK_URL}"
echo ""
echo -e "   在 Telegram 中搜索你的 Bot，发送 ${YELLOW}/start${NC} 开始使用"
echo ""
echo -e "   可用命令:"
echo -e "     ${YELLOW}/start${NC}  - 开始对话"
echo -e "     ${YELLOW}/model${NC}   - 切换模型"
echo -e "     ${YELLOW}/reset${NC}   - 清除历史"
echo -e "     ${YELLOW}/help${NC}    - 帮助"
echo ""