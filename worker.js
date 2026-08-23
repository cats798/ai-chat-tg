// Cloudflare Workers + Workers AI 聊天机器人示例
// 部署：wrangler deploy，或在 Cloudflare Dashboard 直接粘贴

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- 聊天 API ----
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const { messages, model } = await request.json();

        if (!messages || !Array.isArray(messages)) {
          return Response.json(
            { error: "messages 数组不能为空" },
            { status: 400, headers: corsHeaders }
          );
        }

        // 调用 Workers AI
        const aiModel = model || "@cf/meta-llama/llama-3.8b";
        const response = await env.AI.run(aiModel, {
          messages,
          stream: true,
        });

        // 返回流式响应
        return new Response(response, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            ...corsHeaders,
          },
        });
      } catch (err) {
        return Response.json(
          { error: err.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // ---- 简单的 HTML 前端（可选） ----
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(CHAT_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};

// 内嵌的前端页面
const CHAT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workers AI Chat</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
         background: #0f0f14; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
  header { padding: 16px 20px; background: #1a1a24; border-bottom: 1px solid #2a2a3a; }
  header h1 { font-size: 18px; font-weight: 600; }
  header .sub { font-size: 12px; color: #888; margin-top: 2px; }
  #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 75%; padding: 10px 14px; border-radius: 14px; line-height: 1.5; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  .msg.user { align-self: flex-end; background: #4a9eff; color: #fff; border-bottom-right-radius: 4px; }
  .msg.assistant { align-self: flex-start; background: #2a2a3a; border-bottom-left-radius: 4px; }
  .msg.typing { opacity: 0.6; font-style: italic; }
  #inputArea { padding: 16px 20px; background: #1a1a24; border-top: 1px solid #2a2a3a; display: flex; gap: 10px; }
  #input { flex: 1; background: #0f0f14; border: 1px solid #2a2a3a; border-radius: 20px; 
           padding: 12px 18px; color: #e0e0e0; font-size: 14px; outline: none; }
  #input:focus { border-color: #4a9eff; }
  #send { background: #4a9eff; border: none; border-radius: 20px; padding: 0 22px; 
          color: #fff; font-size: 14px; cursor: pointer; transition: background 0.2s; }
  #send:hover { background: #3a8eef; }
  #send:disabled { background: #555; cursor: not-allowed; }
  .model-select { font-size: 12px; color: #888; margin-left: auto; }
  select { background: #0f0f14; color: #e0e0e0; border: 1px solid #2a2a3a; 
           border-radius: 8px; padding: 4px 8px; font-size: 12px; }
</style>
</head>
<body>
  <header>
    <h1>🤖 Workers AI Chat</h1>
    <div class="sub">由 Cloudflare Workers AI 驱动 · 全球边缘推理</div>
  </header>
  <div id="messages">
    <div class="msg assistant">你好！我是运行在 Cloudflare Workers 上的 AI 助手。有什么可以帮你的？</div>
  </div>
  <div id="inputArea">
    <select id="modelSelect" class="model-select">
      <option value="@cf/meta-llama/llama-3.8b">Llama 3.8B</option>
      <option value="@cf/qwen/qwen-1.5b">Qwen 1.5B</option>
      <option value="@cf/mistral/mistral-7b-instruct-v0.2">Mistral 7B</option>
    </select>
    <input id="input" type="text" placeholder="输入消息..." autocomplete="off" autofocus>
    <button id="send">发送</button>
  </div>
<script>
  const messages = [];
  const msgEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const modelSelect = document.getElementById('modelSelect');

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    msgEl.appendChild(div);
    msgEl.scrollTop = msgEl.scrollHeight;
    return div;
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    
    inputEl.value = '';
    sendBtn.disabled = true;
    
    addMsg('user', text);
    messages.push({ role: 'user', content: text });
    
    const typingEl = addMsg('assistant', '...');
    
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: modelSelect.value, stream: true })
      });
      
      if (!resp.ok) {
        throw new Error('请求失败: ' + resp.status);
      }
      
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      typingEl.textContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        // Workers AI 流式返回的是 SSE 格式
        const lines = chunk.split('\\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const token = json?.choices?.[0]?.delta?.content;
              if (token) {
                fullText += token;
                typingEl.textContent = fullText;
                msgEl.scrollTop = msgEl.scrollHeight;
              }
            } catch(e) {}
          }
        }
      }
      
      messages.push({ role: 'assistant', content: fullText });
    } catch (err) {
      typingEl.textContent = '❌ ' + err.message;
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
</script>
</body>
</html>`;