// 一次「框选 → 批改」的完整编排
import { expandSelection, getEA, selectionToInput } from "./ea.js";
import { askDeepSeek } from "./deepseek.js";
import { findCardsForSource, renderCard } from "./render.js";
import { getMode } from "./registry.js";
import { PROMPT_VERSION } from "./promptkit.js";
import { cardTitle, modeLabel, t } from "./i18n.js";
import { sha1Hex } from "./util.js";
import { readEditorSelection } from "./term.js";

function cacheHash(mode, settings, input) {
  const base = [
    mode.id,
    "pv" + PROMPT_VERSION,
    settings.model,
    settings.baseUrl || "",
    settings.deepThink ? "think" : "fast",
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
 * 带重入锁：连点两下只跑一次，避免重复计费和两张卡叠在一起
 * @param {object} plugin CoachPlugin
 * @param {string} modeId
 */
export async function runCoach(plugin, modeId) {
  if (plugin._busy) {
    new Notice(t("noticeBusy", plugin.settings));
    return;
  }
  plugin._busy = true;
  try {
    return await runCoachInner(plugin, modeId);
  } finally {
    plugin._busy = false;
  }
}

async function runCoachInner(plugin, modeId) {
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
