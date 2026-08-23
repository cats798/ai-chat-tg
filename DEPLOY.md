# Telegram AI Bot 完整部署指南

> 基于 Cloudflare Workers + Workers AI + Telegram
> 全程零服务器，每月 10,000 次免费 AI 推理

---

## ✅ 一键部署（推荐）

```bash
cd cf-ai-chat
bash deploy.sh
```

脚本会自动完成：安装 wrangler → 登录 → 创建 KV → 部署 → 设置 Webhook。全程交互式提示。

---

## 📋 手动部署（8 步）

### 第一步：创建 Telegram Bot

1. 在 Telegram 搜索 **@BotFather**
2. 发送 `/newbot`
3. 按提示输入 Bot 名称（如 `我的AI助手`）
4. 拿到 Token，格式类似：
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
   ⚠️ 妥善保存，不要泄露

### 第二步：创建 KV Namespace（存对话历史）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers → KV**
3. 点击 **创建 Namespace**
4. 名称随意（如 `ai-chat-kv`）
5. 创建后复制 **Namespace ID**（一串 32 位十六进制字符串）

### 第三步：配置

编辑 `wrangler-tg.toml`，把 `REPLACE_WITH_KV_ID` 替换为上一步的 namespace ID。

### 第四步：安装 Wrangler & 登录

```bash
npm install -g wrangler
wrangler login
```

### 第五步：设置 Bot Token

```bash
cd cf-ai-chat
wrangler secret put TELEGRAM_TOKEN
# 粘贴第一步拿到的 Token
```

### 第六步：部署

```bash
wrangler deploy --config wrangler-tg.toml
```

部署成功后会输出一个 URL，类似：
```
https://ai-chat-tg.your-account.workers.dev
```

### 第七步：设置 Webhook

用浏览器打开（替换 `<token>` 和 `<worker-url>`）：

```
https://api.telegram.org/bot<token>/setWebhook?url=<worker-url>/webhook
```

或者直接访问 Worker 的 `/setup` 路径，自动生成完整链接。

### 第八步：测试

在 Telegram 中搜索你的 Bot，发送 `/start`。

---

## 🤖 Bot 命令参考

| 命令 | 说明 |
|------|------|
| `/start` | 开始对话，显示当前模型 |
| `/model` | 列出可用模型 |
| `/model llama` | 切换到 Llama 3.8B |
| `/model qwen` | 切换到 Qwen 1.5B |
| `/model mistral` | 切换到 Mistral 7B |
| `/model gemma` | 切换到 Gemma 2 9B |
| `/reset` | 清除对话历史 |
| `/help` | 帮助 |

直接发消息即可聊天，支持多轮对话上下文。

---

## 📦 可用模型

| 标识 | 模型 | 特点 |
|------|------|------|
| `llama` | Llama 3.8B | 均衡强大，默认 |
| `qwen` | Qwen 1.5B | 快速轻量 |
| `mistral` | Mistral 7B | 代码优秀 |
| `gemma` | Gemma 2 9B | 谷歌开源 |

---

## 📂 文件说明

| 文件 | 用途 |
|------|------|
| `deploy.sh` | 🚀 一键部署脚本 |
| `worker-tg.js` | 核心代码（Telegram 对话 + AI 调用） |
| `wrangler-tg.toml` | Telegram 版配置 |
| `worker.js` | 纯 Web 版 AI 聊天（无需 Telegram） |
| `wrangler.toml` | 纯 Web 版配置 |
| `DEPLOY.md` | 本文件 |

---

## 常见问题

### 消息发出去了但 Bot 没反应？
检查 Webhook 是否正确设置。访问：
```
https://api.telegram.org/bot<token>/getWebhookInfo
```
确认 `url` 字段指向正确的 workers.dev 地址。

### 报错 "AI binding not found"
确认 `wrangler-tg.toml` 中的 KV 配置正确，且在 Cloudflare Dashboard 中 KV namespace 已创建。

### 模型太慢？
切换到更轻量的模型：`/model qwen`

### 部署后报错？
运行 `wrangler logs` 查看详细错误日志。