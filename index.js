// Cloudflare Workers + Workers AI + Telegram Bot
// 支持：多轮对话、切换模型、清除历史
// 用法见 DEPLOY.md

// 更新后的模型列表 (使用 Cloudflare 目前最稳定的模型)
const MODELS = {
  llama:   { id: "@cf/meta/llama-3.1-8b-instruct",      name: "Llama 3.1 8B",   desc: "均衡强大" },
  qwen:    { id: "@cf/qwen/qwen-1.5b-chat-v0.1",        name: "Qwen 1.5B",    desc: "快速轻量" },
  mistral: { id: "@cf/mistral/mistral-7b-instruct-v0.1", name: "Mistral 7B", desc: "代码优秀" },
  gemma:   { id: "@cf/google/gemma-2-9b-it",           name: "Gemma 2 9B",   desc: "谷歌开源" },
};

const DEFAULT_MODEL = "llama";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- Telegram Webhook ----
    if (url.pathname === "/webhook" && request.method === "POST") {
      const update = await request.json();
      const result = await handleTelegramUpdate(update, env);
      return Response.json({ ok: true, ...result });
    }

    // ---- 健康检查 ----
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "AI Telegram Bot", models: Object.keys(MODELS) });
    }

    // ---- 一键部署辅助 ----
    if (url.pathname === "/setup" && request.method === "GET") {
      const botToken = env.TELEGRAM_TOKEN;
      const workerUrl = `https://${url.host}/webhook`;
      const tgUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(workerUrl)}`;
      return Response.json({
        worker_url: workerUrl,
        telegram_setwebhook_url: tgUrl,
        models: MODELS,
        instructions: "用浏览器打开 telegram_setwebhook_url 即可完成 Webhook 设置",
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ---- 核心逻辑 ----

async function handleTelegramUpdate(update, env) {
  const message = update.message;
  if (!message) return {};

  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const userId = message.from.id;
  const userName = message.from.first_name || "朋友";

  // 获取用户当前模型
  const userKey = `user_${userId}`;
  const modelKey = `model_${userId}`;
  const chatKey = `chat_${userId}`;

  let currentModel = await env.AI_CHAT_KV?.get(modelKey) || DEFAULT_MODEL;
  if (!MODELS[currentModel]) currentModel = DEFAULT_MODEL;

  // ---- 命令处理 ----

  if (text === "/start") {
    await sendTelegram(env, chatId,
      `👋 你好 ${userName}！我是 AI 助手，运行在 Cloudflare Workers 边缘节点上。\n\n` +
      `当前模型：${MODELS[currentModel].name} (${MODELS[currentModel].desc})\n\n` +
      `直接发消息聊天，支持多轮对话。命令：\n` +
      `/model - 切换模型\n` +
      `/reset - 清除对话历史\n` +
      `/help - 帮助`
    );
    return {};
  }

  if (text === "/help") {
    await sendTelegram(env, chatId,
      `🤖 AI Telegram Bot\n\n` +
      `当前模型：${MODELS[currentModel].name} (${MODELS[currentModel].desc})\n\n` +
      `命令：\n` +
      `/start - 开始对话\n` +
      `/model - 切换模型\n` +
      `/reset - 清除对话历史\n` +
      `/help - 帮助\n\n` +
      `直接发消息即可与 AI 对话。`
    );
    return {};
  }

  if (text === "/reset") {
    await env.AI_CHAT_KV?.delete(chatKey);
    await sendTelegram(env, chatId, "🗑️ 对话历史已清除。重新开始吧！");
    return {};
  }

  // ---- 切换模型 ----
  if (text === "/model" || text.startsWith("/model ")) {
    const parts = text.split(" ");
    const arg = parts[1]?.toLowerCase();

    if (!arg) {
      // 列出所有模型
      let msg = "🧠 选择模型：\n\n";
      for (const [key, m] of Object.entries(MODELS)) {
        const marker = key === currentModel ? "✅" : "⬜";
        msg += `${marker} /model ${key} — ${m.name} (${m.desc})\n`;
      }
      msg += "\n用法：/model llama";
      await sendTelegram(env, chatId, msg);
      return {};
    }

    if (MODELS[arg]) {
      currentModel = arg;
      await env.AI_CHAT_KV?.put(modelKey, currentModel);
      await sendTelegram(env, chatId, `✅ 已切换到 ${MODELS[arg].name} (${MODELS[arg].desc})`);
      return {};
    }

    await sendTelegram(env, chatId, `❌ 未知模型 "${arg}"。可用：${Object.keys(MODELS).join(", ")}`);
    return {};
  }

  // ---- 聊天 ----
  let history = [];
  const raw = await env.AI_CHAT_KV?.get(chatKey);
  if (raw) {
    try { history = JSON.parse(raw); } catch(e) {}
  }

  if (history.length > 20) history = history.slice(-20);

  const messages = [
    {
      role: "system",
      content: `你是一个友好、有帮助的 AI 助手，用中文回复。回答简洁明了，不要过于冗长。当前使用 ${MODELS[currentModel].name} 模型。`,
    },
    ...history,
    { role: "user", content: text },
  ];

  const aiResponse = await env.AI.run(MODELS[currentModel].id, {
    messages,
    stream: false,
  });

  const replyText = aiResponse?.response || "抱歉，我无法回答这个问题。";

  history.push({ role: "user", content: text });
  history.push({ role: "assistant", content: replyText });
  await env.AI_CHAT_KV?.put(chatKey, JSON.stringify(history));

  await sendTelegramLong(env, chatId, replyText);
  return {};
}

// ---- Telegram 消息发送 ----

async function sendTelegram(env, chatId, text) {
  // MarkdownV2 转义
  const escaped = text
    .replace(/[_*\[\]()~`>#+\-=!|{}.]/g, "\\$&");

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: escaped,
      parse_mode: "MarkdownV2",
    }),
  });
}

async function sendTelegramLong(env, chatId, text) {
  const MAX_LEN = 4096;
  if (text.length <= MAX_LEN) {
    await sendTelegram(env, chatId, text);
    return;
  }

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", MAX_LEN);
    if (cut < 0) cut = remaining.lastIndexOf(" ", MAX_LEN);
    if (cut < 0) cut = MAX_LEN;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut + 1);
  }

  for (const chunk of chunks) {
    await sendTelegram(env, chatId, chunk);
  }
}
