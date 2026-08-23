# Telegram AI Bot — Cloudflare Workers 一键部署

> 基于 Cloudflare Workers + Workers AI + Telegram
> 每月 10,000 次免费 AI 推理，零服务器

## 🚀 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button.svg)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_GITHUB/ai-chat-tg)

部署时系统会提示你输入 **Telegram Bot Token**，KV Namespace 和 Webhook 自动配置。

## 🤖 功能

- 💬 多轮对话（自动保存上下文）
- 🧠 `/model` 切换 AI 模型（Llama / Qwen / Mistral / Gemma）
- 🗑️ `/reset` 清除对话历史
- 🌍 全球边缘节点，延迟极低

## 命令

| 命令 | 说明 |
|------|------|
| `/start` | 开始对话 |
| `/model` | 切换模型 |
| `/reset` | 清除历史 |
| `/help` | 帮助 |

## 创建 Telegram Bot

1. 搜索 **@BotFather**
2. 发送 `/newbot`
3. 拿到 Token（格式：`1234567890:ABC...`）

## 本地开发（可选）

```bash
npm install -g wrangler
wrangler login
wrangler dev
```