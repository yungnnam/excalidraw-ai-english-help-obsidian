// 通用工具：sha1、宽松 JSON 解析、HTTP 错误人话化

const sha1K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];

export function sha1Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const total = (((bytes.length + 8) >> 6) + 1) << 6; // 补 0x80 + 8 字节长度
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = bytes.length * 8;
  dv.setUint32(total - 8, Math.floor(bits / 4294967296));
  dv.setUint32(total - 4, bits >>> 0);

  const H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const W = new Uint32Array(80);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const n = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
      W[i] = (n << 1) | (n >>> 31);
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4];
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = sha1K[0]; }
      else if (i < 40) { f = b ^ c ^ d; k = sha1K[1]; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = sha1K[2]; }
      else { f = b ^ c ^ d; k = sha1K[3]; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + W[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

// 模型偶尔会包 ```json 围栏、加一句“好的”，或尾逗号 —— 都尽量救回来
export function parseJsonLoose(raw) {
  if (raw == null) throw new Error("模型返回空内容");
  let s = String(raw).trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  const attempts = [s, s.replace(/,\s*([}\]])/g, "$1"), s.replace(/,\s*([}\]])/g, "$1").replace(/[\u201c\u201d]/g, '"')];
  let lastErr = null;
  for (const attempt of attempts) {
    try { return JSON.parse(attempt); } catch (e) { lastErr = e; }
  }
  const err = new Error("JSON 解析失败：" + (lastErr && lastErr.message ? lastErr.message : "未知"));
  err.raw = raw;
  throw err;
}

export function humanizeHttp(res) {
  const status = res && res.status;
  const body = String((res && (res.text || "")) || "").slice(0, 300);
  const hint = {
    400: "请求参数不对（多半是模型名或内容格式）",
    401: "API Key 无效，检查设置里的 Key",
    402: "DeepSeek 账户余额不足",
    403: "没有访问权限，检查 Key 的权限",
    404: "接口地址不对，检查 Base URL",
    429: "请求太频繁，等几秒再试",
    500: "DeepSeek 服务端异常，稍后重试",
    503: "DeepSeek 服务繁忙，稍后重试",
  }[status];
  return `DeepSeek ${status || ""}${hint ? "：" + hint : ""}${body ? "\n" + body : ""}`.trim();
}

export function envApiKey() {
  try {
    if (typeof process !== "undefined" && process.env && process.env.DEEPSEEK_API_KEY) {
      return String(process.env.DEEPSEEK_API_KEY);
    }
  } catch (e) { /* 浏览器环境没有 process，忽略 */ }
  return "";
}

export function withTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || "请求超时")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
