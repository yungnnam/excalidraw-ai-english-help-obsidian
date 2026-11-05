// 纯逻辑单测：node dev/test.mjs
import { layoutBlocks, estimateWidth, COLORS } from "../src/layout.js";
import { parseJsonLoose, sha1Hex } from "../src/util.js";
import { MODE_ORDER, getMode } from "../src/registry.js";
import { PROMPT_VERSION } from "../src/promptkit.js";
import { modeLabel, modeShort, translatePair, translateLabel, t } from "../src/i18n.js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const KINDS = new Set(["title", "head", "label", "body", "answer", "error", "orig", "small", "quote", "divider", "gap"]);

const settings = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  defaultMode: "grammar",
  userLevel: "A2",
  nativeLang: "zh",
  learnLang: "en",
  translateDirection: "auto",
  cardWidth: 440,
  cardPosition: "right",
  expandSelection: true,
  showUkPhonetic: false,
  showFamily: true,
  showScore: true,
  confirmBeforeSend: false,
  cacheEnabled: true,
  autoArchive: false,
  archiveFolder: "英语学习/Coach",
  timeoutMs: 45000,
};

let pass = 0;
const fails = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error("返回 false");
    pass++;
  } catch (e) {
    fails.push(name + " → " + ((e && e.message) || e));
  }
}

// ---------- 工具函数 ----------
check("sha1 已知向量", () => {
  const v = sha1Hex("abc");
  if (v !== "a9993e364706816aba3e25717850c26c9cd0d89d") throw new Error("得到 " + v);
});

check("sha1 空串", () => {
  if (sha1Hex("") !== "da39a3ee5e6b4b0d3255bfef95601890afd80709") throw new Error(sha1Hex(""));
});

check("parseJsonLoose 干净 JSON", () => {
  const o = parseJsonLoose('{"mode":"word","a":1}');
  if (o.a !== 1) throw new Error("解析错");
});

check("parseJsonLoose 剥 ```json 围栏", () => {
  const o = parseJsonLoose('```json\n{"mode":"word","words":[]}\n```');
  if (o.mode !== "word") throw new Error("围栏没剥掉");
});

check("parseJsonLoose 前后有废话", () => {
  const o = parseJsonLoose('好的，这是结果：\n{"mode":"grammar","score":90}\n希望有用！');
  if (o.score !== 90) throw new Error("没截取成功");
});

check("parseJsonLoose 去尾逗号", () => {
  const o = parseJsonLoose('{"a":1,"b":[1,2,],}');
  if (o.b.length !== 2) throw new Error("尾逗号没去掉");
});

check("parseJsonLoose 真坏了要报错", () => {
  let threw = false;
  try { parseJsonLoose("完全不是 JSON"); } catch (e) { threw = true; }
  if (!threw) throw new Error("应当抛错");
});

check("parseJsonLoose 带中文引号", () => {
  const o = parseJsonLoose('{“a”: 1}');
  if (o.a !== 1) throw new Error("中文引号没处理");
});

// ---------- 宽度与排版 ----------
check("estimateWidth 基本合理", () => {
  const w = estimateWidth("hello", 15);
  if (!(w > 30 && w < 50)) throw new Error("宽度 " + w);
});

check("estimateWidth 中文按字号算", () => {
  if (estimateWidth("你好", 20) !== 40) throw new Error(String(estimateWidth("你好", 20)));
});

check("layoutBlocks 行 y 单调递增", () => {
  const m = layoutBlocks(
    [
      { kind: "title", text: "🔤 词缀与释义" },
      { kind: "body", text: "adj. 无处不在的" },
      { kind: "divider" },
      { kind: "small", text: "记忆法：ubi + que" },
    ],
    { width: 440 }
  );
  let last = -1;
  for (const r of m.rows) {
    if (r.y < last) throw new Error("y 倒退");
    last = r.y;
  }
  if (!m.rows.some((r) => r.kind === "divider")) throw new Error("没有分隔线");
  if (m.height < 56) throw new Error("高度异常 " + m.height);
});

check("layoutBlocks 长英文折行", () => {
  const m = layoutBlocks(
    [{ kind: "body", text: "Smartphones have become ubiquitous in everyday life for almost everyone on the planet today." }],
    { width: 200 }
  );
  if (m.rows.length < 3) throw new Error("没折行，rows=" + m.rows.length);
});

check("layoutBlocks 中文折行", () => {
  const m = layoutBlocks([{ kind: "body", text: "这是一段用来测试自动换行的比较长的中文说明文字，应该被切成好几行。" }], { width: 200 });
  if (m.rows.length < 2) throw new Error("没折行，rows=" + m.rows.length);
});

check("layoutBlocks 颜色支持别名", () => {
  const m = layoutBlocks([{ kind: "answer", text: "x", color: "answer" }], { width: 300 });
  if (m.rows[0].color !== COLORS.answer) throw new Error(m.rows[0].color);
});

check("layoutBlocks 空 blocks 也给最小高度", () => {
  const m = layoutBlocks([], { width: 300 });
  if (m.height < 56) throw new Error(String(m.height));
});

// ---------- 模式 ----------
check("三个模式都在 registry 里", () => {
  if (MODE_ORDER.length !== 3) throw new Error("模式数 " + MODE_ORDER.length);
  for (const id of ["word", "grammar", "translate"]) {
    if (getMode(id) == null) throw new Error("缺 " + id);
  }
});

check("PROMPT_VERSION 是数字", () => {
  if (typeof PROMPT_VERSION !== "number") throw new Error("类型不对");
});

for (const mode of MODE_ORDER) {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "dev/fixtures", mode.id + ".json"), "utf8"));

  check(mode.id + " · build 产出 system/userText", () => {
    const b = mode.build({ text: null, settings });
    if (!b || !b.system || !b.userText) throw new Error("字段缺失");
    if (!/json/i.test(b.system)) throw new Error("system 里没提 JSON");
    if (!/json/i.test(b.userText)) throw new Error("userText 里没提 JSON");
  });

  check(mode.id + " · build 有文本时走直读", () => {
    const b = mode.build({ text: "I has a apple", settings });
    if (!/I has a apple/.test(b.userText)) throw new Error("文本没带进 prompt");
  });

  check(mode.id + " · render 产出合法 blocks", () => {
    const blocks = mode.render(fixture, settings);
    if (!Array.isArray(blocks) || blocks.length < 3) throw new Error("blocks 太少：" + (blocks && blocks.length));
    for (const b of blocks) {
      if (!KINDS.has(b.kind)) throw new Error("非法 kind: " + b.kind);
      if (b.kind !== "divider" && b.kind !== "gap" && typeof b.text !== "string") {
        throw new Error("缺 text: " + JSON.stringify(b).slice(0, 80));
      }
    }
    if (blocks[0].kind !== "title") throw new Error("第一块不是标题");
  });

  check(mode.id + " · render 能排版成卡片", () => {
    const blocks = mode.render(fixture, settings);
    const m = layoutBlocks(blocks, { width: 440 });
    if (m.height < 80 || m.height > 2400) throw new Error("高度可疑 " + m.height);
  });

  check(mode.id + " · 空结果不崩", () => {
    const blocks = mode.render({ mode: mode.id }, settings);
    if (!Array.isArray(blocks)) throw new Error("没返回数组");
  });
}

// ---------- 语言设置 ----------
check("translatePair 跟着母语/学习语言走", () => {
  const a = translatePair({ nativeLang: "zh", learnLang: "en", translateDirection: "auto" });
  if (a.from !== "zh" || a.to !== "en") throw new Error("auto 方向错：" + JSON.stringify(a));
  const b = translatePair({ nativeLang: "zh", learnLang: "en", translateDirection: "reverse" });
  if (b.from !== "en" || b.to !== "zh") throw new Error("reverse 方向错：" + JSON.stringify(b));
});

check("翻译模式名字随方向变", () => {
  const zh2en = translateLabel({ nativeLang: "zh", learnLang: "en", translateDirection: "auto" });
  if (zh2en !== "中译英") throw new Error(zh2en);
  const en2zh = translateLabel({ nativeLang: "zh", learnLang: "en", translateDirection: "reverse" });
  if (en2zh !== "英译中") throw new Error(en2zh);
  const enUi = translateLabel({ nativeLang: "en", learnLang: "zh" });
  if (enUi !== "English → Chinese") throw new Error(enUi);
});

check("母语英文时卡片标签跟着变", () => {
  const en = { nativeLang: "en", learnLang: "zh" };
  if (t("rewrite", en) !== "Rewrite") throw new Error(t("rewrite", en));
  if (modeLabel(getMode("word"), en) !== "Word Parts") throw new Error(modeLabel(getMode("word"), en));
  if (modeShort(getMode("translate"), en) !== "EN→ZH") throw new Error(modeShort(getMode("translate"), en));
  // 中文界面不变
  if (modeShort(getMode("translate"), settings) !== "中译英") throw new Error(modeShort(getMode("translate"), settings));
});

check("界面语言能单独设，不跟着母语", () => {
  // 母语中文 + 界面英文
  const s = { nativeLang: "zh", learnLang: "en", uiLang: "en" };
  if (t("setUiLang", s) !== "Interface language") throw new Error(t("setUiLang", s));
  if (modeLabel(getMode("grammar"), s) !== "Grammar Check") throw new Error(modeLabel(getMode("grammar"), s));
  if (modeShort(getMode("translate"), s) !== "ZH→EN") throw new Error(modeShort(getMode("translate"), s));
  // 母语英文 + 界面中文
  const r = { nativeLang: "en", learnLang: "zh", uiLang: "zh" };
  if (t("setUiLang", r) !== "界面语言") throw new Error(t("setUiLang", r));
  if (modeShort(getMode("translate"), r) !== "英译中") throw new Error(modeShort(getMode("translate"), r));
  // uiLang 留空 = 跟随母语
  if (t("setUiLang", { nativeLang: "en" }) !== "Interface language") throw new Error("没跟随母语");
  if (t("setUiLang", {}) !== "界面语言") throw new Error("默认不是中文");
  // 内容语言仍按母语（提示词），界面语言不影响它
  const sys = getMode("grammar").build({ text: null, settings: s }).system;
  if (!/中文（Chinese）/.test(sys)) throw new Error("界面语言把内容语言也带跑了");
});

check("提示词里的语言跟着设置变", () => {
  const zhEn = getMode("grammar").build({ text: null, settings }).system;
  if (!/中文（Chinese）/.test(zhEn)) throw new Error("没写母语");
  if (!/English（英语）/.test(zhEn)) throw new Error("没写目标语言");
  const enZh = getMode("grammar").build({ text: null, settings: { nativeLang: "en", learnLang: "zh", userLevel: "A2" } }).system;
  if (!/批改 中文（Chinese）/.test(enZh)) throw new Error("目标语言没换过来");
});

check("翻译模式的提示词带正确方向", () => {
  const auto = getMode("translate").build({ text: null, settings }).userText +
    getMode("translate").build({ text: null, settings }).system;
  if (!/中文（Chinese） → English（英语）/.test(auto)) throw new Error("方向没写对");
  const rev = getMode("translate").build({ text: null, settings: { ...settings, translateDirection: "reverse" } }).system;
  if (!/English（英语） → 中文（Chinese）/.test(rev)) throw new Error("反向没写对");
});

check("旧字段名（why_zh / cn）还能渲染", () => {
  const old = {
    transcript: [{ line: "I has a apple" }],
    rewrite: "I had an apple",
    corrections: [{ original: "I has", corrected: "I had", type: "tense", rule: "一般过去时", why_zh: "过去的动作用过去式" }],
    translation_zh: "我吃了一个苹果",
    praise_zh: "句子完整",
    summary_zh: "主要问题是时态",
    next_step_zh: "复习过去式",
  };
  const blocks = getMode("grammar").render(old, settings);
  const text = blocks.map((b) => b.text || "").join("\n");
  if (!/过去的动作用过去式/.test(text)) throw new Error("why_zh 丢了");
  if (!/我吃了一个苹果/.test(text)) throw new Error("translation_zh 丢了");
});

// ---------- 悬浮窗的「设置」按钮：跳到 Obsidian 插件设置页 ----------
// floatbar/engine/settings 里有 `class X extends PluginSettingTab`，加载时要有桩
globalThis.Plugin = globalThis.Plugin || class {};
globalThis.PluginSettingTab =
  globalThis.PluginSettingTab || class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } };
globalThis.Setting = globalThis.Setting || class {};
globalThis.Modal =
  globalThis.Modal || class { constructor(app) { this.app = app; } open() { if (this.onOpen) this.onOpen(); } close() {} };
globalThis.Notice = globalThis.Notice || class { constructor(msg) { this.message = msg; } };
globalThis.requestUrl = globalThis.requestUrl || (async () => ({ status: 200, json: {} }));
globalThis.normalizePath = globalThis.normalizePath || ((p) => p);

const fb = await import("../src/floatbar.js");

check("设置按钮会打开插件设置页（open + openTabById）", () => {
  const calls = [];
  const app = {
    setting: {
      open() { calls.push("open"); },
      openTabById(id) { calls.push("tab:" + id); },
    },
  };
  const plugin = { app, manifest: { id: "ai-english-help" } };
  const ok = fb.openPluginSettings(plugin);
  if (!ok) throw new Error("没打开成功");
  if (calls.join(",") !== "open,tab:ai-english-help") throw new Error("调用序列：" + calls.join(","));
});

check("没有 setting API 时不崩，退化成提示", () => {
  let msg = "";
  globalThis.Notice = class { constructor(m) { msg = m; } };
  const ok = fb.openPluginSettings({ app: {}, manifest: { id: "x" } });
  if (ok) throw new Error("竟然报成功");
  if (!/第三方插件/.test(msg)) throw new Error("提示不对：" + msg);
});

check("悬浮窗按钮文案与模式一一对应", () => {
  const MODE_ORDER = ["word", "grammar", "zh2en"];
  const SHORT = { word: "词缀", grammar: "批改", zh2en: "中译英" };
  for (const id of MODE_ORDER) if (!SHORT[id]) throw new Error("缺短名：" + id);
});

// ---------- 取词 ----------
const term = await import("../src/term.js");

check("没有候选词时不弹面板（选区为空就是没有）", () => {
  if (term.readEditorSelection({ activeElement: null, querySelector: () => null }) !== null) throw new Error("不该有结果");
});
// ---------- 汇总 ----------
console.log("通过 " + pass + " 项");
if (fails.length) {
  console.log("\n失败 " + fails.length + " 项：");
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("✓ 全部通过");
