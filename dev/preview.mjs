// 生成 preview.html：用真实的 layoutBlocks 把三张卡片画出来（无需 Obsidian）
// node dev/preview.mjs  →  用浏览器打开 preview.html
import fs from "node:fs";
import path from "node:path";
import { layoutBlocks } from "../src/layout.js";
import { MODE_ORDER } from "../src/registry.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const WIDTH = 440;

// --live：用 dev/live-<id>.json（真实模型输出）代替 fixtures，检查真实排版
const LIVE = process.argv.includes("--live");
function loadResult(mode) {
  const live = path.join(ROOT, "dev", "live-" + mode.id + ".json");
  const p = LIVE && fs.existsSync(live) ? live : path.join(ROOT, "dev", "fixtures", mode.id + ".json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const settings = {
  userLevel: "A2",
  cardWidth: WIDTH,
  showUkPhonetic: false,
  showFamily: true,
  showScore: true,
};

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function cardHtml(model, title) {
  const rows = model.rows
    .map((r) => {
      if (r.kind === "divider") {
        return `<div style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:1px;background:${r.color}"></div>`;
      }
      return `<div style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w || ""}px;font-size:${r.size}px;line-height:${Math.round(r.size * 1.38)}px;color:${r.color};white-space:pre">${esc(r.text)}</div>`;
    })
    .join("\n");

  return `<div class="card" data-title="${esc(title)}" style="width:${model.width}px;height:${model.height}px">
${rows}
</div>`;
}

const scenes = MODE_ORDER.map((mode) => {
  const fixture = loadResult(mode);
  const blocks = mode.render(fixture, settings);
  const model = layoutBlocks(blocks, { width: WIDTH });

  const src = (fixture.transcript || []).map((t) => (typeof t === "string" ? t : t.line)).join("\n");

  return `<section class="scene">
  <div class="source">
    <div class="hand">${esc(src)}</div>
    <div class="hint">（画布上的手写）</div>
  </div>
  <div class="arrow">→</div>
  ${cardHtml(model, mode.label)}
</section>`;
});

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>Excalidraw AI 英语老师 · 卡片预览</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 40px 48px; background: #ffffff;
    background-image: radial-gradient(#e9ecef 1px, transparent 1px);
    background-size: 20px 20px;
    font-family: -apple-system, "Segoe UI", Arial, "Microsoft YaHei", sans-serif;
    color: #1c1c1c;
  }
  h1 { font-size: 15px; font-weight: 600; color: #868e96; letter-spacing: .04em; margin: 0 0 28px; }
  .scene { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 56px; }
  .source { width: 250px; padding-top: 12px; }
  .hand { font-family: "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive;
          font-size: 24px; line-height: 1.5; color: #495057; white-space: pre-wrap; }
  .hint { margin-top: 6px; font-size: 11px; color: #adb5bd; }
  .arrow { padding-top: 30px; font-size: 20px; color: #ced4da; }
  .card {
    position: relative; box-sizing: border-box;
    background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;
    padding: 0;
  }
</style></head>
<body>
<h1>EXCALIDRAW AI 英语老师 · 卡片预览（440px 宽，与插件渲染一致）</h1>
${scenes.join("\n")}
</body></html>`;

const out = path.join(ROOT, "preview.html");
fs.writeFileSync(out, html, "utf8");

// 同时导出布局模型，给 dev/render_preview.py 画成 PNG（用来肉眼检查排版）
const modelJson = MODE_ORDER.map((mode) => {
  const fixture = loadResult(mode);
  const model = layoutBlocks(mode.render(fixture, settings), { width: WIDTH });
  const src = (fixture.transcript || []).map((t) => (typeof t === "string" ? t : t.line)).join("\n");
  return { id: mode.id, label: mode.label, emoji: mode.emoji, src, width: model.width, height: model.height, rows: model.rows };
});
fs.writeFileSync(path.join(ROOT, "dev", LIVE ? "preview-model-live.json" : "preview-model.json"), JSON.stringify(modelJson, null, 2), "utf8");

console.log("✓ preview.html (" + (LIVE ? "live 真实输出" : "fixtures") + ")  " + (html.length / 1024).toFixed(1) + " KB（用浏览器打开看效果）");
for (const mode of MODE_ORDER) {
  const fixture = loadResult(mode);
  const model = layoutBlocks(mode.render(fixture, settings), { width: WIDTH });
  console.log("  " + mode.label.padEnd(8, "　") + " 高 " + String(model.height).padStart(4) + "px  行 " + model.rows.length);
}
