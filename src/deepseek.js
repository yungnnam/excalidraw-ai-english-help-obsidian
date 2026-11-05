// DeepSeek 调用：重试、超时、错误人话化
import { envApiKey, humanizeHttp, parseJsonLoose, withTimeout } from "./util.js";

export function resolveApiKey(settings) {
  const own = String((settings && settings.apiKey) || "").trim();
  return own || envApiKey();
}

function isRetriable(status) {
  return !status || status === 429 || status >= 500;
}

export async function askDeepSeek({ settings, mode, system, userText, png }) {
  const key = resolveApiKey(settings);
  if (!key) {
    throw new Error("还没填 DeepSeek API Key：设置 → Excalidraw AI 英语老师 → API Key");
  }

  const content = [{ type: "text", text: userText }];
  if (png) content.push({ type: "image_url", image_url: { url: "data:image/png;base64," + png } });

  const payload = {
    model: settings.model || "deepseek-flash",
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
    thinking: settings.deepThink ? { type: "enabled" } : { type: "disabled" },
    temperature: mode.temperature == null ? 0.2 : mode.temperature,
    max_tokens: mode.maxTokens || 2000,
    stream: false,
  };

  const url = String(settings.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "") + "/chat/completions";
  const timeoutMs = settings.timeoutMs || 45000;

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withTimeout(
        requestUrl({
          url,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key,
          },
          body: JSON.stringify(payload),
          throw: false,
        }),
        timeoutMs,
        "请求超时（" + Math.round(timeoutMs / 1000) + " 秒），网络或服务端可能有问题"
      );

      if (res.status !== 200) {
        const err = new Error(humanizeHttp(res));
        err.status = res.status;
        if (!isRetriable(res.status)) throw err;
        lastErr = err;
        continue;
      }

      const choice = res.json && res.json.choices && res.json.choices[0];
      const raw = choice && choice.message && choice.message.content;
      if (!raw) throw new Error("模型返回是空的，重试一次吧");

      const json = parseJsonLoose(raw);
      if (json && !json.mode) json.mode = mode.id; // 宽容：没给 mode 就补上
      if (json && json.mode !== mode.id) {
        const err = new Error("模型答错了模式（期望 " + mode.id + "，返回 " + json.mode + "），再跑一次试试");
        lastErr = err;
        continue;
      }
      return { json, usage: (res.json && res.json.usage) || null, raw };
    } catch (e) {
      lastErr = e;
      if (e && e.status && !isRetriable(e.status)) throw e;
    }
  }
  throw lastErr || new Error("请求失败，原因不明");
}
