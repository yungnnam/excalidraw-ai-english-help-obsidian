// 把 blocks 画成 Excalidraw 卡片（底板 + 文字 + 分隔线 + 分组 + customData）
import { layoutBlocks } from "./layout.js";

const CARD_GAP = 64;

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 选一个不压住已有元素的位置 */
export function pickCardPosition(ea, bb, w, h, pref) {
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
export function findCardsForSource(ea, srcIds, modeId) {
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
export async function renderCard(ea, bb, blocks, settings, meta, deleteIds, save) {
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
