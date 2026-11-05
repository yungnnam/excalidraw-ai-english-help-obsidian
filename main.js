"use strict";
const obsidian = require("obsidian");
const { Plugin, PluginSettingTab, Setting, Notice, Menu, Modal, requestUrl, normalizePath } = obsidian;
const __m = {};

// ===== src/util.js =====
__m["util"] = (function () {
// 通用工具：sha1、宽松 JSON 解析、HTTP 错误人话化

const sha1K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];

function sha1Hex(str) {
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
function parseJsonLoose(raw) {
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

function humanizeHttp(res) {
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

function envApiKey() {
  try {
    if (typeof process !== "undefined" && process.env && process.env.DEEPSEEK_API_KEY) {
      return String(process.env.DEEPSEEK_API_KEY);
    }
  } catch (e) { /* 浏览器环境没有 process，忽略 */ }
  return "";
}

function withTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || "请求超时")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

return { sha1Hex, parseJsonLoose, humanizeHttp, envApiKey, withTimeout };
})();

// ===== src/i18n.js =====
__m["i18n"] = (function () {
// 语言包：界面文字跟着「母语」走，学习语言只影响内容语言
//
// 约定：
//   nativeLang —— 母语，讲解、点评、规则说明都用它；插件画出来的卡片标签也用它
//   learnLang  —— 正在学的语言，例句、改写、译文都是它
//   translatePair() —— 翻译模式的方向：母语→学习语言（默认）或反过来

const LANGS = {
  zh: { code: "zh", zh: "中文", en: "Chinese", shortZh: "中", shortEn: "ZH" },
  en: { code: "en", zh: "英文", en: "English", shortZh: "英", shortEn: "EN" },
};

// 界面语言：uiLang 没设就跟着母语走（老用户升级后看不出任何变化）
function resolveUiLang(settings) {
  const s = settings || {};
  if (s.uiLang === 'zh' || s.uiLang === 'en') return s.uiLang;
  return normalizeLang(s.nativeLang);
}

function normalizeLang(code) {
  return code === "en" ? "en" : "zh";
}

function langLabel(code) {
  const l = LANGS[normalizeLang(code)];
  return code === "en" ? "English（英语）" : "中文（Chinese）";
}

function langName(code, native) {
  const l = LANGS[normalizeLang(code)];
  return normalizeLang(native) === "en" ? l.en : l.zh;
}

// 翻译方向：默认母语 → 学习语言；reverse 就是学习语言 → 母语
function translatePair(settings) {
  const s = settings || {};
  const native = normalizeLang(s.nativeLang);
  const learn = normalizeLang(s.learnLang);
  if (s.translateDirection === "reverse") return { from: learn, to: native };
  return { from: native, to: learn };
}

// 翻译模式的名字：「中译英」「英译中」，英文界面则是 Chinese → English
function translateLabel(settings) {
  const { from, to } = translatePair(settings);
  if (resolveUiLang(settings) === "en") {
    return LANGS[from].en + " → " + LANGS[to].en;
  }
  return LANGS[from].shortZh + "译" + LANGS[to].shortZh;
}

const STRINGS = {
  zh: {
    modeWord: "词缀与释义",
    modeGrammar: "语法批改",
    shortWord: "词缀",
    shortGrammar: "批改",
    seen: "我看到的原文",
    original: "原文",
    rewrite: "改写",
    issues: "问题 {n} 处",
    praise: "点评",
    nextStep: "下一步",
    meaning: "意思",
    noErrors: "✅ 没发现明显语法错误",
    wrongLang: "这段看着不是{learn}，建议用「{mode}」",
    affix: "词缀",
    prefix: "前缀",
    root: "词根",
    suffix: "后缀",
    family: "同根",
    example: "例句",
    collocation: "搭配",
    memory: "记忆",
    spelling: "拼写应为 {v}",
    uk: "英",
    wordFooter: "词源拆解由 AI 推测，标了「不确定」的以词典为准",
    nothing: "没认出单词。写大一点，或者一个词一个词地框选再试。",
    unclear: "⚠ 没认出来：{v}",
    natural: "自然版",
    literal: "直译",
    advanced: "进阶",
    version: "译法",
    structures: "句型",
    vocab: "生词",
    pitfall: "避坑",
    eg: "例",
    ph1: "⏳ 正在看你的手写…",
    ph2: "（识别 + 组织答案，通常 3–8 秒）",
    errTitle: "⚠️ 没跑通",
    errHint: "修好后再框选一次，或者换个模式重跑。",
    noSelection: "先框选要处理的内容：在画布空白处拖个框，把手写整个包进去",
    gear: "⚙ 设置",
    flipTitle: "切换翻译方向（中译英 ⇄ 英译中）",
    flipToast: "现在翻：{pair}",
    gearTitle: "设置（跳转到插件设置页）",
    drag: "按住拖动",
    ribbonTip: "打开设置",
    cmdRepeat: "用上次的模式运行",
    cmdSettings: "打开设置",
    cmdToggleBar: "显示 / 隐藏悬浮窗",
    cmdForceBar: "显示悬浮窗（找不到时点这个）",
    // ---- 设置页 ----
    secLanguage: "语言",
    secMode: "模式",
    secCard: "卡片",
    secBehavior: "行为",
    setUiLang: "界面语言",
    descUiLang: "这个设置页、悬浮窗上的按钮、各种提示消息用哪门语言。默认跟着母语走。",
    optFollow: "跟随母语",
    setApiKey: "DeepSeek API Key",
    descApiKey: "粘在这里就行，改完立刻生效；也可以用环境变量 DEEPSEEK_API_KEY（优先于这里）。",
    setBaseUrl: "Base URL",
    descBaseUrl: "换中转服务时改这里",
    setModel: "模型",
    descModel: "手写识图用 deepseek-flash",
    setFloatBar: "画布悬浮窗",
    descFloatBar: "在 Excalidraw 画布上常驻三个按钮，选中手写后点一下就处理，不用再翻菜单",
    btnResetPos: "重置位置",
    noticeResetPos: "悬浮窗已回到右下角",
    setDefaultMode: "默认模式",
    descDefaultMode: "「用上次的模式运行」的初始值",
    setNative: "母语",
    descNative: "讲解、点评、卡片标签用这门语言写",
    setLearn: "要学的语言",
    descLearn: "例句、改写、译文用这门语言写；和母语必须不同",
    setLevel: "我的水平",
    descLevel: "影响讲解深度和打分标准，按要学的那门语言算",
    setDeepThink: "深思模式",
    descDeepThink: "让模型先在内部推理再作答：复杂长句更准，但慢 2–3 倍、也更费 token",
    setCardWidth: "卡片宽度",
    descCardWidth: "太窄长句会折很多行",
    optNarrow: "360（窄）",
    optDefault: "440（默认）",
    optWide: "520（宽）",
    setCardPos: "卡片位置",
    descCardPos: "避开已有元素，放不下的位置会自动换",
    optPosRight: "笔迹右侧",
    optPosBelow: "笔迹下方",
    setUk: "显示英式音标",
    descUk: "关掉只显示美音",
    setFamily: "显示同根词族",
    setScore: "显示分数",
    descScore: "关掉只留批改内容",
    setExpand: "选区外扩",
    descExpand: "把和选区相交的笔迹也带进来，防止漏笔画导致缺字",
    setConfirm: "发送前确认",
    descConfirm: "每次弹窗问一下要不要发送这张手写图",
    setCache: "本地缓存",
    descCache: "同一张图 + 同一模式不重复计费",
    btnClear: "清空",
    noticeCleared: "缓存已清空",
    setArchive: "自动归档",
    descArchive: "每次批改追加一行到 Markdown，方便以后做复习",
    appName: "ai-english-help",
    ribbonTitle: "ai-english-help",
    secApi: "连接",
    secModeOptions: "模式选项",
    setClearCache: "清空缓存",
    noticeUnknownMode: "未知模式：{v}",
    noticeCardFail: "卡片画不出来：{v}",
    noticeSettingsPath: "设置 → 第三方插件 → Excalidraw AI 英语老师",
    noticeBarShown: "悬浮窗已打开",
    noticeBarHidden: "悬浮窗已隐藏",
    noticeBarAttached: "悬浮窗已挂到当前画布",
    noticeBarNoView: "当前没有打开 Excalidraw 画布，切到画布再试",
    noticeDefaultMode: "默认模式：{v}",
    confirmTitle: "把这张图发给 DeepSeek？",
    confirmBody: "将发送 {n} 个元素的截图（只含你框选的部分）。",
    btnSend: "发送",
    btnCancel: "取消",    setArchiveFolder: "归档目录",
  },
  en: {
    modeWord: "Word Parts",
    modeGrammar: "Grammar Check",
    shortWord: "Roots",
    shortGrammar: "Check",
    seen: "What I read",
    original: "Original",
    rewrite: "Rewrite",
    issues: "Issues: {n}",
    praise: "Good",
    nextStep: "Next step",
    meaning: "Meaning",
    noErrors: "✅ No obvious grammar errors",
    wrongLang: "This doesn't look like {learn}. Try 「{mode}」 instead.",
    affix: "Word parts",
    prefix: "Prefix",
    root: "Root",
    suffix: "Suffix",
    family: "Same root",
    example: "Example",
    collocation: "Collocations",
    memory: "Memory hook",
    spelling: "Spelling: {v}",
    uk: "UK",
    wordFooter: "Etymology is inferred by AI — check a dictionary when it says it is unsure.",
    nothing: "No words recognised. Write bigger, or select one word at a time.",
    unclear: "⚠ Not recognised: {v}",
    natural: "Natural",
    literal: "Literal",
    advanced: "Advanced",
    version: "Version",
    structures: "Structures",
    vocab: "Vocabulary",
    pitfall: "Watch out",
    eg: "e.g.",
    ph1: "⏳ Reading your handwriting…",
    ph2: "(recognise + compose, usually 3–8s)",
    errTitle: "⚠️ Failed",
    errHint: "Fix the problem and select again, or try another mode.",
    noSelection: "Select something first: drag a box on the canvas around your handwriting.",
    gear: "⚙ Settings",
    flipTitle: "Switch translation direction",
    flipToast: "Now translating: {pair}",
    gearTitle: "Open the plugin settings",
    drag: "Drag to move",
    ribbonTip: "Open settings",
    cmdRepeat: "Run with last mode",
    cmdSettings: "Open settings",
    cmdToggleBar: "Show / hide the floating bar",
    cmdForceBar: "Show the floating bar (if you can't find it)",
    // ---- settings page ----
    secLanguage: "Language",
    secMode: "Modes",
    secCard: "Card",
    secBehavior: "Behaviour",
    setUiLang: "Interface language",
    descUiLang: "Language of this settings page, the floating-bar buttons and every notice. Defaults to your native language.",
    optFollow: "Same as native",
    setApiKey: "DeepSeek API key",
    descApiKey: "Paste it here and it takes effect immediately. The DEEPSEEK_API_KEY environment variable also works and wins over this field.",
    setBaseUrl: "Base URL",
    descBaseUrl: "Change this when you go through a proxy or relay",
    setModel: "Model",
    descModel: "deepseek-flash is the one that reads images",
    setFloatBar: "Canvas floating bar",
    descFloatBar: "Three buttons pinned on the Excalidraw canvas: select your handwriting, click one, done.",
    btnResetPos: "Reset position",
    noticeResetPos: "Floating bar moved back to the corner",
    setDefaultMode: "Default mode",
    descDefaultMode: "Starting value for “run the last mode again”",
    setNative: "Native language",
    descNative: "Explanations, corrections and card labels are written in this language",
    setLearn: "Language to learn",
    descLearn: "Examples, rewrites and translations are written in this language; it must differ from your native one",
    setLevel: "My level",
    descLevel: "Affects how deep the explanation goes and how strict the scoring is (based on the language you learn)",
    setDeepThink: "Thinking mode",
    descDeepThink: "Let the model reason before answering: better on complicated sentences, but 2–3× slower and uses more tokens",
    setCardWidth: "Card width",
    descCardWidth: "Too narrow and long sentences wrap a lot",
    optNarrow: "360 (narrow)",
    optDefault: "440 (default)",
    optWide: "520 (wide)",
    setCardPos: "Card position",
    descCardPos: "Placed next to your ink; it moves by itself when that spot is taken",
    optPosRight: "Right of the ink",
    optPosBelow: "Below the ink",
    setUk: "Show UK phonetic",
    descUk: "Off: US only",
    setFamily: "Show word family",
    setScore: "Show score",
    descScore: "Off: corrections only",
    setExpand: "Expand selection",
    descExpand: "Also grab strokes that touch your selection, so no character gets clipped",
    setConfirm: "Confirm before sending",
    descConfirm: "Ask before every image upload",
    setCache: "Local cache",
    descCache: "Same image + same mode is not charged twice",
    btnClear: "Clear",
    noticeCleared: "Cache cleared",
    setArchive: "Auto archive",
    descArchive: "Append one line per run to a Markdown file, handy for later review",
    appName: "ai-english-help",
    ribbonTitle: "ai-english-help",
    secApi: "Connection",
    secModeOptions: "Mode options",
    setClearCache: "Clear cache",
    noticeUnknownMode: "Unknown mode: {v}",
    noticeCardFail: "Could not draw the card: {v}",
    noticeSettingsPath: "Settings → Community plugins → Excalidraw AI English Coach",
    noticeBarShown: "Floating bar shown",
    noticeBarHidden: "Floating bar hidden",
    noticeBarAttached: "Floating bar attached to this canvas",
    noticeBarNoView: "No Excalidraw canvas is open — switch to one and try again",
    noticeDefaultMode: "Default mode: {v}",
    confirmTitle: "Send this image to DeepSeek?",
    confirmBody: "Sends a screenshot of {n} element(s) — only what you selected.",
    btnSend: "Send",
    btnCancel: "Cancel",    setArchiveFolder: "Archive folder",
  },
};

function t(key, settings, vars) {
  const pack = STRINGS[resolveUiLang(settings)] || STRINGS.zh;
  let s = pack[key];
  if (s === undefined) s = STRINGS.zh[key];
  if (s === undefined) return key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  }
  return s;
}

// 模式的全名（菜单、命令、卡片标题都用它）
function modeLabel(mode, settings) {
  if (!mode) return "";
  if (mode.id === "translate") return translateLabel(settings);
  if (mode.id === "word") return t("modeWord", settings);
  if (mode.id === "grammar") return t("modeGrammar", settings);
  return mode.label || mode.id;
}

// 悬浮窗上的短名
function modeShort(mode, settings) {
  if (!mode) return "";
  if (mode.id === "translate") {
    const { from, to } = translatePair(settings);
    if (resolveUiLang(settings) === "en") {
      return LANGS[from].shortEn + "→" + LANGS[to].shortEn;
    }
    return LANGS[from].shortZh + "译" + LANGS[to].shortZh;
  }
  if (mode.id === "word") return t("shortWord", settings);
  if (mode.id === "grammar") return t("shortGrammar", settings);
  return modeLabel(mode, settings);
}

// 卡片标题：emoji + 全名（批改带分数）
function cardTitle(mode, settings, score) {
  const name = modeLabel(mode, settings);
  const emoji = mode && mode.emoji ? mode.emoji + " " : "";
  if (mode && mode.id === "grammar" && typeof score === "number" && settings && settings.showScore) {
    return resolveUiLang(settings) === "en"
      ? emoji + name + " · " + score + " pts"
      : emoji + name + " · " + score + "分";
  }
  return emoji + name;
}

// 旧的 JSON 字段名要兼容（缓存里可能还是老结构），取值时两个都认
function pick(obj, keys, fallback) {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}

return { LANGS, resolveUiLang, normalizeLang, langLabel, langName, translatePair, translateLabel, t, modeLabel, modeShort, cardTitle, pick };
})();

// ===== src/promptkit.js =====
__m["promptkit"] = (function () {
const { langLabel } = __m["i18n"];
// 三个模式共用的 system 前缀与水平描述

// 改了提示词结构就 bump，旧缓存自然失效
const PROMPT_VERSION = 2;

const SYSTEM_BASE = `你是一位语言学习教练。学习者的母语（native）是 {native}，正在学的语言（target）是 {target}。他在 Obsidian 的 Excalidraw 画布上手写笔记，你把画布内容变成学习卡片。

硬性规则：
1. 图里可能是手写，也可能是打字的文字。手写可能连笔、歪斜，尽量认；先逐行转录，再做分析。
2. 转录时保留用户原本的拼写和语法错误，不要顺手改掉（否则批改就看不见问题了）。
3. 看不清的内容标低 confidence 或放进 unclear，不要凭空编造。
4. 多行内容按「从上到下、从左到右」排序。
5. 输出会被程序直接画到画布上，所以只输出 JSON：不要 markdown 代码围栏，不要任何解释性文字。
6. 语言分工必须严格遵守：讲解、点评、规则说明、记忆法——一律用母语（{native}）写；被学习语言（{target}）的单词、例句、改写、译文——一律用 {target} 原样写，不要用母语替换或混写。
7. 下面的指令是用中文写的，但那是写给模型的，不影响第 6 条：输出的语言只看 native / target，不看指令本身用什么语言。`;

function levelText(level) {
  const map = {
    A1: "学习者水平：A1（入门）。讲解用最简单的词，句子拆到主谓宾层面。",
    A2: "学习者水平：A2（初级）。讲解直白，避免长术语，多给对照。",
    B1: "学习者水平：B1（中级）。可以讲时态、搭配、句式，适当给地道表达。",
    B2: "学习者水平：B2（中高级）。可以讨论语域、语感差异、native 用法。",
  };
  return map[level] || map.A2;
}

const JSON_TAIL = "\n\n记住：只输出一个 JSON 对象，字段严格按上面的 schema，不要代码围栏、不要解释。";

function systemFor(preamble, settings) {
  const s = settings || {};
  const head = SYSTEM_BASE.split("{native}").join(langLabel(s.nativeLang))
    .split("{target}").join(langLabel(s.learnLang));
  return `${head}\n\n${levelText(s.userLevel)}\n\n${preamble}`;
}

function userTextFor(input) {
  if (input.text) {
    return `下面是用户在画布上打的字（纯文本，不需要识图）：\n\n"""\n${input.text}\n"""\n\n请按你的角色要求处理。${JSON_TAIL}`;
  }
  return `请识别图中的手写内容，并按你的角色要求处理。${JSON_TAIL}`;
}

return { PROMPT_VERSION, levelText, systemFor, userTextFor };
})();

// ===== src/modes/translate.js =====
__m["translate"] = (function () {
const { systemFor, userTextFor } = __m["promptkit"];
const { langLabel, t, pick, cardTitle, translatePair } = __m["i18n"];
// 🌉 翻译：母语 ↔ 学习语言（方向由设置决定，默认母语 → 学习语言）

function preamble(settings) {
  const pair = translatePair(settings);
  const from = langLabel(pair.from);
  const to = langLabel(pair.to);
  const native = langLabel(settings && settings.nativeLang);

  return `你的任务是「${from} → ${to} 翻译」。识别图中的 ${from}，翻译成 ${to}，并给出三个不同层次的版本，让学习者看到从"能看懂"到"很地道"的差距。

输出 JSON，结构如下（字段一个都不能少）：
{
  "mode": "translate",
  "transcript": [{ "line": "逐行转录原文", "confidence": 0.0 }],
  "versions": [
    { "tier": "natural", "text": "最推荐的译法（${to}）", "note": "为什么推荐、语域是什么（用${native}写）" },
    { "tier": "literal", "text": "贴着原文结构翻的版本（${to}）", "note": "哪里不地道（用${native}写）" },
    { "tier": "advanced", "text": "换了句式或用地道表达的版本（${to}）", "note": "用了什么结构、适合什么场合（用${native}写）" }
  ],
  "key_structures": [{ "pattern": "可复用的句型", "function": "它表达什么（用${native}写）", "example": "另一个例子（${to}）" }],
  "vocab": [{ "word": "关键词", "phonetic": "/音标/ 或拼音", "pos": "词性", "meaning": "用${native}写的释义", "hint": "用法提示或反义词（用${native}写）" }],
  "pitfall": "${from} 母语者最容易在这里犯的错，要具体（用${native}写）"
}

翻译纪律：
- 必须给三个版本，tier 固定用 "natural" / "literal" / "advanced" 这三个值，顺序也一样。
- 三个版本必须真的不一样：直译要贴原文语序（哪怕拗口），进阶要换句式（从句、名词化、习语、倒装都行）。
- note 要说清三者的差别，不能三个都写"更地道"。
- key_structures 抓 1~2 个能复用的句型，不要整句照搬。
- pitfall 要具体到词：比如"别说 in the cost，介词用 on / in terms of"。
- 如果框选的内容其实已经是 ${to}，不要硬翻：按 ${to} → ${from} 的反向翻译处理（tier 照旧），pitfall 里说明"这段是 ${to}，想练翻译的话应该写 ${from}"。`;
}

const translateMode = {
  id: "translate",
  label: "翻译",
  icon: "languages",
  emoji: "🌉",
  hotkey: "3",
  temperature: 0.3,
  maxTokens: 2200,

  build({ text, settings }) {
    return {
      system: systemFor(preamble(settings), settings),
      userText: userTextFor({ text }),
    };
  },

  render(result, settings) {
    const blocks = [{ kind: "title", text: cardTitle(translateMode, settings) }];

    const lines = (result.transcript || []).map((it) => it && it.line).filter(Boolean);
    if (lines.length) {
      blocks.push({ kind: "label", text: t("original", settings) });
      for (const line of lines) blocks.push({ kind: "orig", text: line });
    }

    const tiers = { natural: "natural", literal: "literal", advanced: "advanced" };
    const versions = (result.versions || []).filter((v) => v && pick(v, ["text", "en"]));
    versions.forEach((v) => {
      const tier = tiers[v.tier] || tiers[v.label] || "natural";
      const text = pick(v, ["text", "en"]);
      blocks.push({ kind: "label", text: t(tier, settings) });
      blocks.push({ kind: tier === "literal" ? "small" : (tier === "advanced" ? "body" : "answer"), text: text });
      const note = pick(v, ["note", "note_zh"]);
      if (note) blocks.push({ kind: "quote", text: note });
    });

    if ((result.key_structures || []).length) {
      blocks.push({ kind: "divider" });
      blocks.push({ kind: "label", text: t("structures", settings) });
      for (const s of result.key_structures) {
        if (!s) continue;
        const pattern = pick(s, ["pattern", "en"]);
        if (!pattern) continue;
        blocks.push({ kind: "body", text: pattern + (s.function ? "　" + s.function : "") });
        if (s.example) blocks.push({ kind: "small", text: t("eg", settings) + " " + s.example, indent: 14 });
      }
    }

    if ((result.vocab || []).length) {
      blocks.push({ kind: "label", text: t("vocab", settings) });
      for (const v of result.vocab) {
        if (!v || !v.word) continue;
        const meaning = pick(v, ["meaning", "cn"]);
        const head = [v.word, v.pos, v.phonetic].filter(Boolean).join("  ");
        blocks.push({ kind: "small", text: head + (meaning ? "　" + meaning : "") });
        const hint = pick(v, ["hint", "hint_zh"]);
        if (hint) blocks.push({ kind: "quote", text: hint, indent: 14 });
      }
    }

    const pitfall = pick(result, ["pitfall", "pitfall_zh"]);
    if (pitfall) {
      blocks.push({ kind: "divider" });
      blocks.push({ kind: "error", text: t("pitfall", settings) + "　" + pitfall });
    }
    return blocks;
  },
};

return { translateMode };
})();

// ===== src/modes/word.js =====
__m["word"] = (function () {
const { systemFor, userTextFor } = __m["promptkit"];
const { langLabel, t, pick, cardTitle } = __m["i18n"];
// 🔤 词缀与释义

function preamble(settings) {
  const native = langLabel(settings && settings.nativeLang);
  const target = langLabel(settings && settings.learnLang);
  const isZh = (settings && settings.learnLang) === "zh";
  const soundField = isZh
    ? '"phonetic_us": "拼音（带声调，如 wú chù bù zài）", "phonetic_uk": ""'
    : '"phonetic_us": "/美式音标/", "phonetic_uk": "/英式音标/"';
  const affixRule = isZh
    ? `- 中文没有词缀，这一栏改成「构词拆解」：split 里写这个词由哪几个字/语素构成（如「电脑 = 电 + 脑」），prefix / root / suffix 里放对应的字或语素及其含义；实在拆不开就写"不可拆分（基础词）"。
- 量词、固定搭配也放进 collocation，比如「一台电脑」「一部电影」。`
    : `- 必须拆。没有前缀就写 "prefix": []，但 root 和 suffix 要给出；基础词也要说明它是基础词。
- 实在拆不动，split 写 "不可拆分（基础词）"，note 说明它来自哪种语言或就是本土词。
- 绝对不许编造词源。不确定就说"词源不确定"，宁缺毋滥 —— 学习者会记住你编的东西。
- family 只给真实存在的同根词，1~3 个；一个都想不出来就给空数组。`;

  return `你的任务是「单词拆解」。识别图中的 ${target} 单词或短语（可能是手写），为每个词给出读音、词性、${native} 释义、构词拆解、同根词、例句、搭配和记忆法。

输出 JSON，结构如下（字段一个都不能少）：
{
  "mode": "word",
  "transcript": [{ "line": "画布上的原文", "confidence": 0.0 }],
  "words": [{
    "headword": "单词原形（拼错就保留原样）",
    "correct_spelling": "如果原词拼错了，这里给正确拼写；没拼错就给空字符串",
    ${soundField},
    "pos": "词性，如 adj. / n. / v.",
    "meaning": "用${native}写的释义，多个义项用分号隔开",
    "affix": {
      "prefix": [{ "part": "前缀本身", "meaning": "含义（可注明语源）" }],
      "root":   [{ "part": "词根", "meaning": "含义" }],
      "suffix": [{ "part": "后缀", "meaning": "含义与词性" }],
      "split": "ubi(where) + que(every) + -ous(adj.)",
      "note": "一句话说明这个词是怎么拼出这个意思的"
    },
    "family": [{ "word": "同根词", "pos": "词性", "meaning": "释义（${native}）" }],
    "example": { "text": "例句（${target}）", "translation": "${native} 翻译" },
    "collocation": ["常见搭配1", "常见搭配2"],
    "memory": "记忆法，一句话（${native}）"
  }],
  "unclear": ["认不出来的内容，没有就空数组"]
}

关于构词，这几条必须遵守：
${affixRule}
- 一次认出多个词时，words 按画布上从上到下的顺序排列，最多 8 个。
- 短语（如 take off）按短语处理：headword 是整个短语，affix 里说明它由哪几个词构成。`;
}

const wordMode = {
  id: "word",
  label: "词缀与释义",
  icon: "spell-check",
  emoji: "🔤",
  hotkey: "1",
  temperature: 0.3,
  maxTokens: 2200,

  build({ text, settings }) {
    return {
      system: systemFor(preamble(settings), settings),
      userText: userTextFor({ text }),
    };
  },

  render(result, settings) {
    const blocks = [{ kind: "title", text: cardTitle(wordMode, settings) }];
    const words = (result.words || []).filter((w) => w && (w.headword || pick(w, ["meaning", "cn"])));
    if (!words.length) {
      blocks.push({ kind: "error", text: t("nothing", settings) });
      if ((result.transcript || []).length) {
        blocks.push({ kind: "label", text: t("seen", settings) });
        for (const it of result.transcript) blocks.push({ kind: "orig", text: it.line || "" });
      }
      return blocks;
    }

    words.forEach((w, i) => {
      if (i) blocks.push({ kind: "divider" });

      const head = [w.headword, w.pos, w.phonetic_us].filter(Boolean).join("  ");
      blocks.push({ kind: "head", text: head });
      if (w.correct_spelling && w.correct_spelling !== w.headword) {
        blocks.push({ kind: "small", text: t("spelling", settings, { v: w.correct_spelling }) });
      }
      if (settings.showUkPhonetic && w.phonetic_uk) {
        blocks.push({ kind: "small", text: t("uk", settings) + " " + w.phonetic_uk });
      }
      const meaning = pick(w, ["meaning", "cn"]);
      if (meaning) blocks.push({ kind: "answer", text: meaning });

      const a = w.affix || {};
      blocks.push({ kind: "label", text: t("affix", settings) });
      if (a.split) blocks.push({ kind: "body", text: a.split });
      const groups = [["prefix", "prefix"], ["root", "root"], ["suffix", "suffix"]];
      for (const [key, label] of groups) {
        for (const p of a[key] || []) {
          const part = p && (p.part || p.text);
          if (!part) continue;
          const txt = t(label, settings) + " " + part + (p.meaning ? "：" + p.meaning : "");
          blocks.push({ kind: "small", text: txt, indent: 14 });
        }
      }
      const note = pick(a, ["note", "note_zh"]);
      if (note) blocks.push({ kind: "small", text: note, indent: 14 });

      if (settings.showFamily && (w.family || []).length) {
        blocks.push({ kind: "label", text: t("family", settings) });
        for (const f of w.family) {
          if (!f || !f.word) continue;
          const line = [f.word, f.pos, pick(f, ["meaning", "cn"])].filter(Boolean).join("  ");
          blocks.push({ kind: "small", text: line, indent: 14 });
        }
      }
      const ex = w.example || {};
      const exText = pick(ex, ["text", "en"]);
      if (exText) {
        blocks.push({ kind: "label", text: t("example", settings) });
        blocks.push({ kind: "body", text: exText });
        const tr = pick(ex, ["translation", "zh"]);
        if (tr) blocks.push({ kind: "small", text: tr });
      }
      if ((w.collocation || []).length) {
        blocks.push({ kind: "label", text: t("collocation", settings) });
        blocks.push({ kind: "small", text: w.collocation.filter(Boolean).join("　·　") });
      }
      const memory = pick(w, ["memory", "memory_zh"]);
      if (memory) blocks.push({ kind: "quote", text: t("memory", settings) + "　" + memory });
    });

    if ((result.unclear || []).length) {
      blocks.push({ kind: "error", text: t("unclear", settings, { v: result.unclear.filter(Boolean).join("；") }) });
    }
    // 词源这件事模型最容易编，卡片末尾说清楚，别让人背错
    blocks.push({ kind: "small", text: t("wordFooter", settings) });
    return blocks;
  },
};

return { wordMode };
})();

// ===== src/modes/grammar.js =====
__m["grammar"] = (function () {
const { systemFor, userTextFor } = __m["promptkit"];
const { langLabel, langName, t, pick, cardTitle, translateLabel } = __m["i18n"];
// 📝 语法批改

function preamble(settings) {
  const native = langLabel(settings && settings.nativeLang);
  const target = langLabel(settings && settings.learnLang);
  return `你的任务是「批改 ${target}」。识别图中的 ${target} 句子，逐条指出语法、用词、搭配错误，给出改写、${native} 意思和下一步复习建议。

输出 JSON，结构如下（字段一个都不能少）：
{
  "mode": "grammar",
  "transcript": [{ "line": "逐行转录，保留原始错误", "confidence": 0.0, "uncertain": ["认不准的词"] }],
  "detected_language": "en 或 zh",
  "rewrite": "改写后的完整句子（没错就与原句一致）",
  "translation": "改写句的${native}意思",
  "corrections": [{
    "original": "原文片段",
    "corrected": "改成什么",
    "type": "tense | agreement | article | preposition | sentence-structure | word-form | collocation | word-order | spelling | punctuation | chinglish",
    "rule": "规则名，如「一般过去时」「不定冠词 a/an」",
    "why": "为什么错、为什么改成这个（用${native}写）",
    "level": "这个知识点属于 A1 / A2 / B1 / B2"
  }],
  "praise": "先夸一句做对的地方（用${native}写）",
  "score": { "grammar": 0, "vocab": 0, "naturalness": 0 },
  "summary": "一句话总评（用${native}写）",
  "nextStep": "下一步该复习什么（用${native}写）"
}

批改纪律：
- 先转录，再批改。转录必须包含原始错误，不许边转录边纠正。
- why 必须点名规则并解释原因，不能只说"这样更自然"。学习者要的是可复用的规则。
- 一条 correction 只讲一个问题。但同一个词上叠着两三个问题时（比如既时态错又主谓不一致），合并成一条，corrected 直接给最终正确形式，why 里把几个原因一次说清——别把一个错拆成好几条，学习卡片会变啰嗦。
- 没有错误时：corrections 给空数组，rewrite 与原句一致，praise 写一句具体的肯定，score.grammar 给 90 以上。
- score 三个维度 0~100，按用户水平打分（A2 学习者用 A2 的标准，别拿 C1 要求他）。
- 如果发现整段其实是母语（而不是 ${target}），detected_language 照实写，corrections 给空数组，summary 里提示"这段像母语，建议用翻译模式"。`;
}

const grammarMode = {
  id: "grammar",
  label: "语法批改",
  icon: "pencil-line",
  emoji: "📝",
  hotkey: "2",
  temperature: 0.2,
  maxTokens: 2400,

  build({ text, settings }) {
    return {
      system: systemFor(preamble(settings), settings),
      userText: userTextFor({ text }),
    };
  },

  render(result, settings) {
    const score = result.score || {};
    const blocks = [{ kind: "title", text: cardTitle(grammarMode, settings, score.grammar) }];

    const lines = (result.transcript || []).map((it) => it && it.line).filter(Boolean);
    if (lines.length) {
      blocks.push({ kind: "label", text: t("seen", settings) });
      for (const line of lines) blocks.push({ kind: "orig", text: line });
    }

    if (result.rewrite && result.rewrite.trim() && result.rewrite.trim() !== lines.join(" ").trim()) {
      blocks.push({ kind: "label", text: t("rewrite", settings) });
      blocks.push({ kind: "answer", text: result.rewrite });
    }

    const corrections = (result.corrections || []).filter((c) => c && (c.original || c.corrected));
    const learn = (settings && settings.learnLang) || "en";
    if (corrections.length) {
      blocks.push({ kind: "label", text: t("issues", settings, { n: corrections.length }) });
      corrections.forEach((c, i) => {
        const mark = "①②③④⑤⑥⑦⑧⑨⑩"[i] || `${i + 1}.`;
        const pair = c.original && c.corrected ? `${c.original} → ${c.corrected}` : c.corrected || c.original;
        // 改错单独一行（红），规则和等级缩进一行（灰），解释再缩进——红字太长会溢出卡片
        blocks.push({ kind: "error", text: `${mark} ${pair}` });
        const tags = [c.rule, c.level].filter(Boolean).join(" · ");
        if (tags) blocks.push({ kind: "small", text: tags, indent: 16 });
        const why = pick(c, ["why", "why_zh"]);
        if (why) blocks.push({ kind: "small", text: why, indent: 16 });
      });
    } else if (result.detected_language && result.detected_language !== learn) {
      blocks.push({
        kind: "error",
        text: t("wrongLang", settings, {
          learn: langName(learn, settings && settings.nativeLang),
          mode: translateLabel(settings),
        }),
      });
    } else {
      blocks.push({ kind: "answer", text: t("noErrors", settings) });
    }

    const praise = pick(result, ["praise", "praise_zh"]);
    if (praise) blocks.push({ kind: "quote", text: t("praise", settings) + "　" + praise });
    const translation = pick(result, ["translation", "translation_zh"]);
    if (translation) {
      blocks.push({ kind: "label", text: t("meaning", settings) });
      blocks.push({ kind: "body", text: translation });
    }
    const summary = pick(result, ["summary", "summary_zh"]);
    if (summary) blocks.push({ kind: "small", text: summary });
    const nextStep = pick(result, ["nextStep", "next_step_zh"]);
    if (nextStep) {
      blocks.push({ kind: "divider" });
      blocks.push({ kind: "small", text: t("nextStep", settings) + "　" + nextStep });
    }
    return blocks;
  },
};

return { grammarMode };
})();

// ===== src/registry.js =====
__m["registry"] = (function () {
const { wordMode } = __m["word"];
const { grammarMode } = __m["grammar"];
const { translateMode } = __m["translate"];
// 模式注册表：加新模式只要写一个 modes/xxx.js 再挂到这里

const MODE_ORDER = [wordMode, grammarMode, translateMode];

const MODES = {
  word: wordMode,
  grammar: grammarMode,
  translate: translateMode,
};

function getMode(id) {
  return MODES[id] || null;
}

return { MODE_ORDER, MODES, getMode };
})();

// ===== src/layout.js =====
__m["layout"] = (function () {
// 纯函数排版：blocks → 带坐标的行模型（测试里注入假的 measure）

const COLORS = {
  ink: "#1c1c1c",
  dim: "#868e96",
  muted: "#6c757d",
  answer: "#2f9e44",
  error: "#e03131",
  body: "#495057",
  faint: "#adb5bd",
  line: "#dee2e6",
};

const KIND_STYLE = {
  title: { size: 20, color: COLORS.ink, gap: 8, bold: true },
  head: { size: 17, color: COLORS.ink, gap: 5 },
  label: { size: 12, color: COLORS.dim, gap: 2 },
  body: { size: 15, color: COLORS.body, gap: 5 },
  answer: { size: 16, color: COLORS.answer, gap: 5 },
  error: { size: 15, color: COLORS.error, gap: 4 },
  orig: { size: 16, color: COLORS.dim, gap: 4 },
  small: { size: 13, color: COLORS.muted, gap: 2 },
  quote: { size: 13, color: COLORS.dim, gap: 3 },
  divider: { size: 0, color: COLORS.line, gap: 0 },
  gap: { size: 0, color: COLORS.line, gap: 0 },
};

// 估算字符宽度（没有 ea.measureText 时用）
function estCharWidth(ch, size) {
  const code = ch.codePointAt(0);
  if (code >= 0x2e80) return size; // CJK / 全角
  if (ch === " ") return size * 0.28;
  if (ch === "\t") return size * 0.56;
  if (/[A-Z]/.test(ch)) return size * 0.64;
  if (/[a-z]/.test(ch)) return size * 0.52;
  if (/[0-9]/.test(ch)) return size * 0.55;
  if (/[，。！？；：、]/.test(ch)) return size * 1.0;
  return size * 0.36;
}

function estimateWidth(text, size) {
  let w = 0;
  for (const ch of text) w += estCharWidth(ch, size);
  return w;
}

// 中文排版避头尾：行首不能出现收尾标点，行尾不能挂着开引号/开括号
const CLOSERS = "，。、；：！？）】」』”’·…";
const OPENERS = "（【「『“‘";

function layWrap(text, maxW, size, measure) {
  const out = [];
  for (const raw of String(text == null ? "" : text).split("\n")) {
    const line = raw.replace(/\t/g, "  ");
    if (!line) { out.push(""); continue; }

    let lines;
    if (measure(line, size) <= maxW) {
      lines = [line];
    } else {
      lines = [];
      let cur = "";
      for (const ch of line) {
        const cand = cur + ch;
        if (cur && measure(cand, size) > maxW) {
          const sp = cur.lastIndexOf(" ");
          // 英文单词中间断开很难看：能退到最近空格就退（最多退 14 个字符）
          if (sp > 0 && sp >= cur.length - 14 && /[A-Za-z0-9,.;:!?'")\]]/.test(ch)) {
            lines.push(cur.slice(0, sp).trimEnd());
            cur = cur.slice(sp + 1) + ch;
          } else {
            lines.push(cur.trimEnd());
            cur = ch === " " ? "" : ch;
          }
        } else {
          cur = cand;
        }
      }
      if (cur.trim()) lines.push(cur.trimEnd());
    }

    // 把掉到行首的标点拽回上一行（宁可超一两个字符，也别让它孤零零一个「。」）
    for (let i = 1; i < lines.length; i++) {
      while (lines[i] && CLOSERS.includes(lines[i][0])) {
        lines[i - 1] += lines[i][0];
        lines[i] = lines[i].slice(1);
      }
    }
    // 行尾挂着的开括号推到下一行
    for (let i = 0; i < lines.length - 1; i++) {
      const last = lines[i][lines[i].length - 1];
      if (last && OPENERS.includes(last)) {
        lines[i] = lines[i].slice(0, -1);
        lines[i + 1] = last + lines[i + 1];
      }
    }

    for (const l of lines) if (l !== "") out.push(l);
    if (!lines.length) out.push("");
  }
  return out.length ? out : [""];
}

/**
 * @param {Array<{kind:string,text?:string,color?:string,size?:number,indent?:number}>} blocks
 * @param {{width?:number,pad?:number,measure?:(text:string,size:number)=>number}} opts
 * @returns {{width:number,pad:number,height:number,rows:Array}}
 */
function layoutBlocks(blocks, opts) {
  const o = opts || {};
  const width = o.width || 440;
  const pad = o.pad == null ? 16 : o.pad;
  const baseMeasure = o.measure || ((t, s) => estimateWidth(t, s));

  const memo = new Map();
  const measure = (t, s) => {
    const key = s + "\u0000" + t;
    let v = memo.get(key);
    if (v == null) { v = baseMeasure(t, s) || 0; memo.set(key, v); }
    return v;
  };

  const contentW = width - pad * 2;
  const rows = [];
  let y = pad;

  for (const b of blocks || []) {
    if (!b) continue;

    if (b.kind === "divider") {
      rows.push({ kind: "divider", x: pad, y: y + 7, w: contentW, color: COLORS.line });
      y += 22;
      continue;
    }
    if (b.kind === "gap") { y += b.size || 8; continue; }

    const st = KIND_STYLE[b.kind] || KIND_STYLE.body;
    const size = b.size || st.size;
    const color = COLORS[b.color] || b.color || st.color;
    const indent = b.indent || 0;
    const avail = Math.max(60, contentW - indent);
    const lines = layWrap(b.text, avail, size, measure);
    const lh = Math.round(size * 1.38);

    for (const line of lines) {
      rows.push({ kind: "text", text: line, x: pad + indent, y, size, color });
      y += lh;
    }
    y += st.gap;
  }

  return { width, pad, height: Math.max(Math.round(y + pad - 6), 56), rows };
}

return { COLORS, estimateWidth, layoutBlocks };
})();

// ===== src/settings.js =====
__m["settings"] = (function () {
const { modeLabel, normalizeLang, t } = __m["i18n"];
const { MODE_ORDER } = __m["registry"];
// 设置项
//
// 界面文字全部走 i18n.t()：按「界面语言」取词（uiLang 为空就跟着母语），
// 所以母语是中文也能把设置页切成英文，反过来也行。

const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  defaultMode: "grammar",
  userLevel: "A2",
  // 界面语言：空 = 跟随母语；"zh" / "en" = 单独指定
  uiLang: "",
  // 母语 / 学习语言：决定讲解语言、例句语言和翻译方向
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
  deepThink: false,
  autoArchive: false,
  archiveFolder: "英语学习/Coach",
  timeoutMs: 45000,
  showFloatBar: true,
  floatBarPos: null,
};

class CoachSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // 改语言后：整页重画 + 悬浮窗上的按钮也跟着换字
  refresh() {
    this.display();
    if (this.plugin.refreshFloatBar) this.plugin.refreshFloatBar();
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const L = (key, vars) => t(key, s, vars);

    containerEl.empty();
    containerEl.createEl("h2", { text: L("appName") });

    // ---------------- 语言 ----------------
    containerEl.createEl("h3", { text: L("secLanguage") });

    new Setting(containerEl)
      .setName(L("setUiLang"))
      .setDesc(L("descUiLang"))
      .addDropdown((d) => {
        d.addOption("", L("optFollow"));
        d.addOption("zh", "中文");
        d.addOption("en", "English");
        d.setValue(s.uiLang === "zh" || s.uiLang === "en" ? s.uiLang : "").onChange(async (v) => {
          s.uiLang = v === "zh" || v === "en" ? v : "";
          await this.plugin.saveSettings();
          this.refresh();
        });
      });

    new Setting(containerEl)
      .setName(L("setNative"))
      .setDesc(L("descNative"))
      .addDropdown((d) => {
        d.addOption("zh", "中文");
        d.addOption("en", "English");
        d.setValue(normalizeLang(s.nativeLang)).onChange(async (v) => {
          s.nativeLang = normalizeLang(v);
          if (s.learnLang === s.nativeLang) s.learnLang = s.nativeLang === "zh" ? "en" : "zh";
          await this.plugin.saveSettings();
          this.refresh();
        });
      });

    new Setting(containerEl)
      .setName(L("setLearn"))
      .setDesc(L("descLearn"))
      .addDropdown((d) => {
        d.addOption("zh", "中文");
        d.addOption("en", "English");
        d.setValue(normalizeLang(s.learnLang)).onChange(async (v) => {
          s.learnLang = normalizeLang(v);
          if (s.learnLang === s.nativeLang) s.nativeLang = s.learnLang === "zh" ? "en" : "zh";
          await this.plugin.saveSettings();
          this.refresh();
        });
      });


    new Setting(containerEl)
      .setName(L("setLevel"))
      .setDesc(L("descLevel"))
      .addDropdown((d) => {
        for (const lv of ["A1", "A2", "B1", "B2"]) d.addOption(lv, lv);
        d.setValue(s.userLevel).onChange(async (v) => {
          s.userLevel = v;
          await this.plugin.saveSettings();
        });
      });

    // ---------------- 连接 ----------------
    containerEl.createEl("h3", { text: L("secApi") });

    new Setting(containerEl)
      .setName(L("setApiKey"))
      .setDesc(L("descApiKey"))
      .addText((el) =>
        el.setPlaceholder("sk-...").setValue(s.apiKey).onChange(async (v) => {
          s.apiKey = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setBaseUrl"))
      .setDesc(L("descBaseUrl"))
      .addText((el) =>
        el.setPlaceholder("https://api.deepseek.com").setValue(s.baseUrl).onChange(async (v) => {
          s.baseUrl = v.trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.baseUrl;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setModel"))
      .setDesc(L("descModel"))
      .addText((el) =>
        el.setValue(s.model).onChange(async (v) => {
          s.model = v.trim() || DEFAULT_SETTINGS.model;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setDeepThink"))
      .setDesc(L("descDeepThink"))
      .addToggle((el) =>
        el.setValue(!!s.deepThink).onChange(async (v) => {
          s.deepThink = v;
          await this.plugin.saveSettings();
        })
      );

    // ---------------- 模式 ----------------
    containerEl.createEl("h3", { text: L("secMode") });

    new Setting(containerEl)
      .setName(L("setDefaultMode"))
      .setDesc(L("descDefaultMode"))
      .addDropdown((d) => {
        for (const m of MODE_ORDER) d.addOption(m.id, m.emoji + " " + modeLabel(m, s));
        d.setValue(s.defaultMode).onChange(async (v) => {
          s.defaultMode = v;
          await this.plugin.saveSettings();
        });
      });

    // ---------------- 卡片 ----------------
    containerEl.createEl("h3", { text: L("secCard") });

    new Setting(containerEl)
      .setName(L("setCardWidth"))
      .setDesc(L("descCardWidth"))
      .addDropdown((d) => {
        d.addOption("360", L("optNarrow"));
        d.addOption("440", L("optDefault"));
        d.addOption("520", L("optWide"));
        d.setValue(String(s.cardWidth)).onChange(async (v) => {
          s.cardWidth = Number(v) || 440;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(L("setCardPos"))
      .setDesc(L("descCardPos"))
      .addDropdown((d) => {
        d.addOption("right", L("optPosRight"));
        d.addOption("below", L("optPosBelow"));
        d.setValue(s.cardPosition).onChange(async (v) => {
          s.cardPosition = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(L("setFloatBar"))
      .setDesc(L("descFloatBar"))
      .addToggle((el) =>
        el.setValue(s.showFloatBar !== false).onChange(async (v) => {
          s.showFloatBar = v;
          await this.plugin.saveSettings();
          if (this.plugin.syncFloatBar) this.plugin.syncFloatBar();
        })
      )
      .addButton((b) =>
        b.setButtonText(L("btnResetPos")).onClick(async () => {
          if (this.plugin.floatBar) this.plugin.floatBar.resetPosition();
          else {
            s.floatBarPos = null;
            await this.plugin.saveSettings();
          }
          new Notice(L("noticeResetPos"));
        })
      );

    // ---------------- 模式选项 ----------------
    containerEl.createEl("h3", { text: L("secModeOptions") });

    new Setting(containerEl)
      .setName("🔤 " + L("setUk"))
      .setDesc(L("descUk"))
      .addToggle((el) =>
        el.setValue(!!s.showUkPhonetic).onChange(async (v) => {
          s.showUkPhonetic = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("🔤 " + L("setFamily"))
      .addToggle((el) =>
        el.setValue(s.showFamily !== false).onChange(async (v) => {
          s.showFamily = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("📝 " + L("setScore"))
      .setDesc(L("descScore"))
      .addToggle((el) =>
        el.setValue(s.showScore !== false).onChange(async (v) => {
          s.showScore = v;
          await this.plugin.saveSettings();
        })
      );

    // ---------------- 行为 ----------------
    containerEl.createEl("h3", { text: L("secBehavior") });

    new Setting(containerEl)
      .setName(L("setExpand"))
      .setDesc(L("descExpand"))
      .addToggle((el) =>
        el.setValue(s.expandSelection !== false).onChange(async (v) => {
          s.expandSelection = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setConfirm"))
      .setDesc(L("descConfirm"))
      .addToggle((el) =>
        el.setValue(!!s.confirmBeforeSend).onChange(async (v) => {
          s.confirmBeforeSend = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setCache"))
      .setDesc(L("descCache"))
      .addToggle((el) =>
        el.setValue(s.cacheEnabled !== false).onChange(async (v) => {
          s.cacheEnabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setArchive"))
      .setDesc(L("descArchive"))
      .addToggle((el) =>
        el.setValue(!!s.autoArchive).onChange(async (v) => {
          s.autoArchive = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setArchiveFolder"))
      .addText((el) =>
        el.setValue(s.archiveFolder).onChange(async (v) => {
          s.archiveFolder = v.trim() || DEFAULT_SETTINGS.archiveFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setClearCache"))
      .addButton((b) =>
        b.setButtonText(L("btnClear")).onClick(async () => {
          this.plugin.data.cache = {};
          await this.plugin.saveSettingsData();
          new Notice(L("noticeCleared"));
        })
      );
  }
}

return { DEFAULT_SETTINGS, CoachSettingTab };
})();

// ===== src/ea.js =====
__m["ea"] = (function () {
// 与 Excalidraw 插件的交互：取 EA、选区外扩、导出 PNG
function getEA() {
  const w = typeof window !== "undefined" ? window : globalThis;
  const ea = w.ExcalidrawAutomate;
  if (!ea) throw new Error("没检测到 Excalidraw 插件，请先启用 Excalidraw 并打开一个画布");
  ea.reset();
  const view = ea.setView("active");
  if (!view) throw new Error("当前没有激活的 Excalidraw 画布，先点开一个画布再试");
  return ea;
}

// 选区外扩：把和选区矩形相交的笔迹并进来，避免漏笔画
function expandSelection(ea, sel, enabled) {
  if (!enabled || !sel.length) return sel;
  let bb;
  try { bb = ea.getBoundingBox(sel); } catch (e) { return sel; }
  if (!bb || !isFinite(bb.topX)) return sel;

  const pad = 12;
  const ids = new Set(sel.map((el) => el.id));
  const all = ea.getViewElements() || [];
  const extra = all.filter((el) => {
    if (!el || el.isDeleted || ids.has(el.id)) return false;
    if (el.type !== "freedraw" && el.type !== "text" && el.type !== "arrow" && el.type !== "line") return false;
    let b;
    try { b = ea.getBoundingBox([el]); } catch (e) { return false; }
    if (!b) return false;
    return (
      b.topX < bb.topX + bb.width + pad &&
      b.topX + b.width > bb.topX - pad &&
      b.topY < bb.topY + bb.height + pad &&
      b.topY + b.height > bb.topY - pad
    );
  });
  return extra.length ? sel.concat(extra) : sel;
}

async function blobToBase64(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function exportSelectionBlob(ea, sel) {
  const bb = ea.getBoundingBox(sel);
  const area = {
    x: bb.topX - 8,
    y: bb.topY - 8,
    width: bb.width + 16,
    height: bb.height + 16,
  };

  // createViewPNG 的 options 字段在不同版本里不太一样，逐级降级尝试
  const attempts = [
    { elementsOverride: sel, exportArea: area, scale: 2, withBackground: true },
    { elementsOverride: sel, exportArea: area, scale: 2 },
    { elementsOverride: sel, exportArea: area },
  ];
  let lastErr = null;
  if (typeof ea.createViewPNG === "function") {
    for (const opt of attempts) {
      try {
        const blob = await ea.createViewPNG(opt);
        if (blob) return { blob, bbox: bb };
      } catch (e) { lastErr = e; }
    }
  }

  // 老版本兜底：copy 到工作台再用 createPNG
  try {
    if (typeof ea.copyViewElementsToEAforEditing === "function") {
      ea.copyViewElementsToEAforEditing(sel, true);
    }
    if (typeof ea.createPNG === "function") {
      const settings = typeof ea.getExportSettings === "function"
        ? ea.getExportSettings(true, false)
        : undefined;
      const blob = await ea.createPNG(null, 2, settings);
      if (blob) return { blob, bbox: bb };
    }
  } catch (e) { lastErr = e; }

  throw new Error(
    "导出选区图片失败：" + (lastErr && lastErr.message ? lastErr.message : "未知原因") +
    "（可能 Excalidraw 插件版本太旧，建议更新）"
  );
}

/**
 * 选区 → { text | png, bbox }
 * 全是打字文本时走快路径：不发图、不计费、零识别误差
 */
async function selectionToInput(ea, sel) {
  if (!sel.length) throw new Error("先框选要处理的内容");
  const bb = ea.getBoundingBox(sel);

  if (sel.every((el) => el.type === "text")) {
    const text = sel.map((el) => el.text || "").filter(Boolean).join("\n").trim();
    if (text) return { text, png: null, bbox: bb };
  }
  const { blob, bbox } = await exportSelectionBlob(ea, sel);
  return { text: null, png: await blobToBase64(blob), bbox: bbox || bb };
}

return { getEA, expandSelection, selectionToInput };
})();

// ===== src/deepseek.js =====
__m["deepseek"] = (function () {
const { envApiKey, humanizeHttp, parseJsonLoose, withTimeout } = __m["util"];
// DeepSeek 调用：重试、超时、错误人话化

function resolveApiKey(settings) {
  const own = String((settings && settings.apiKey) || "").trim();
  return own || envApiKey();
}

function isRetriable(status) {
  return !status || status === 429 || status >= 500;
}

async function askDeepSeek({ settings, mode, system, userText, png }) {
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

return { resolveApiKey, askDeepSeek };
})();

// ===== src/render.js =====
__m["render"] = (function () {
const { layoutBlocks } = __m["layout"];
// 把 blocks 画成 Excalidraw 卡片（底板 + 文字 + 分隔线 + 分组 + customData）

const CARD_GAP = 64;

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 选一个不压住已有元素的位置 */
function pickCardPosition(ea, bb, w, h, pref) {
  let boxes = [];
  try {
    boxes = (ea.getViewElements() || [])
      .filter((el) => el && !el.isDeleted)
      .map((el) => ({ x: el.x, y: el.y, w: el.width || 0, h: el.height || 0 }));
  } catch (e) { boxes = []; }

  const right = { x: bb.topX + bb.width + CARD_GAP, y: bb.topY, w, h };
  const below = { x: bb.topX, y: bb.topY + bb.height + CARD_GAP, w, h };
  const left = { x: bb.topX - CARD_GAP - w, y: bb.topY, w, h };
  const order = pref === "below" ? [below, right, left] : [right, below, left];

  for (const cand of order) {
    if (!boxes.some((b) => overlaps(cand, b))) return { x: Math.round(cand.x), y: Math.round(cand.y) };
  }
  return { x: Math.round(right.x), y: Math.round(right.y + h + 24) };
}

/** 找出由这些源元素生成的卡片（同模式），用于「再点一次 = 更新」 */
function findCardsForSource(ea, srcIds, modeId) {
  const set = new Set(srcIds);
  let els = [];
  try { els = ea.getViewElements() || []; } catch (e) { return []; }
  return els
    .filter((el) => {
      const c = el && el.customData && el.customData.coach;
      if (!c || el.isDeleted || !Array.isArray(c.src)) return false;
      const hit = c.src.some((id) => set.has(id));
      return hit && (!modeId || c.mode === modeId);
    })
    .map((el) => el.id);
}

function markDeletedByIds(ea, ids) {
  if (!ids || !ids.length) return;
  let els = [];
  try { els = (ea.getViewElements() || []).filter((el) => el && !el.isDeleted && ids.indexOf(el.id) >= 0); } catch (e) { return; }
  if (!els.length) return;
  try { ea.copyViewElementsToEAforEditing(els, true); } catch (e) { /* 老版本可能没有这个方法 */ }
  for (const el of els) {
    const target = ea.getElement(el.id);
    if (target) target.isDeleted = true;
  }
}

function setCoachData(ea, ids, meta) {
  for (const id of ids) {
    if (typeof ea.addAppendUpdateCustomData === "function") {
      try { ea.addAppendUpdateCustomData(id, { coach: meta }); continue; } catch (e) { /* 落到下面 */ }
    }
    const el = ea.getElement(id);
    if (el) el.customData = Object.assign({}, el.customData || {}, { coach: meta });
  }
}

const BG = "#f8f9fa";
const STROKE = "#dee2e6";

/**
 * @param {object} ea ExcalidrawAutomate
 * @param {{topX:number,topY:number,width:number,height:number}} bb 源内容边界
 * @param {Array} blocks 卡片内容
 * @param {object} settings 插件设置
 * @param {object} meta 写进 customData.coach
 * @param {string[]} deleteIds 要顺手删掉的旧元素（旧卡片 / 占位卡）
 * @param {boolean} save 是否落盘
 */
async function renderCard(ea, bb, blocks, settings, meta, deleteIds, save) {
  const width = settings.cardWidth || 440;
  const measure = (t, size) => {
    ea.style.fontSize = size;
    try { return ea.measureText(t).width; } catch (e) { return t.length * size * 0.55; }
  };
  const model = layoutBlocks(blocks, { width, measure });
  const pos = pickCardPosition(ea, bb, model.width, model.height, settings.cardPosition);

  ea.clear();
  markDeletedByIds(ea, deleteIds);

  ea.style.roughness = 0;
  ea.style.strokeWidth = 1;
  ea.style.fillStyle = "solid";
  ea.style.backgroundColor = BG;
  ea.style.strokeColor = STROKE;
  ea.style.opacity = 100;
  if (typeof ea.setFontFamily === "function") ea.setFontFamily(2);
  else ea.style.fontFamily = 2;

  const ids = [];
  const boxId = ea.addRect(pos.x, pos.y, model.width, model.height);
  ids.push(boxId);

  for (const row of model.rows) {
    if (row.kind === "divider") {
      const lineId = ea.addLine([[pos.x + row.x, pos.y + row.y], [pos.x + row.x + row.w, pos.y + row.y]]);
      const lineEl = ea.getElement(lineId);
      if (lineEl) {
        lineEl.strokeColor = row.color || STROKE;
        lineEl.strokeWidth = 1;
      }
      ids.push(lineId);
      continue;
    }
    ea.style.fontSize = row.size;
    const textId = ea.addText(pos.x + row.x, pos.y + row.y, row.text);
    const el = ea.getElement(textId);
    if (el) el.strokeColor = row.color;
    ids.push(textId);
  }

  try { ea.addToGroup(ids); } catch (e) { /* 分组失败不影响使用 */ }
  setCoachData(ea, ids, meta);

  await ea.addElementsToView(false, !!save, true);
  return ids;
}

return { pickCardPosition, findCardsForSource, renderCard };
})();

// ===== src/term.js =====
__m["term"] = (function () {
// 文本框里的「当前输入」：正在编辑文字时，你选中的那段字就是这次要处理的内容
//
// 为什么需要它：Excalidraw 编辑文字时，元素不在「选中」列表里，框选不到；
// 但编辑器是一个覆盖在画布上的 textarea，可以直接读它的 value 和选区。

function isEditor(el) {
  return !!(
    el &&
    el.tagName === "TEXTAREA" &&
    (el.classList.contains("excalidraw-wysiwyg") || (el.closest && el.closest(".excalidraw")))
  );
}

function editorTextarea(doc) {
  const d = doc || (typeof document === "undefined" ? null : document);
  if (!d) return null;
  if (isEditor(d.activeElement)) return d.activeElement;
  const found = d.querySelector ? d.querySelector("textarea.excalidraw-wysiwyg") : null;
  return isEditor(found) ? found : null;
}

// 编辑器里选中的那段文字；没选中就退化成「光标所在行」
function readEditorSelection(doc) {
  const ta = editorTextarea(doc);
  if (!ta) return null;

  const value = ta.value || "";
  const start = typeof ta.selectionStart === "number" ? ta.selectionStart : 0;
  const end = typeof ta.selectionEnd === "number" ? ta.selectionEnd : 0;

  if (end > start) {
    const picked = value.slice(start, end).trim();
    if (picked) return { text: picked, whole: false };
  }
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd < 0) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd).trim();
  return line ? { text: line, whole: true } : null;
}

return { editorTextarea, readEditorSelection };
})();

// ===== src/engine.js =====
__m["engine"] = (function () {
const { expandSelection, getEA, selectionToInput } = __m["ea"];
const { askDeepSeek } = __m["deepseek"];
const { findCardsForSource, renderCard } = __m["render"];
const { getMode } = __m["registry"];
const { PROMPT_VERSION } = __m["promptkit"];
const { cardTitle, modeLabel, t } = __m["i18n"];
const { sha1Hex } = __m["util"];
const { readEditorSelection } = __m["term"];
// 一次「框选 → 批改」的完整编排

function cacheHash(mode, settings, input) {
  const base = [
    mode.id,
    "pv" + PROMPT_VERSION,
    settings.model,
    settings.userLevel,
    (settings.nativeLang || "zh") + ">" + (settings.learnLang || "en") + ":" + (settings.translateDirection || "auto"),
    input.text || "",
    input.png ? sha1Hex(input.png) : "",
  ].join("|");
  return sha1Hex(base);
}

function confirmSend(app, count, settings) {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.setText(t("confirmTitle", settings));
    const p = document.createElement("p");
    p.setText(t("confirmBody", settings, { n: count }));
    modal.contentEl.appendChild(p);
    const bar = document.createElement("div");
    bar.style.display = "flex";
    bar.style.gap = "8px";
    bar.style.justifyContent = "flex-end";
    const ok = document.createElement("button");
    ok.setText(t("btnSend", settings));
    ok.addClass("mod-cta");
    ok.onclick = () => { modal.close(); resolve(true); };
    const no = document.createElement("button");
    no.setText(t("btnCancel", settings));
    no.onclick = () => { modal.close(); resolve(false); };
    bar.appendChild(no);
    bar.appendChild(ok);
    modal.contentEl.appendChild(bar);
    modal.onClose = () => resolve(false);
    modal.open();
  });
}

function transcriptOf(result) {
  const t = result && result.transcript;
  if (!t) return "";
  if (Array.isArray(t)) return t.map((x) => (typeof x === "string" ? x : (x && x.line) || "")).filter(Boolean).join(" / ");
  if (typeof t === "string") return t;
  return "";
}

async function archive(plugin, mode, result, input) {
  const folder = String(plugin.settings.archiveFolder || "英语学习/Coach").replace(/^\/+|\/+$/g, "");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const day = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  const path = normalizePath(folder + "/" + day + ".md");
  const adapter = plugin.app.vault.adapter;
  const dir = normalizePath(folder);
  if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
  const head = "# " + day + "\n\n";
  const existing = (await adapter.exists(path)) ? await adapter.read(path) : head;
  const seen = transcriptOf(result) || (input.text || "").slice(0, 80);
  const line = "- " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + " **" + modeLabel(mode, plugin.settings) + "** · " + seen.replace(/\n/g, " ");
  await adapter.write(path, existing + line + "\n");
}

// 没有选区时，卡片就落在视口中央
function viewportBox(ea) {
  try {
    const api = ea.getExcalidrawAPI && ea.getExcalidrawAPI();
    const st = api && api.getAppState && api.getAppState();
    if (!st) return null;
    const zoom = (st.zoom && st.zoom.value) || 1;
    const x = (-(st.scrollX || 0) + (st.width || 0) / 2) / zoom;
    const y = (-(st.scrollY || 0) + (st.height || 0) / 2) / zoom;
    return { topX: x, topY: y, width: 1, height: 1 };
  } catch (e) {
    return null;
  }
}

// 正在编辑的那个文本框（编辑时它不在「选中」列表里，得从 appState 拿）
function editingElement(ea) {
  try {
    const api = ea.getExcalidrawAPI && ea.getExcalidrawAPI();
    const st = api && api.getAppState && api.getAppState();
    return (st && st.editingElement) || null;
  } catch (e) {
    return null;
  }
}

function boxOf(el) {
  return { topX: el.x || 0, topY: el.y || 0, width: el.width || 120, height: el.height || 40 };
}

/**
 * 拿到 input 之后的一切：占位卡 → 调模型/查缓存 → 画正式卡
 */
async function runWithInput(plugin, mode, input, opts) {
  const settings = plugin.settings;
  const ea = opts.ea;
  const bb = opts.bb;
  const srcIds = opts.srcIds || [];
  const hash = cacheHash(mode, settings, input);
  const meta = { v: 1, mode: mode.id, src: srcIds, hash: hash, ts: Date.now(), model: settings.model };
  const oldIds = findCardsForSource(ea, srcIds, mode.id);

  // 1. 先插一张占位卡，让人知道「在跑了」（不落盘，成功了直接覆盖）
  let placeholderIds = [];
  try {
    placeholderIds = await renderCard(
      ea, bb,
      [
        { kind: "title", text: cardTitle(mode, settings) },
        { kind: "small", text: t("ph1", settings) },
        { kind: "small", text: t("ph2", settings) },
      ],
      settings,
      Object.assign({}, meta, { placeholder: true }),
      oldIds,
      false
    );
  } catch (e) {
    placeholderIds = [];
  }

  // 2. 跑模型（命中缓存就省一次钱）
  let result = null;
  try {
    if (settings.cacheEnabled) {
      const hit = plugin.data.cache[hash];
      if (hit && hit.result) result = hit.result;
    }
    if (!result) {
      const built = mode.build({ text: input.text, settings: settings });
      const resp = await askDeepSeek({
        settings: settings,
        mode: mode,
        system: built.system,
        userText: built.userText,
        png: input.png,
      });
      result = resp.json;
      if (settings.cacheEnabled) plugin.cachePut(hash, { result: result, mode: mode.id, ts: Date.now() });
    }
  } catch (err) {
    const msg = (err && err.message) || String(err);
    new Notice(msg);
    try {
      await renderCard(
        ea, bb,
        [
          { kind: "title", text: t("errTitle", settings) },
          { kind: "error", text: msg },
          { kind: "divider" },
          { kind: "small", text: t("errHint", settings) },
        ],
        settings,
        Object.assign({}, meta, { error: true }),
        placeholderIds.concat(oldIds),
        true
      );
    } catch (e) { /* 连错误卡都画不出来就算了 */ }
    return;
  }

  // 3. 画正式卡片（顺手删掉占位卡和同模式的旧卡）
  try {
    const blocks = mode.render(result, settings);
    const ids = await renderCard(ea, bb, blocks, settings, meta, placeholderIds.concat(oldIds), true);
    plugin.setLastMode(mode.id);
    if (settings.autoArchive) archive(plugin, mode, result, input).catch(() => {});
    return ids;
  } catch (err) {
    new Notice(t("noticeCardFail", plugin.settings, { v: (err && err.message) || String(err) }));
  }
}

/**
 * 主流程：选中 → 导出 → 调模型 → 画卡片
 * @param {object} plugin CoachPlugin
 * @param {string} modeId
 */
async function runCoach(plugin, modeId) {
  const mode = getMode(modeId);
  if (!mode) { new Notice(t("noticeUnknownMode", plugin.settings, { v: modeId })); return; }

  let ea;
  try { ea = getEA(); } catch (e) { new Notice(e.message); return; }

  const settings = plugin.settings;

  // 正在编辑文本框：选中的那段字就是这次要处理的内容（不发图，直接读文本）
  const typed = readEditorSelection();
  if (typed && typed.text) {
    const el = editingElement(ea);
    const bb = el ? boxOf(el) : viewportBox(ea);
    if (!bb) return;
    const srcIds = el ? [el.id] : [];
    return runWithInput(plugin, mode, { text: typed.text, png: null, bbox: bb }, { ea, bb, srcIds });
  }

  const raw = ea.getViewSelectedElements() || [];
  const sel = expandSelection(ea, raw, settings.expandSelection);
  if (!sel.length) {
    new Notice(t("noSelection", settings));
    return;
  }

  let input;
  try { input = await selectionToInput(ea, sel); } catch (e) { new Notice(e.message); return; }

  if (input.png && settings.confirmBeforeSend) {
    const ok = await confirmSend(plugin.app, sel.length, settings);
    if (!ok) return;
  }

  const srcIds = sel.map((el) => el.id);
  const bb = input.bbox || ea.getBoundingBox(sel);
  return runWithInput(plugin, mode, input, { ea, bb, srcIds });
}

return { runCoach };
})();

// ===== src/floatbar.js =====
__m["floatbar"] = (function () {
const { MODE_ORDER } = __m["registry"];
const { modeLabel, modeShort, t, translateLabel } = __m["i18n"];
const { runCoach } = __m["engine"];
// 画布悬浮窗：三个模式 + 一个「设置」，点设置直接跳 Obsidian 的插件设置页

const BAR_GAP = 8;

function viewType(view) {
  if (!view) return "";
  try {
    return typeof view.getViewType === "function" ? view.getViewType() : view.getViewType || "";
  } catch (e) {
    return "";
  }
}

function isExcalidrawView(view) {
  if (!view) return false;
  if (viewType(view) === "excalidraw") return true;
  // 兜底：有些嵌入场景 viewType 不是 excalidraw，但容器里有画布
  try {
    const host = view.contentEl || view.containerEl;
    return !!(host && host.querySelector && host.querySelector(".excalidraw"));
  } catch (e) {
    return false;
  }
}

function openPluginSettings(plugin) {
  try {
    const app = plugin.app;
    if (app && app.setting && typeof app.setting.openTabById === "function") {
      app.setting.open();
      app.setting.openTabById(plugin.manifest.id);
      return true;
    }
  } catch (e) {
    console.warn("[coach] 打开设置页失败：", e);
  }
  new Notice(t("noticeSettingsPath", plugin.settings));
  return false;
}

class FloatBar {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
    this.view = null;
    this.saved = null;
    this._move = this._onPointerMove.bind(this);
    this._up = this._onPointerUp.bind(this);
  }

  get settings() {
    return this.plugin.settings;
  }

  // 找当前该挂在哪：先看活动页，再扫一遍所有页（侧栏里的画布也能挂）
  findView() {
    const ws = this.plugin.app && this.plugin.app.workspace;
    if (!ws) return null;
    const active = ws.activeLeaf && ws.activeLeaf.view;
    if (isExcalidrawView(active)) return active;
    let found = null;
    try {
      if (typeof ws.iterateAllLeaves === "function") {
        ws.iterateAllLeaves((leaf) => {
          if (!found && leaf && isExcalidrawView(leaf.view)) found = leaf.view;
        });
      }
    } catch (e) { /* 忽略 */ }
    return found;
  }

  // 跟随当前活动笔记：是 excalidraw 就挂上，否则摘掉
  sync() {
    try {
      if (typeof document === "undefined") return null; // 冒烟/无 DOM 环境
      if (this.settings.showFloatBar === false) {
        this.detach();
        return null;
      }
      const view = this.findView();
      if (!view) {
        this.detach();
        return null;
      }
      this.attach(view);
      return view;
    } catch (e) {
      console.warn("[coach] 悬浮窗同步失败（不影响命令）：", e);
      return null;
    }
  }

  attach(view) {
    if (this.el && this.view === view && this.el.isConnected) {
      this._applyPosition();
      return;
    }
    this.detach();

    const bar = document.createElement("div");
    bar.className = "coach-floatbar";

    const handle = document.createElement("div");
    handle.className = "coach-fb-handle";
    handle.textContent = "⠿";
    handle.title = t("drag", this.settings);
    bar.appendChild(handle);

    for (const m of MODE_ORDER) {
      const b = document.createElement("button");
      b.className = "coach-fb-btn";
      b.type = "button";
      b.title = modeLabel(m, this.settings) + "（" + m.emoji + "）";
      b.textContent = m.emoji + " " + modeShort(m, this.settings);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          runCoach(this.plugin, m.id);
        } catch (err) {
          console.warn("[coach]", err);
        }
      });
      bar.appendChild(b);

      // 翻译旁边挂一个「⇄」：点一下换方向，不用去设置页
      if (m.id === "translate") {
        this._translateBtn = b;
        const flip = document.createElement("button");
        flip.className = "coach-fb-flip";
        flip.type = "button";
        flip.title = t("flipTitle", this.settings);
        flip.textContent = "⇄";
        flip.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.flipDirection();
        });
        bar.appendChild(flip);
      }
    }


    const gear = document.createElement("button");
    gear.className = "coach-fb-gear";
    gear.type = "button";
    gear.title = t("gearTitle", this.settings);
    gear.textContent = t("gear", this.settings);
    gear.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPluginSettings(this.plugin);
    });
    bar.appendChild(gear);

    handle.addEventListener("pointerdown", (e) => this._onPointerDown(e));

    // 挂到 body 而不是视图容器里：视图里有 transform / overflow 时 position:fixed 会被带歪或裁掉
    const host = (typeof document !== "undefined" && document.body) || view.contentEl || view.containerEl;
    if (!host) return;
    host.appendChild(bar);
    this.el = bar;
    this.view = view;
    this._applyPosition();
    console.log("[coach] 悬浮窗已挂载");
  }

  detach() {
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
    this.view = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("pointermove", this._move);
      document.removeEventListener("pointerup", this._up);
    }
  }

  destroy() {
    this.detach();
  }

  // 悬浮窗上的「⇄」：换翻译方向，立刻改按钮文字并存进设置
  async flipDirection() {
    const s = this.settings;
    s.translateDirection = s.translateDirection === "reverse" ? "auto" : "reverse";
    const m = MODE_ORDER.find((x) => x.id === "translate");
    if (this._translateBtn && m) {
      this._translateBtn.textContent = m.emoji + " " + modeShort(m, s);
      this._translateBtn.title = modeLabel(m, s) + "（" + m.emoji + "）";
    }
    try { await this.plugin.saveSettings(); } catch (e) { /* 存不下也不影响这次运行 */ }
    new Notice(t("flipToast", s, { pair: translateLabel(s) }));
    return s.translateDirection;
  }

  _defaultPos(w, h) {
    const vw = (window && window.innerWidth) || 1200;
    const vh = (window && window.innerHeight) || 800;
    return { left: Math.max(BAR_GAP, vw - w - 24), top: Math.max(BAR_GAP, vh - h - 96) };
  }

  _applyPosition() {
    const bar = this.el;
    if (!bar) return;
    const w = bar.offsetWidth || 300;
    const h = bar.offsetHeight || 40;
    const vw = (window && window.innerWidth) || 1200;
    const vh = (window && window.innerHeight) || 800;
    const saved = this.settings.floatBarPos;
    const pos = saved && typeof saved.left === "number" ? saved : this._defaultPos(w, h);
    const left = Math.min(Math.max(BAR_GAP, pos.left), Math.max(BAR_GAP, vw - w - BAR_GAP));
    const top = Math.min(Math.max(BAR_GAP, pos.top), Math.max(BAR_GAP, vh - h - BAR_GAP));
    bar.style.left = left + "px";
    bar.style.top = top + "px";
  }

  _onPointerDown(e) {
    if (!this.el) return;
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    this.saved = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    document.addEventListener("pointermove", this._move);
    document.addEventListener("pointerup", this._up);
    this.el.classList.add("is-dragging");
  }

  _onPointerMove(e) {
    if (!this.el || !this.saved) return;
    const w = this.el.offsetWidth || 300;
    const h = this.el.offsetHeight || 40;
    const vw = (window && window.innerWidth) || 1200;
    const vh = (window && window.innerHeight) || 800;
    const left = Math.min(Math.max(BAR_GAP, e.clientX - this.saved.dx), Math.max(BAR_GAP, vw - w - BAR_GAP));
    const top = Math.min(Math.max(BAR_GAP, e.clientY - this.saved.dy), Math.max(BAR_GAP, vh - h - BAR_GAP));
    this.el.style.left = left + "px";
    this.el.style.top = top + "px";
  }

  _onPointerUp() {
    document.removeEventListener("pointermove", this._move);
    document.removeEventListener("pointerup", this._up);
    if (this.el) {
      this.el.classList.remove("is-dragging");
      this.settings.floatBarPos = {
        left: parseInt(this.el.style.left, 10) || 0,
        top: parseInt(this.el.style.top, 10) || 0,
      };
      Promise.resolve(this.plugin.saveSettings()).catch(() => {});
    }
    this.saved = null;
  }

  resetPosition() {
    this.settings.floatBarPos = null;
    this._applyPosition();
    Promise.resolve(this.plugin.saveSettings()).catch(() => {});
  }
}

return { openPluginSettings, FloatBar };
})();

// ===== src/main.js =====
__m["main"] = (function () {
const { CoachSettingTab, DEFAULT_SETTINGS } = __m["settings"];
const { MODE_ORDER, getMode } = __m["registry"];
const { runCoach } = __m["engine"];
const { FloatBar, openPluginSettings } = __m["floatbar"];
const { modeLabel, modeShort, t } = __m["i18n"];
// Obsidian 插件入口

const CACHE_LIMIT = 200;
// 老版本存的是 zh2en，第三模式改名成 translate 了
const MODE_ALIAS = { zh2en: "translate" };

function migrateModeId(id) {
  return MODE_ALIAS[id] || id;
}

class CoachPlugin extends Plugin {
  async onload() {
    const loaded = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded.settings || {});
    this.data = { cache: loaded.cache || {} };
    this.lastMode = migrateModeId(loaded.lastMode) || this.settings.defaultMode;
    this.settings.defaultMode = migrateModeId(this.settings.defaultMode);
    this.unregisterActions = null;

    // 三个模式命令（名字跟着母语走）
    for (const m of MODE_ORDER) {
      this.addCommand({
        id: "run-" + m.id,
        name: modeLabel(m, this.settings),
        hotkeys: [{ modifiers: ["Mod", "Alt"], key: m.hotkey }],
        callback: () => runCoach(this, m.id),
      });
    }


    // 重复上次
    this.addCommand({
      id: "repeat-last",
      name: t("cmdRepeat", this.settings),
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "E" }],
      callback: () => runCoach(this, this.lastMode),
    });

    // 设置（跳 Obsidian 的插件设置页）。左侧栏那一格的文字统一叫「ai-english-help」
    this.ribbonEl = this.addRibbonIcon("settings", t("ribbonTitle", this.settings), () => openPluginSettings(this));
    if (this.ribbonEl && typeof this.ribbonEl.setAttribute === "function") {
      this.ribbonEl.setAttribute("aria-label", t("ribbonTip", this.settings));
    }
    this.addCommand({
      id: "open-settings",
      name: t("cmdSettings", this.settings),
      callback: () => openPluginSettings(this),
    });
    this.addCommand({
      id: "toggle-floatbar",
      name: t("cmdToggleBar", this.settings),
      callback: async () => {
        this.settings.showFloatBar = this.settings.showFloatBar === false;
        await this.saveSettings();
        this.syncFloatBar();
        new Notice(this.settings.showFloatBar ? t("noticeBarShown", this.settings) : t("noticeBarHidden", this.settings));
      },
    });
    this.addCommand({
      id: "force-floatbar",
      name: t("cmdForceBar", this.settings),
      callback: async () => {
        this.settings.showFloatBar = true;
        await this.saveSettings();
        const view = this.syncFloatBar();
        new Notice(view ? t("noticeBarAttached", this.settings) : t("noticeBarNoView", this.settings));
      },
    });

    // Excalidraw 选中元素时的小工具条按钮
    try {
      const w = typeof window !== "undefined" ? window : globalThis;
      const ea = w.ExcalidrawAutomate;
      if (ea && typeof ea.registerElementActionProvider === "function") {
        this.unregisterActions = ea.registerElementActionProvider(() => [
          { icon: "sparkles", onClick: () => this.openModeMenu(null) },
        ]);
      }
    } catch (e) {
      console.warn("[coach] 元素工具条注册失败（不影响命令）：", e);
    }

    this.addSettingTab(new CoachSettingTab(this.app, this));

    // 画布悬浮窗：跟着活动笔记挂载/摘除
    try {
      this.floatBar = new FloatBar(this);
      const ws = this.app && this.app.workspace;
      if (ws && typeof ws.on === "function") {
        this.registerEvent(ws.on("active-leaf-change", () => this.syncFloatBar()));
        this.registerEvent(ws.on("layout-change", () => this.syncFloatBar()));
        this.registerEvent(ws.on("file-open", () => this.syncFloatBar()));
      }
      if (ws && typeof ws.onLayoutReady === "function") {
        ws.onLayoutReady(() => this.syncFloatBar());
      }
      // 插件加载时机比画布晚，多试几次兜住
      [0, 400, 1200, 2600].forEach((ms) => {
        const t = setTimeout(() => this.syncFloatBar(), ms);
        if (t && typeof t.unref === "function") t.unref();
      });
    } catch (e) {
      console.warn("[coach] 悬浮窗启动失败（不影响命令）：", e);
    }
  }

  syncFloatBar() {
    try {
      if (this.floatBar) return this.floatBar.sync();
    } catch (e) {
      console.warn("[coach] 悬浮窗同步失败：", e);
    }
    return null;
  }

  // 改了语言设置：拆掉重挂，按钮上的字才会跟着换
  refreshFloatBar() {
    try {
      if (this.ribbonEl && typeof this.ribbonEl.setAttribute === "function") {
        this.ribbonEl.setAttribute("aria-label", t("ribbonTip", this.settings));
      }
    } catch (e) { /* 忽略 */ }
    try {
      if (!this.floatBar) return;
      this.floatBar.detach();
      this.syncFloatBar();
    } catch (e) {
      console.warn("[coach] 悬浮窗刷新失败：", e);
    }
  }

  onunload() {
    try {
      if (typeof this.unregisterActions === "function") this.unregisterActions();
    } catch (e) { /* 忽略 */ }
    try {
      if (this.floatBar) this.floatBar.destroy();
    } catch (e) { /* 忽略 */ }
  }

  openModeMenu(evt) {
    const menu = new Menu();
    for (const m of MODE_ORDER) {
      menu.addItem((item) =>
        item
          .setTitle(m.emoji + " " + modeLabel(m, this.settings))
          .setIcon(m.icon)
          .onClick(() => runCoach(this, m.id))
      );
    }
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("设为默认模式")
        .setIcon("star")
        .onClick(async () => {
          this.settings.defaultMode = this.lastMode;
          await this.saveSettings();
          const m = getMode(this.lastMode);
          new Notice(t("noticeDefaultMode", this.settings, { v: m ? modeLabel(m, this.settings) : this.lastMode }));
        })
    );

    if (evt && typeof evt.clientX === "number" && typeof menu.showAtMouseEvent === "function") {
      menu.showAtMouseEvent(evt);
    } else if (typeof menu.showAtPosition === "function") {
      menu.showAtPosition({ x: Math.round(window.innerWidth * 0.5), y: 160 });
    }
  }

  setLastMode(id) {
    if (!id) return;
    this.lastMode = id;
  }

  cachePut(hash, entry) {
    this.data.cache[hash] = entry;
    const keys = Object.keys(this.data.cache);
    if (keys.length > CACHE_LIMIT) {
      keys
        .sort((a, b) => (this.data.cache[a].ts || 0) - (this.data.cache[b].ts || 0))
        .slice(0, keys.length - CACHE_LIMIT)
        .forEach((k) => delete this.data.cache[k]);
    }
    this.saveSettingsData();
  }

  async saveSettings() {
    await this.saveSettingsData();
  }

  async saveSettingsData() {
    await this.saveData({ settings: this.settings, cache: this.data.cache, lastMode: this.lastMode });
  }
}

return { default: CoachPlugin };
})();


const CoachPlugin = __m["main"].default;
module.exports = CoachPlugin;
module.exports.default = CoachPlugin;
