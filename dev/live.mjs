// 真机实测：用真实 API key 跑一次「语法批改」，验证 视觉 + JSON 输出
// DEEPSEEK_API_KEY=sk-xxx node dev/live.mjs [图片路径] [模式 speed|word|zh2en]
import fs from "node:fs";
import path from "node:path";
import { getMode } from "../src/registry.js";
import { PROMPT_VERSION } from "../src/promptkit.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const imgPath = process.argv[2] || path.join(ROOT, "dev", "handwriting.png");
const modeId = process.argv[3] || "speed";
const mode = getMode(modeId === "speed" ? "grammar" : modeId);

const key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  console.error("缺 DEEPSEEK_API_KEY 环境变量");
  process.exit(2);
}

const settings = { userLevel: "A2", model: "deepseek-flash", showUkPhonetic: false, showFamily: true, showScore: true };
const built = mode.build({ text: null, settings });
const b64 = fs.readFileSync(imgPath).toString("base64");

const body = {
  model: "deepseek-flash",
  messages: [
    { role: "system", content: built.system },
    {
      role: "user",
      content: [
        { type: "text", text: built.userText },
        { type: "image_url", image_url: { url: "data:image/png;base64," + b64 } },
      ],
    },
  ],
  response_format: { type: "json_object" },
  temperature: mode.temperature,
  max_tokens: mode.maxTokens,
  stream: false,
};

console.log("→ " + path.basename(imgPath) + "  " + Math.round(b64.length / 1024) + " KB base64  ·  模式 " + mode.id + "  ·  prompt v" + PROMPT_VERSION + (process.env.THINK ? "  ·  think=" + process.env.THINK : ""));

if (process.env.THINK === "off") body.thinking = { type: "disabled" };
if (process.env.THINK === "on") body.thinking = { type: "enabled" };

const t0 = Date.now();
let res, text;
try {
  res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  text = await res.text();
} catch (e) {
  console.error("网络失败:", e.message);
  process.exit(1);
}
const dt = Date.now() - t0;

if (res.status !== 200) {
  console.error("HTTP " + res.status + "  " + dt + "ms\n" + text.slice(0, 600));
  process.exit(1);
}

const json = JSON.parse(text);
const content = json.choices[0].message.content;
console.log("← " + dt + "ms  ·  usage " + JSON.stringify(json.usage));

let parsed;
try {
  parsed = JSON.parse(content);
} catch (e) {
  console.log("\n!! 不是合法 JSON，原样输出：\n" + content.slice(0, 800));
  process.exit(1);
}

console.log("\n=== transcript ===");
for (const t of parsed.transcript || []) {
  console.log("  " + (typeof t === "string" ? t : `${t.line}   (conf ${t.confidence})`));
}
if (parsed.rewrite) console.log("\n=== rewrite ===\n  " + parsed.rewrite);
if (parsed.translation_zh) console.log("\n=== 中文 ===\n  " + parsed.translation_zh);
if ((parsed.corrections || []).length) {
  console.log("\n=== corrections ===");
  for (const c of parsed.corrections) console.log(`  ${c.original} → ${c.corrected}  [${c.type}/${c.level}]  ${c.why_zh}`);
}
if ((parsed.words || []).length) {
  console.log("\n=== words ===");
  for (const w of parsed.words) {
    console.log(`  ${w.headword}  ${w.pos}  ${w.phonetic_us}  ${w.cn}`);
    if (w.affix) console.log(`    ${w.affix.split}   ${(w.affix.prefix || []).map((p) => p.text || p.part).join(" ")} `.replace(/\s+/g, " "));
  }
}
console.log("\n=== 卡片 ===");
const blocks = mode.render(parsed, settings);
console.log("  " + blocks.length + " blocks, kind 分布: " + JSON.stringify(blocks.reduce((a, b) => ((a[b.kind] = (a[b.kind] || 0) + 1), a), {})));
fs.writeFileSync(path.join(ROOT, "dev", "live-" + mode.id + ".json"), JSON.stringify(parsed, null, 2), "utf8");
console.log("  已存 dev/live-" + mode.id + ".json");
