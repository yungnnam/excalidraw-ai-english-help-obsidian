// 零依赖构建：src/*.js → main.js（Obsidian 直接加载的单文件）
// 用法： node dev/build.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

// 依赖顺序（被依赖的在前）
const ORDER = [
  "util",
  "i18n",
  "promptkit",
  "modes/translate",
  "modes/word",
  "modes/grammar",
  "registry",
  "layout",
  "settings",
  "ea",
  "deepseek",
  "render",
  "term",
  "engine",
  "floatbar",
  "main",
];

const PREAMBLE = `"use strict";
const obsidian = require("obsidian");
const { Plugin, PluginSettingTab, Setting, Notice, Menu, Modal, requestUrl, normalizePath } = obsidian;
const __m = {};
`;

const EPILOGUE = `
const CoachPlugin = __m["main"].default;
module.exports = CoachPlugin;
module.exports.default = CoachPlugin;
`;

function keyOf(spec) {
  return path.basename(spec).replace(/\.js$/, "");
}

function transform(name, code) {
  const exportsList = [];
  const imports = [];
  const lines = code.split(/\r?\n/);
  const out = [];
  let defaultClass = null;

  for (const line of lines) {
    const imp = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/);
    if (imp) {
      imports.push({ names: imp[1].split(",").map((s) => s.trim()).filter(Boolean), from: keyOf(imp[2]) });
      continue;
    }
    const def = line.match(/^\s*export\s+default\s+class\s+(\w+)/);
    if (def) {
      defaultClass = def[1];
      out.push(line.replace(/export\s+default\s+class/, "class"));
      continue;
    }
    const named = line.match(/^\s*export\s+(?:async\s+)?(function|const|let|var|class)\s+(\w+)/);
    if (named) {
      exportsList.push(named[2]);
      out.push(line.replace(/^\s*export\s+/, ""));
      continue;
    }
    if (/^\s*export\s+/.test(line)) {
      throw new Error(`[build] ${name}: 不支持的 export 写法 → ${line.trim()}`);
    }
    if (/^\s*import\s/.test(line)) {
      throw new Error(`[build] ${name}: 不支持的 import 写法 → ${line.trim()}`);
    }
    out.push(line);
  }

  const bindings = imports
    .map((i) => `const { ${i.names.join(", ")} } = __m["${i.from}"];`)
    .join("\n");

  const normal = exportsList.filter((e) => e !== "default");
  const pieces = [];
  if (defaultClass) pieces.push("default: " + defaultClass);
  pieces.push(...normal);
  const returnObj = "{ " + pieces.join(", ") + " }";

  return (
    `__m["${name}"] = (function () {\n` +
    (bindings ? bindings + "\n" : "") +
    out.join("\n") +
    `\nreturn ${returnObj};\n})();\n`
  );
}

const parts = [PREAMBLE];
for (const rel of ORDER) {
  const file = path.join(SRC, rel + ".js");
  if (!fs.existsSync(file)) throw new Error("[build] 缺文件：" + file);
  const key = path.basename(rel);
  const code = fs.readFileSync(file, "utf8");
  parts.push("// ===== src/" + rel + ".js =====\n" + transform(key, code));
}
parts.push(EPILOGUE);

const outFile = path.join(ROOT, "main.js");
const text = parts.join("\n");
fs.writeFileSync(outFile, text, "utf8");

// 语法体检：不通过就直接报错，避免把坏包丢进 Obsidian
try {
  new Function("require", "module", "exports", text);
} catch (e) {
  throw new Error("[build] 产物语法错误：" + e.message);
}

console.log("✓ main.js  " + (text.length / 1024).toFixed(1) + " KB  (" + ORDER.length + " modules)");

// 顺手打一份可直接拷进 vault 的 dist/
const dist = path.join(ROOT, "dist");
fs.mkdirSync(dist, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  fs.copyFileSync(path.join(ROOT, f), path.join(dist, f));
}
console.log("✓ dist/   已就绪（把 dist 里三个文件拷到 .obsidian/plugins/ai-english-help/）");
