// 与 Excalidraw 插件的交互：取 EA、选区外扩、导出 PNG
export function getEA() {
  const w = typeof window !== "undefined" ? window : globalThis;
  const ea = w.ExcalidrawAutomate;
  if (!ea) throw new Error("没检测到 Excalidraw 插件，请先启用 Excalidraw 并打开一个画布");
  ea.reset();
  const view = ea.setView("active");
  if (!view) throw new Error("当前没有激活的 Excalidraw 画布，先点开一个画布再试");
  return ea;
}

// 选区外扩：把和选区矩形相交的笔迹并进来，避免漏笔画
export function expandSelection(ea, sel, enabled) {
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
export async function selectionToInput(ea, sel) {
  if (!sel.length) throw new Error("先框选要处理的内容");
  const bb = ea.getBoundingBox(sel);

  if (sel.every((el) => el.type === "text")) {
    const text = sel.map((el) => el.text || "").filter(Boolean).join("\n").trim();
    if (text) return { text, png: null, bbox: bb };
  }
  const { blob, bbox } = await exportSelectionBlob(ea, sel);
  return { text: null, png: await blobToBase64(blob), bbox: bbox || bb };
}
