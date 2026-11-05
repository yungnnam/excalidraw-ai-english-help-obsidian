// 冒烟测试：用假的 obsidian + 假的 ExcalidrawAutomate 跑一遍真实 main.js
// node dev/smoke.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const code = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");

// ---------------- 假 obsidian ----------------
const notices = [];
const htmlEl = () => ({
  setText(t) { this.textContent = String(t); },
  createEl(tag, o) {
    const c = htmlEl();
    c.tagName = tag;
    c.cls = (o && o.cls) || "";
    if (o && o.text != null) c.text = String(o.text);
    this.children.push(c);
    return c;
  },
  createDiv(o) { return this.createEl("div", o); },
  appendChild(c) { this.children.push(c); return c; },
  addClass() {}, removeClass() {},
  toggleClass(cls, on) { this._cls = this._cls || {}; this._cls[cls] = on; },
  empty() { this.children = []; },
  style: {}, addEventListener() {}, setAttribute() {}, remove() {},
  innerHTML: "", textContent: "", children: [],
});

class Notice {
  constructor(msg) { notices.push(String(msg)); }
  setMessage(m) { notices.push(String(m)); }
  hide() {}
}

class Setting {
  constructor(el) { this.el = el; }
  setName(n) { if (n != null) (globalThis.__settingNames ||= []).push(String(n)); return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  addText(cb) { try { cb({ setPlaceholder: () => ({ setValue: () => ({ onChange: () => ({}) }) }), setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }); } catch (e) { throw new Error("addText 用法不兼容：" + e.message); } return this; }
  addTextArea(cb) { return this.addText(cb); }
  addToggle(cb) { try { cb({ setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }); } catch (e) { throw new Error("addToggle 用法不兼容：" + e.message); } return this; }
  addDropdown(cb) { try { cb({ addOption: () => ({ addOption: () => ({ setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }) }), addOptions: () => ({ setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }), setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }); } catch (e) { throw new Error("addDropdown 用法不兼容：" + e.message); } return this; }
  addSlider(cb) { try { cb({ setLimits: () => ({ setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }), setValue: () => ({ onChange: () => ({}) }), onChange: () => ({}) }); } catch (e) { throw new Error("addSlider 用法不兼容：" + e.message); } return this; }
  addButton(cb) { try { cb({ setButtonText: () => ({ setCta: () => ({ onClick: () => ({}) }), onClick: () => ({}) }), setCta: () => ({ onClick: () => ({}) }), onClick: () => ({}) }); } catch (e) { throw new Error("addButton 用法不兼容：" + e.message); } return this; }
  addExtraButton(cb) { return this; }
}

class PluginSettingTab {
  constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = htmlEl(); }
  display() {}
  hide() {}
}

class Menu {
  constructor() { this.items = []; }
  addItem(cb) { cb({ setTitle: () => ({ setIcon: () => ({ onClick: (h) => ({}) }), onClick: (h) => ({}) }), setIcon: () => ({ setTitle: () => ({ onClick: () => ({}) }), onClick: () => ({}) }), onClick: () => ({}) }); return this; }
  addSeparator() { return this; }
  showAtPosition() {}
  showAtMouseEvent() {}
}

const modals = [];
class Modal {
  constructor(app) { this.app = app; this.titleEl = htmlEl(); this.contentEl = htmlEl(); }
  open() { modals.push(this); if (typeof this.onOpen === "function") this.onOpen(); }
  close() {} onClose() {}
}

class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest || {};
    this._commands = [];
    this._ribbons = [];
    this._tabs = [];
    this._saved = null;
  }
  addCommand(c) { this._commands.push(c); return c; }
  addRibbonIcon(...a) { this._ribbons.push(a); return { setAttribute(k, v) { this[k] = v; } }; }
  addSettingTab(t) { this._tabs.push(t); }
  registerEvent() {}
  async loadData() { return this._saved; }
  async saveData(d) { this._saved = d; }
}

// ---------------- 假 ExcalidrawAutomate ----------------
function makeEA(selection) {
  const st = { n: 0, els: [], texts: [], groups: 0, committed: 0, saves: [], pngCalls: 0 };
  const mk = (type, extra) => {
    const el = Object.assign({ id: "el" + ++st.n, type, x: 0, y: 0, width: 100, height: 20, isDeleted: false }, extra);
    st.els.push(el);
    return el;
  };
  const ea = {
    style: {},
    st,
    reset() { return ea; },
    setView() { return {}; },
    getViewSelectedElements() { return selection; },
    getViewElements() { return st.els.filter((e) => !e.isDeleted); },
    getBoundingBox() { return { topX: 100, topY: 100, width: 300, height: 120 }; },
    clear() {},
    measureText(t) { return { width: String(t).length * 8.4, height: 20 }; },
    setFontFamily() {},
    setTheme() {},
    verifyMinimumPluginVersion() { return true; },
    addRect(x, y, w, h) { return mk("rectangle", { x, y, width: w, height: h }).id; },
    addText(x, y, text) { st.texts.push(text); return mk("text", { x, y, text, width: String(text).length * 8.4 }).id; },
    addLine(pts) { return mk("line", { x: pts[0][0], y: pts[0][1] }).id; },
    addToGroup(ids) { st.groups++; return "group" + st.groups; },
    copyViewElementsToEAforEditing(list) { return list; },
    getElement(id) { return st.els.find((e) => e.id === id) || null; },
    addAppendUpdateCustomData(id, data) {
      const el = ea.getElement(id);
      if (el) el.customData = Object.assign({}, el.customData || {}, data);
    },
    async addElementsToView(reposition, save, onTop) {
      st.committed++;
      st.saves.push(!!save);
      return true;
    },
    async createViewPNG(opts) {
      st.pngCalls++;
      st.lastPngOpts = opts;
      return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])], { type: "image/png" });
    },
    async createPNG() { return ea.createViewPNG({}); },
    getExportSettings() { return {}; },
    selectElementsInView() {},
    registerElementActionProvider(provider) {
      st.provider = provider;
      return () => { st.provider = null; };
    },
    getExcalidrawAPI() {
      return { getAppState: () => ea.__appState || {} };
    },
  };
  return ea;
}

// ---------------- 假 requestUrl ----------------
let requestCount = 0;
let lastRequest = null;
let replyFixture = "grammar";
let failMode = null;
async function requestUrl(opts) {
  requestCount++;
  lastRequest = opts;
  if (failMode) return { status: 500, json: null, text: failMode };
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "dev/fixtures", replyFixture + ".json"), "utf8"));
  return {
    status: 200,
    json: {
      choices: [{ message: { role: "assistant", content: JSON.stringify(fixture) } }],
      usage: { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 },
    },
    text: "",
  };
}

const fakeRequire = (name) => {
  if (name !== "obsidian") throw new Error("意外 require: " + name);
  return { Plugin, PluginSettingTab, Setting, Notice, Menu, Modal, requestUrl, normalizePath: (p) => p.replace(/\\/g, "/") };
};

// ---------------- 跑 ----------------
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}

const selection = [
  { id: "free1", type: "freedraw", x: 120, y: 110, width: 190, height: 70, isDeleted: false },
  { id: "free2", type: "freedraw", x: 130, y: 200, width: 160, height: 60, isDeleted: false },
];
const ea = makeEA(selection);

const w = globalThis;
w.window = w;
w.ExcalidrawAutomate = ea;
w.innerWidth = 1400;

const mod = { exports: {} };
const fn = new Function("require", "module", "exports", code + "\n//# sourceURL=main.js");
fn(fakeRequire, mod, mod.exports);
const CoachPlugin = mod.exports;

console.log("① 加载插件");
ok("main.js 导出的是 class", typeof CoachPlugin === "function");
ok("默认导出同一份", mod.exports.default === CoachPlugin);

console.log("② onload 注册");
const app = { vault: { adapter: { exists: async () => false, mkdir: async () => {}, write: async () => {}, read: async () => "" } } };
const plugin = new CoachPlugin(app, { id: "ai-english-help" });
await plugin.onload();
const cmdIds = plugin._commands.map((c) => c.id);
ok("三个模式命令", ["run-word", "run-grammar", "run-translate"].every((id) => cmdIds.includes(id)), cmdIds.join(","));
ok("选择模式的命令已经删掉", !cmdIds.includes("choose-mode"), cmdIds.join(","));
ok("重复上次命令", cmdIds.includes("repeat-last"));
ok("命令都带名字", plugin._commands.every((c) => c.name && c.callback));
ok("默认热键 Mod+Alt+1/2/3", plugin._commands.filter((c) => c.id.startsWith("run-")).every((c) => c.hotkeys && c.hotkeys[0].modifiers.join("+") === "Mod+Alt"));
ok("打开设置命令", cmdIds.includes("open-settings"));
ok("悬浮窗开关命令", cmdIds.includes("toggle-floatbar"));
ok("排查用的强制显示命令", cmdIds.includes("force-floatbar"));
ok("ribbon 只有设置一个（选择模式那个已删）", plugin._ribbons.length === 1, plugin._ribbons.map((r) => r[0]).join(","));
ok("设置图标在 ribbon 上", plugin._ribbons.some((r) => r[0] === "settings"));
ok("左侧栏那一格的文字叫 ai-english-help", plugin._ribbons[0][1] === "ai-english-help", String(plugin._ribbons[0][1]));
ok("设置页挂载", plugin._tabs.length === 1);
ok("悬浮窗没 DOM 时不崩", plugin.floatBar && typeof plugin.floatBar.sync === "function");
ok("悬浮窗默认开着", plugin.settings.showFloatBar === true);
ok("元素工具条注册", typeof ea.st.provider === "function");
if (ea.st.provider) {
  const actions = ea.st.provider();
  ok("工具条给了一个按钮", Array.isArray(actions) && actions.length === 1 && typeof actions[0].onClick === "function");
  ok("设置页能渲染不报错", (() => { try { plugin._tabs[0].display(); return true; } catch (e) { console.log("     " + e.message); return false; } })());
}

console.log("③ 跑一次语法批改（假 API）");
plugin.settings.apiKey = "sk-test";   // 假 key，请求被 requestUrl 截胡
notices.length = 0;
await plugin._commands.find((c) => c.id === "run-grammar").callback();
ok("没弹错误提示", notices.length === 0, notices.join(" | "));
ok("真的请求了一次", requestCount === 1, String(requestCount));
ok("请求体是 JSON 模式", lastRequest && JSON.parse(lastRequest.body).response_format.type === "json_object");
ok("图片以 base64 发出", lastRequest && JSON.parse(lastRequest.body).messages[1].content[1].image_url.url.startsWith("data:image/png;base64,"));
ok("导出了 PNG", ea.st.pngCalls === 1, String(ea.st.pngCalls));
ok("占位卡 + 正式卡 = 提交两次", ea.st.committed === 2, String(ea.st.committed));
ok("占位卡不落盘", ea.st.saves[0] === false && ea.st.saves[1] === true, JSON.stringify(ea.st.saves));
ok("卡片文字里有改写句", ea.st.texts.join("\n").includes("I had an apple yesterday."));
const liveTexts = ea.st.els.filter((e) => e.type === "text" && !e.isDeleted).map((e) => e.text).join("\n");
ok("占位卡被删掉了（画面上没有 ⏳）", !liveTexts.includes("⏳"), liveTexts.slice(0, 120));
ok("卡片分组了", ea.st.groups >= 2, String(ea.st.groups));
const cardEls = ea.st.els.filter((e) => e.customData && e.customData.coach);
ok("卡片带 customData.coach", cardEls.length > 0 && cardEls.every((e) => e.customData.coach.mode === "grammar"));
ok("结果进缓存", plugin._saved && Object.keys(plugin._saved.cache).length === 1, plugin._saved ? JSON.stringify(Object.keys(plugin._saved.cache)) : "没保存");
ok("上次模式记住了", plugin._saved && plugin._saved.lastMode === "grammar");

console.log("④ 再跑一次：应当命中缓存、且替换旧卡");
const pngBefore = ea.st.pngCalls;
await plugin._commands.find((c) => c.id === "run-grammar").callback();
ok("没有再请求 API", requestCount === 1, String(requestCount));
ok("没弹错误", notices.length === 0, notices.join(" | "));
const deleted = ea.st.els.filter((e) => e.isDeleted && e.customData && e.customData.coach);
ok("旧卡片被标记删除", deleted.length > 0, String(deleted.length));

console.log("⑤ 错误路径：API 500");
failMode = "upstream exploded";
notices.length = 0;
plugin.settings.cacheEnabled = false;
plugin.settings.apiKey = "sk-test";
await plugin._commands.find((c) => c.id === "run-grammar").callback();
ok("弹了错误提示", notices.length > 0, String(notices.length));
ok("提示是中文人话", /服务|异常|重试|500/.test(notices.join(" ")), notices.join(" | "));
const errCards = ea.st.texts.filter((t) => String(t).includes("⚠️"));
ok("画了错误卡片", errCards.length > 0, String(errCards.length));

console.log("⑥ 没有 API Key 时给指引");
notices.length = 0;
plugin.settings.apiKey = "";
plugin.settings.cacheEnabled = true;
failMode = null;
await plugin._commands.find((c) => c.id === "run-word").callback();
ok("提示去设置页填 key", notices.join(" ").includes("API Key"), notices.join(" | "));

console.log("⑦ 悬浮窗（假 DOM）");
function mkEl(tag) {
  const el = {
    tagName: tag, className: "", textContent: "", title: "", type: "",
    style: {}, children: [], parentNode: null, isConnected: true,
    offsetWidth: 260, offsetHeight: 38,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
    addEventListener(t, f) { el._h = el._h || {}; (el._h[t] = el._h[t] || []).push(f); },
    removeEventListener(t, f) { if (el._h && el._h[t]) el._h[t] = el._h[t].filter((x) => x !== f); },
    getBoundingClientRect() { return { left: 100, top: 100 }; },
    fire(t, ev) { (el._h && el._h[t] ? el._h[t] : []).forEach((f) => f(ev || { preventDefault() {}, stopPropagation() {} })); },
  };
  return el;
}
globalThis.document = { createElement: mkEl, addEventListener() {}, removeEventListener() {}, body: mkEl("body") };

const exView = { getViewType: () => "excalidraw", containerEl: mkEl("div") };
plugin.app.workspace = { activeLeaf: { view: exView } };
plugin.settings.showFloatBar = true;
plugin.settings.floatBarPos = null;
plugin.floatBar.sync();

const hostEl = globalThis.document.body;
const bars = () => hostEl.children.filter((c) => c.className === "coach-floatbar");
const bar = bars()[0];
ok("悬浮窗挂到了页面上", !!bar && bar.className === "coach-floatbar");
const modeBtns = bar ? bar.children.filter((c) => c.className === "coach-fb-btn") : [];
ok("三个模式按钮", modeBtns.length === 3, String(modeBtns.length));
ok("按钮文字是 emoji + 短名", modeBtns.map((b) => b.textContent).join("|") === "🔤 词缀|📝 批改|🌉 中译英", modeBtns.map((b) => b.textContent).join("|"));
ok("拖柄和设置按钮都在", !!bar && bar.children.some((c) => c.className === "coach-fb-handle") && bar.children.some((c) => c.className === "coach-fb-gear"));
ok("设置按钮文字是「⚙ 设置」", bar && bar.children.filter((c) => c.className === "coach-fb-gear").map((c) => c.textContent)[0] === "⚙ 设置");
ok("位置算出来了", !!bar && /px$/.test(bar.style.left) && /px$/.test(bar.style.top), bar ? bar.style.left + "," + bar.style.top : "");

plugin.data.cache = {};
const before = requestCount;
notices.length = 0;
plugin.settings.apiKey = "sk-test";
modeBtns[1].fire("click");
await new Promise((r) => setTimeout(r, 150));
ok("点「批改」真的跑了一轮", requestCount === before + 1, String(requestCount - before));
ok("跑完没弹错", notices.length === 0, notices.join(" | "));

plugin.app.workspace.activeLeaf = { view: { getViewType: () => "markdown", containerEl: mkEl("div") } };
plugin.floatBar.sync();
ok("切到普通笔记自动摘掉", bars().length === 0, String(bars().length));

plugin.app.workspace.activeLeaf = { view: exView };
plugin.floatBar.sync();
ok("切回画布又挂上", bars().length === 1, String(bars().length));

plugin.settings.showFloatBar = false;
plugin.floatBar.sync();
ok("隐藏开关关掉后不再挂载", bars().length === 0, String(bars().length));

plugin.settings.showFloatBar = true;

console.log("⑧ 「⚙ 设置」跳转到 Obsidian 插件设置页");
const settingCalls = [];
plugin.app.setting = {
  open() { settingCalls.push("open"); },
  openTabById(id) { settingCalls.push("tab:" + id); },
};
plugin.floatBar.sync();
const bar2 = bars()[0];
const gear = bar2 ? bar2.children.filter((c) => c.className === "coach-fb-gear")[0] : null;
ok("设置按钮在", !!gear);
if (gear) gear.fire("click");
ok("点设置就打开设置页并定位到本插件", settingCalls.join(",") === "open,tab:ai-english-help", settingCalls.join(","));

console.log("⑨ 活动页不是画布时，扫一遍所有页也能找到");
plugin.app.workspace.activeLeaf = { view: { getViewType: () => "markdown", containerEl: mkEl("div") } };
plugin.app.workspace.iterateAllLeaves = (fn) => fn({ view: exView });
plugin.settings.floatBarPos = null;
plugin.floatBar.sync();
ok("从普通笔记切过去也能挂到画布", bars().length === 1, String(bars().length));

console.log("⑩ 换成「母语英文 / 学中文」后界面和翻译方向都跟着变");
plugin.app.workspace.activeLeaf = { view: exView };
plugin.settings.nativeLang = "en";
plugin.settings.learnLang = "zh";
plugin.settings.translateDirection = "auto";
plugin.floatBar.detach();
plugin.floatBar.sync();
const bar3 = bars()[0];
const btns3 = bar3 ? bar3.children.filter((c) => c.className === "coach-fb-btn") : [];
ok("悬浮窗按钮变英文", btns3.map((b) => b.textContent).join("|") === "🔤 Roots|📝 Check|🌉 EN→ZH", btns3.map((b) => b.textContent).join("|"));
const gear3 = bar3 ? bar3.children.filter((c) => c.className === "coach-fb-gear")[0] : null;
ok("设置按钮也变英文", gear3 && gear3.textContent === "⚙ Settings", gear3 ? gear3.textContent : "没有");

replyFixture = "translate";
plugin.data.cache = {};
ea.st.texts.length = 0;
ea.st.saves.length = 0;
await plugin._commands.find((c) => c.id === "run-translate").callback();
const cardText = ea.st.els.filter((e) => !e.isDeleted && e.type === "text").map((e) => e.text).join("\n");
ok("翻译卡片标题用了英文方向", /English → Chinese/.test(cardText), cardText.split("\n")[0]);
ok("卡片标签是英文", /Original|Natural|Literal/.test(cardText), cardText.slice(0, 60));

// 换回中文，免得影响后面的断言
plugin.settings.nativeLang = "zh";
plugin.settings.learnLang = "en";

console.log("⑪ 界面语言能单独切，不影响学习语言");
plugin.settings.uiLang = "en";
globalThis.__settingNames = [];
try { plugin._tabs[0].display(); } catch (e) { console.log("     " + e.message); }
const names = globalThis.__settingNames || [];
ok("设置页换成英文了", names.indexOf("Interface language") >= 0 && names.indexOf("界面语言") < 0, names.slice(0, 5).join(" / "));
ok("学习语言那行还在（内容语言没被带跑）", names.indexOf("Language to learn") >= 0, names.join(" / "));

plugin.settings.uiLang = "";
globalThis.__settingNames = [];
try { plugin._tabs[0].display(); } catch (e) { console.log("     " + e.message); }
const names2 = globalThis.__settingNames || [];
ok("留空就跟随母语（回到中文）", names2.indexOf("界面语言") >= 0 && names2.indexOf("Language to learn") < 0, names2.slice(0, 5).join(" / "));

replyFixture = "grammar";
plugin.floatBar.detach();

console.log("⑫ 在文本框里选中一个词 → 直接点「词缀」，只发文字不发图");
const ta = {
  tagName: "TEXTAREA",
  classList: { contains: (c) => c === "excalidraw-wysiwyg" },
  closest: () => null,
  value: "行列式是**只对方阵定义**的一个标量值",
  selectionStart: 0,
  selectionEnd: 4,
};
globalThis.document.activeElement = ta;
globalThis.document.querySelector = () => null;
ea.__appState = { editingElement: { id: "txt1", type: "text", x: 100, y: 100, width: 260, height: 30 } };
replyFixture = "word";
const pngBeforeTyped = ea.st.pngCalls;
const reqBeforeTyped = requestCount;
ea.st.saves.length = 0;
await plugin._commands.find((c) => c.id === "run-word").callback();
ok("编辑态下没导出截图", ea.st.pngCalls === pngBeforeTyped, ea.st.pngCalls + " vs " + pngBeforeTyped);
ok("还是只请求了一次", requestCount === reqBeforeTyped + 1, requestCount + " vs " + reqBeforeTyped);
const sentBody = String((lastRequest && lastRequest.body) || "");
ok("发出去的是选中的那 4 个字", sentBody.indexOf("行列式是") >= 0 && sentBody.indexOf("标量值") < 0, sentBody.slice(0, 90));
const typedCards = ea.st.els.filter(
  (e) => !e.isDeleted && e.customData && e.customData.coach && (e.customData.coach.src || []).indexOf("txt1") >= 0
);
ok("卡片记下了源文本框", typedCards.length > 0, String(typedCards.length));
ok("卡片落盘了", ea.st.saves[ea.st.saves.length - 1] === true, JSON.stringify(ea.st.saves));

const typedIds = typedCards.map((e) => e.id);
plugin.data.cache = {};
await plugin._commands.find((c) => c.id === "run-word").callback();
ok("同一个词再点一次是替换旧卡", typedIds.length > 0 && typedIds.every((id) => (ea.getElement(id) || {}).isDeleted === true), "旧卡没删");

globalThis.document.activeElement = null;
ea.__appState = {};
plugin.data.cache = {};
console.log("⑬ 悬浮窗上的 ⇄ 直接切换翻译方向（设置页里那一行删了）");
plugin.settings.nativeLang = "zh";
plugin.settings.learnLang = "en";
plugin.settings.translateDirection = "auto";
plugin.floatBar.detach();
plugin.floatBar.sync();
const barFlip = bars()[0];
const flipBtn = barFlip ? barFlip.children.filter((c) => c.className === "coach-fb-flip")[0] : null;
ok("翻译按钮后面有 ⇄", !!flipBtn, flipBtn ? flipBtn.textContent : "没有");
const trBtn = barFlip ? barFlip.children.filter((c) => c.className === "coach-fb-btn")[2] : null;
ok("翻译按钮现在是「中译英」", trBtn && /中译英/.test(trBtn.textContent), trBtn ? trBtn.textContent : "没有");

await plugin.floatBar.flipDirection();
ok("方向切成 reverse", plugin.settings.translateDirection === "reverse", String(plugin.settings.translateDirection));
ok("按钮文字跟着变成「英译中」", trBtn && /英译中/.test(trBtn.textContent), trBtn ? trBtn.textContent : "没有");
ok("方向存进 data.json 了", !!(plugin._saved && plugin._saved.settings && plugin._saved.settings.translateDirection === "reverse"), JSON.stringify(plugin._saved && plugin._saved.settings && plugin._saved.settings.translateDirection));

await plugin.floatBar.flipDirection();
ok("再点一下换回「中译英」", plugin.settings.translateDirection === "auto" && trBtn && /中译英/.test(trBtn.textContent), trBtn ? trBtn.textContent : "没有");

globalThis.__settingNames = [];
try { plugin._tabs[0].display(); } catch (e) { console.log("     " + e.message); }
const settingNames3 = globalThis.__settingNames || [];
ok("设置页里已经没有「翻译方向」这一行", settingNames3.indexOf("翻译方向") < 0, settingNames3.join(" / "));
delete globalThis.document;

console.log("");
if (fail) { console.log("失败 " + fail + " 项"); process.exit(1); }
console.log("✓ 冒烟全部通过");
