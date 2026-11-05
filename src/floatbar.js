// 画布悬浮窗：三个模式 + 一个「设置」，点设置直接跳 Obsidian 的插件设置页
import { MODE_ORDER } from "./registry.js";
import { modeLabel, modeShort, t, translateLabel } from "./i18n.js";
import { runCoach } from "./engine.js";

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

export function openPluginSettings(plugin) {
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

export class FloatBar {
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
