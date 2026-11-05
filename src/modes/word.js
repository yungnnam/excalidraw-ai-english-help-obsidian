// 🔤 词缀与释义
import { systemFor, userTextFor } from "../promptkit.js";
import { langLabel, t, pick, cardTitle } from "../i18n.js";

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

export const wordMode = {
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
