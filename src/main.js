// Obsidian 插件入口
import { CoachSettingTab, DEFAULT_SETTINGS } from "./settings.js";
import { MODE_ORDER, getMode } from "./registry.js";
import { runCoach } from "./engine.js";
import { FloatBar, openPluginSettings } from "./floatbar.js";
import { modeLabel, modeShort, t } from "./i18n.js";

const CACHE_LIMIT = 200;
// 老版本存的是 zh2en，第三模式改名成 translate 了
const MODE_ALIAS = { zh2en: "translate" };

function migrateModeId(id) {
  return MODE_ALIAS[id] || id;
}

export default class CoachPlugin extends Plugin {
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
