// 🌉 翻译：母语 ↔ 学习语言（方向由设置决定，默认母语 → 学习语言）
import { systemFor, userTextFor } from "../promptkit.js";
import { langLabel, t, pick, cardTitle, translatePair } from "../i18n.js";

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

export const translateMode = {
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
