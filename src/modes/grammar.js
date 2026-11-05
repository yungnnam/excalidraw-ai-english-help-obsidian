// 📝 语法批改
import { systemFor, userTextFor } from "../promptkit.js";
import { langLabel, langName, t, pick, cardTitle, translateLabel } from "../i18n.js";

function preamble(settings) {
  const native = langLabel(settings && settings.nativeLang);
  const target = langLabel(settings && settings.learnLang);
  return `你的任务是「批改 ${target}」。识别图中的 ${target} 句子，逐条指出语法、用词、搭配错误，给出改写、${native} 意思和下一步复习建议。

输出 JSON，结构如下（字段一个都不能少）：
{
  "mode": "grammar",
  "transcript": [{ "line": "逐行转录，保留原始错误", "confidence": 0.0, "uncertain": ["认不准的词"] }],
  "detected_language": "en 或 zh",
  "rewrite": "改写后的完整句子（没错就与原句一致）",
  "translation": "改写句的${native}意思",
  "corrections": [{
    "original": "原文片段",
    "corrected": "改成什么",
    "type": "tense | agreement | article | preposition | sentence-structure | word-form | collocation | word-order | spelling | punctuation | chinglish",
    "rule": "规则名，如「一般过去时」「不定冠词 a/an」",
    "why": "为什么错、为什么改成这个（用${native}写）",
    "level": "这个知识点属于 A1 / A2 / B1 / B2"
  }],
  "praise": "先夸一句做对的地方（用${native}写）",
  "score": { "grammar": 0, "vocab": 0, "naturalness": 0 },
  "summary": "一句话总评（用${native}写）",
  "nextStep": "下一步该复习什么（用${native}写）"
}

批改纪律：
- 先转录，再批改。转录必须包含原始错误，不许边转录边纠正。
- why 必须点名规则并解释原因，不能只说"这样更自然"。学习者要的是可复用的规则。
- 一条 correction 只讲一个问题。但同一个词上叠着两三个问题时（比如既时态错又主谓不一致），合并成一条，corrected 直接给最终正确形式，why 里把几个原因一次说清——别把一个错拆成好几条，学习卡片会变啰嗦。
- 没有错误时：corrections 给空数组，rewrite 与原句一致，praise 写一句具体的肯定，score.grammar 给 90 以上。
- score 三个维度 0~100，按用户水平打分（A2 学习者用 A2 的标准，别拿 C1 要求他）。
- 如果发现整段其实是母语（而不是 ${target}），detected_language 照实写，corrections 给空数组，summary 里提示"这段像母语，建议用翻译模式"。`;
}

export const grammarMode = {
  id: "grammar",
  label: "语法批改",
  icon: "pencil-line",
  emoji: "📝",
  hotkey: "2",
  temperature: 0.2,
  maxTokens: 2400,

  build({ text, settings }) {
    return {
      system: systemFor(preamble(settings), settings),
      userText: userTextFor({ text }),
    };
  },

  render(result, settings) {
    const score = result.score || {};
    const blocks = [{ kind: "title", text: cardTitle(grammarMode, settings, score.grammar) }];

    const lines = (result.transcript || []).map((it) => it && it.line).filter(Boolean);
    if (lines.length) {
      blocks.push({ kind: "label", text: t("seen", settings) });
      for (const line of lines) blocks.push({ kind: "orig", text: line });
    }

    if (result.rewrite && result.rewrite.trim() && result.rewrite.trim() !== lines.join(" ").trim()) {
      blocks.push({ kind: "label", text: t("rewrite", settings) });
      blocks.push({ kind: "answer", text: result.rewrite });
    }

    const corrections = (result.corrections || []).filter((c) => c && (c.original || c.corrected));
    const learn = (settings && settings.learnLang) || "en";
    if (corrections.length) {
      blocks.push({ kind: "label", text: t("issues", settings, { n: corrections.length }) });
      corrections.forEach((c, i) => {
        const mark = "①②③④⑤⑥⑦⑧⑨⑩"[i] || `${i + 1}.`;
        const pair = c.original && c.corrected ? `${c.original} → ${c.corrected}` : c.corrected || c.original;
        // 改错单独一行（红），规则和等级缩进一行（灰），解释再缩进——红字太长会溢出卡片
        blocks.push({ kind: "error", text: `${mark} ${pair}` });
        const tags = [c.rule, c.level].filter(Boolean).join(" · ");
        if (tags) blocks.push({ kind: "small", text: tags, indent: 16 });
        const why = pick(c, ["why", "why_zh"]);
        if (why) blocks.push({ kind: "small", text: why, indent: 16 });
      });
    } else if (result.detected_language && result.detected_language !== learn) {
      blocks.push({
        kind: "error",
        text: t("wrongLang", settings, {
          learn: langName(learn, settings && settings.nativeLang),
          mode: translateLabel(settings),
        }),
      });
    } else {
      blocks.push({ kind: "answer", text: t("noErrors", settings) });
    }

    const praise = pick(result, ["praise", "praise_zh"]);
    if (praise) blocks.push({ kind: "quote", text: t("praise", settings) + "　" + praise });
    const translation = pick(result, ["translation", "translation_zh"]);
    if (translation) {
      blocks.push({ kind: "label", text: t("meaning", settings) });
      blocks.push({ kind: "body", text: translation });
    }
    const summary = pick(result, ["summary", "summary_zh"]);
    if (summary) blocks.push({ kind: "small", text: summary });
    const nextStep = pick(result, ["nextStep", "next_step_zh"]);
    if (nextStep) {
      blocks.push({ kind: "divider" });
      blocks.push({ kind: "small", text: t("nextStep", settings) + "　" + nextStep });
    }
    return blocks;
  },
};
