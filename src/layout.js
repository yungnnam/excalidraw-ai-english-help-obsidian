// 纯函数排版：blocks → 带坐标的行模型（测试里注入假的 measure）

export const COLORS = {
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

export function estimateWidth(text, size) {
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
export function layoutBlocks(blocks, opts) {
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
