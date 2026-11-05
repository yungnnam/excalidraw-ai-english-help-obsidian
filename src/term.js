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

export function editorTextarea(doc) {
  const d = doc || (typeof document === "undefined" ? null : document);
  if (!d) return null;
  if (isEditor(d.activeElement)) return d.activeElement;
  const found = d.querySelector ? d.querySelector("textarea.excalidraw-wysiwyg") : null;
  return isEditor(found) ? found : null;
}

// 编辑器里选中的那段文字；没选中就退化成「光标所在行」
export function readEditorSelection(doc) {
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
