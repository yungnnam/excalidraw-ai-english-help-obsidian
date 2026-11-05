# 设计文档 · 开发计划 v2

> 编写于实现之前，保留作为设计记录。实现过程中的调整见 [§13](#13-与初始计划的差异)；与本文不一致之处，以代码和 [README](../README.md) 为准。
>
> 形态：独立 Obsidian 插件（依赖 Excalidraw 插件），后端仅调用 DeepSeek。
> 核心动作：**在画布上框选 → 选择模式 → 卡片生成在笔迹旁。**
> 设计要点：三个互相独立的模式（各自维护提示词与 JSON schema），不做「单按钮自动推断意图」。

---

## 1. 三个模式（产品的全部内容）

| | 🔤 词缀与释义 | 📝 语法批改 | 🌉 中译英 |
| --- | --- | --- | --- |
| **输入** | 单词、生词表、短语 | 英文句子 / 段落 | 中文句子 |
| **输出** | 音标 · 词性 · 中文义 · **词根词缀拆解** · 同根词族 · 例句 · 搭配 · 记忆法 | 原文转录 · 改写句 · **逐条错误 + 为什么** · 中文意思 · 下一步复习 | 直译 / 自然版 / 进阶版 **三个版本** · 关键句型 · 生词 · 中式英语避坑 |
| **卡片头** | `🔤 词缀与释义` | `📝 语法批改 · 72分` | `🌉 中译英` |
| **典型耗时** | 2–3s（输出短） | 3–6s | 3–5s |
| **一次能处理** | 最多 8 个单词（合并一张卡，分隔线隔开） | 一段话（≤ 3 句最佳） | 1–3 句 |

三个模式**互不干扰**：各自的 prompt、输出的 JSON、卡片排版都不一样。共用的是「导出选区 → 调 API → 画卡片」这条管道。

---

## 2. 模式切换怎么做（这是 v2 的重点）

**入口一：选中元素后浮出的 `✨` 按钮**（最顺手）
选中手写 → 笔迹上方冒出小图标 → 点开是一个三项菜单：

```
┌──────────────────────────────┐
│ 🔤  词缀与释义      Mod+Alt+1 │
│ 📝  语法批改        Mod+Alt+2 │
│ 🌉  中译英          Mod+Alt+3 │
│ ─────────────────────────────│
│ ⚙  记住这个模式作为默认        │
└──────────────────────────────┘
```
（`ea.registerElementActionProvider()`，菜单用 Obsidian 原生 `Menu`，图标用 `obsidian.getIcon()`）

**入口二：命令面板三条命令**，可以自己绑快捷键：
- `AI 老师：词缀与释义` / `AI 老师：语法批改` / `AI 老师：中译英`

**入口三：Ribbon 图标** → 打开同样的三项菜单，给画布当前选区用。

**入口四：重复上一次** —— `Mod+Shift+E` 直接用「上次用的模式」重跑当前选区。连续批改时不用每次选。

**规则**
- 上次用过的模式记在 `data.json.lastMode`，下次打开菜单默认高亮它。
- 模式写进卡片的 `customData.coach.mode` 和卡片标题 emoji，**一眼看出这张卡是哪个模式出的**。
- 同一个选区换了模式重跑 → **替换原卡片**（按 `src` 反查），不会叠成两张。
- 模式不自动猜。但📝 模式里如果检测到整段几乎全是中文，卡片顶部加一行提示：`这段像中文，点这里切到「中译英」`（一键重跑，不打断当前操作）。

**框选的两个细节**
1. Excalidraw 要**完整框住笔迹**才会选中。第一次用建议在设置里开「选区外扩」（默认开）：把 bbox 与选区相交的 `freedraw` 全部并进来，避免漏笔画导致识别缺字。
2. 选区里全是**打字**的 `text` 元素时，直接读字符串，**不发图、不花 token、零识别误差**——三个模式都享受这个快路径。

---

## 3. 已经验证过的技术底牌（不用再怀疑的部分）

| 事实 | 对方案的意义 |
| --- | --- |
| `deepseek-flash` 支持图片输入（OpenAI 兼容 `image_url` + base64 data URL），图片只能放 `user` 消息，单图 token 上限 **1024**、请求体 ≤48MiB | **不需要单独做 OCR**：一张图 + 一段 prompt 就能一次完成「识字 + 分析」。成本封顶，三模式都走这条路 |
| Excalidraw 插件暴露全局 `window.ExcalidrawAutomate`：`getViewSelectedElements` / `getBoundingBox` / `createViewPNG({elementsOverride, exportArea})` / `addRect` / `addText` / `addToGroup` / `addAppendUpdateCustomData` / `addElementsToView` / `registerElementActionProvider` | 导出选区、画卡片、加工具条按钮**全是官方 API**，不改 Excalidraw 源码、不模拟鼠标 |
| Obsidian `requestUrl` 走主进程，无 CORS | 直接打 `api.deepseek.com`，不用代理 |
| 已有工程 `lingua-cards` 采用「`node dev/build.mjs` 纯拼接、零 npm 依赖」 | 直接复用这套构建，改完 1 秒出包，不联网装包 |

（`createViewPNG` 的 `scale` / 白底字段名文档没写全，**M0 第一件事就是实测它**。）

---

## 4. 三份 JSON 契约（模型必须原样返回）

统一外壳：`{mode, transcript[], ...payload}`。`mode` 用来校验「模型没答错模式」，对不上就重试一次。

### 4.1 🔤 词缀与释义

```json
{
  "mode": "word",
  "transcript": [{"line": "ubiquitous", "confidence": 0.96}],
  "words": [
    {
      "headword": "ubiquitous",
      "phonetic_us": "/juːˈbɪkwɪtəs/",
      "phonetic_uk": "/juːˈbɪkwɪtəs/",
      "pos": "adj.",
      "cn": "无处不在的；普遍存在的",
      "affix": {
        "prefix": [],
        "root":   [{"part": "ubi", "meaning": "拉丁语 where（哪里）"},
                   {"part": "que", "meaning": "every / any（每一）"}],
        "suffix": [{"part": "-ous", "meaning": "形容词后缀：具有…性质的"}],
        "split": "ubi(where) + que(every) + -ous(adj.)",
        "note_zh": "字面是「在每一个地方的」，所以引申为「无处不在的」。"
      },
      "family": [
        {"word": "ubiquity", "pos": "n.", "cn": "普遍存在"},
        {"word": "ubiquitously", "pos": "adv.", "cn": "无处不在地"}
      ],
      "example": {"en": "Smartphones have become ubiquitous.", "zh": "智能手机已经无处不在。"},
      "collocation": ["ubiquitous computing", "become ubiquitous", "virtually ubiquitous"],
      "memory_zh": "ubi=哪里，que=每一个，-ous=形容词 → 每个地方都有 → 无处不在的。"
    }
  ],
  "unclear": ["右下角那个模糊的单词没认出来"]
}
```

硬规则（写进 system）：
- **必须拆词缀**。哪怕这个词没有前缀（`prefix: []`），也要给出 `root` 与 `suffix`，`split` 用 `+` 连接；实在拆不动就写 `split: "不可拆分（基础词）"`，**不许编造词源**。
- `family` 给 1–3 个**真实存在**的同根词；给不出就空数组，不许瞎造。
- 一次认出多个词 → `words` 数组（≤8 个），按画布上从上到下、从左到右排序。
- 保留原始拼写；拼错的手写单词在 `headword` 里保留原样，另给 `correct_spelling` 字段（可选）。

### 4.2 📝 语法批改

```json
{
  "mode": "grammar",
  "transcript": [{"line": "I has a apple yesterday, and go to school.", "confidence": 0.93, "uncertain": ["apple"]}],
  "detected_language": "en",
  "rewrite": "I had an apple yesterday and went to school.",
  "translation_zh": "我昨天吃了个苹果，然后去了学校。",
  "corrections": [
    {"original": "I has", "corrected": "I had", "type": "tense",
     "rule": "一般过去时", "why_zh": "yesterday 指明过去；主语 I 用 had，has 只用于第三人称单数。", "level": "A2"},
    {"original": "a apple", "corrected": "an apple", "type": "article",
     "rule": "不定冠词 a/an", "why_zh": "apple 以元音音素 /æ/ 开头，用 an。", "level": "A1"},
    {"original": "go", "corrected": "went", "type": "tense",
     "rule": "并列句时态一致", "why_zh": "and 连接的两个动作都发生在昨天，都用过去式。", "level": "A2"}
  ],
  "praise_zh": "句子主干清楚，知道用 and 连接两个动作。",
  "score": {"grammar": 72, "vocab": 82, "naturalness": 75},
  "summary_zh": "主要问题集中在「过去时」和「冠词」两处。",
  "next_step_zh": "复习不规则动词 have/has → had、go → went。"
}
```

硬规则：
- **先逐行转录，保留原始错误**（不许边转录边改）——否则批改就看不见问题了。
- `type` 只能取：`tense | agreement | article | preposition | sentence-structure | word-form | collocation | word-order | spelling | punctuation | chinglish`。
- 没有错误时：`corrections: []`，`rewrite` 与原句相同，`praise_zh` 写一句肯定，`score.grammar ≥ 90`。
- `why_zh` 必须点出「规则名 + 为什么是这个词」，不能只说「这样更自然」。
- 按用户水平（A2/B1/B2）控制讲解深度。

### 4.3 🌉 中译英

```json
{
  "mode": "translate",
  "transcript": [{"line": "这个方案在成本上不可行", "confidence": 0.97}],
  "versions": [
    {"label": "自然版", "en": "This approach is not feasible in terms of cost.", "note_zh": "书面口语都稳，最推荐"},
    {"label": "直译",   "en": "This plan is unworkable on cost.", "note_zh": "能看懂，但介词不对"},
    {"label": "进阶",   "en": "Cost makes this approach a non-starter.", "note_zh": "很 native，适合写作/口语炫技"}
  ],
  "key_structures": [
    {"en": "in terms of", "function": "表示「在…方面」", "example": "in terms of quality"}
  ],
  "vocab": [
    {"word": "feasible", "phonetic": "/ˈfiːzəbl/", "pos": "adj.", "cn": "可行的", "hint_zh": "反义 impractical"}
  ],
  "pitfall_zh": "别写 in the cost；也不要说 cost is not feasible——是「方案」不可行，不是「成本」不可行。"
}
```

硬规则：
- **必须给 3 个版本**（自然版 / 直译 / 进阶），`label` 用中文。
- `key_structures` 抓 1–2 个可复用句型，别把整句塞进去。
- `pitfall_zh` 指一个「中文母语者最容易写错的地方」，写具体。
- 如果框选的内容其实是英文 → 不改模式、不硬翻：`versions` 返回一遍英→中相反方向的对照，并在 `pitfall_zh` 里说明「这是英文，建议用📝」。

---

## 5. 卡片长什么样（三套模板，共用底板）

底板统一：宽 440、内边距 16、圆角矩形、`#f8f9fa` 底 + `#dee2e6` 描边、`roughness: 0`、整组一个 group（可整块拖走/删除）、放在笔迹右侧 80px（右侧被占则下方）。

```
🔤 词缀与释义                                        📝 语法批改 · 72分
──────────────────────────────                       ──────────────────────────────
ubiquitous  adj.  /juːˈbɪkwɪtəs/                    原文   I has a apple yesterday,
无处不在的；普遍存在的                                        and go to school.        ← 灰
                                                     改写   I had an apple yesterday
词缀  ubi(where) + que(every) + -ous(adj.)                  and went to school.      ← 绿
      ubi = 哪里   que = 每一个                       问题   ① has → had  过去时
      -ous = 形容词后缀「具有…性质的」                        ② a → an     元音前用 an
      字面「在每一个地方的」→ 无处不在的                      ③ go → went  时态一致  ← 红
                                                     中文   我昨天吃了个苹果，
同根  ubiquity n. 普遍存在                                 然后去了学校。
      ubiquitously adv. 无处不在地                    点评   句子主干清楚，
例句  Smartphones have become                             知道用 and 连接两个动作。
      ubiquitous.                                    下一步 复习 have/has → had
      智能手机已经无处不在。                                   go → went
搭配  ubiquitous computing                            
      become ubiquitous                              ─────────────────────
记忆  ubi=哪，que=每，-ous=形容词                     🌉 中译英
      → 每个地方都有 → 无处不在的                      原文   这个方案在成本上不可行
                                                  自然版 This approach is not feasible
┌─（多词时用一条横线分隔，最多 8 个）─┐                     in terms of cost.
│ 🔤 第二个词 …                     │                 直译   This plan is unworkable on
└──────────────────────────────────┘                        cost.        ← 灰、更小
                                                  进阶   Cost makes this approach a
                                                         non-starter.
                                                  句型   in terms of  在…方面
                                                  生词   feasible adj. 可行的
                                                  避坑   别说 in the cost；是「方案」
                                                        不可行，不是「成本」不可行
```

配色：标题 `#1c1c1c` 20px｜原文 `#868e96` 16px｜改写/答案 `#2f9e44` 17px｜错误 `#e03131` 15px｜正文 `#495057` 15px｜小字注 `#adb5bd` 14px。

---

## 6. 架构与数据流

```
框选 ──► getViewSelectedElements() ──► 选区外扩（可选）──► 全 text? ──是──► 直读字符串
                                              │否
                                              ▼
                          createViewPNG({elementsOverride:选区, exportArea:bbox, 白底, scale:2})
                                              │
                                              ▼ PNG Blob → base64
                          ① 模式（菜单/命令/记忆）──► ② prompt = MODES[mode].build(输入, 设置)
                                              │
                          ③ hash(png|text + mode + promptVer + level) ──命中──► 复用旧结果
                                              │未命中
                                              ▼
                          requestUrl → api.deepseek.com/chat/completions
                            system: 模式人设 + 该模式 JSON schema + 水平
                            user:   [图片] + 该模式的补足说明
                                              │
                                              ▼ response_format: json_object
                          ④ 校验 mode 字段 → parseJsonLoose（去围栏/补引号/截取 {}）
                                              │
                                              ▼
                          ⑤ MODES[mode].render(result) → blocks[]（纯函数，可单测）
                                              │
                          ⑥ layoutBlocks(blocks, 宽度) → 每行的 x/y/字号/颜色
                                              │
                          ⑦ addRect + addText×N + addToGroup + customData{coach:{mode,src,hash}}
                                              │
                                              ▼
                          addElementsToView(false, save=true, onTop=true) → 卡片出现在笔迹右侧
```

**为什么模式要"注册表"化**：三个模式 = 三份 `build(prompt)` + 三份 `render(result→blocks)`。加第四个模式（比如「润色」）只要加一个文件 + 一条菜单项，管道一行不改。

---

## 7. 目录结构

```
ai-english-help/
  manifest.json                 # id: ai-english-help, isDesktopOnly: true
  styles.css
  main.js                       # 构建产物
  src/
    main.js                     # 入口：命令×3、ribbon、✨工具条菜单、设置页
    settings.js                 # 默认值 + Setting 面板
    registry.js                 # MODES 注册表（id/label/icon/cmd/build/render）
    modes/
      word.js                   # 🔤 prompt + render→blocks
      grammar.js                # 📝 prompt + render→blocks
      translate.js              # 🌉 prompt + render→blocks
    engine.js                   # 取选区 → 导 PNG → 调 API → 缓存 → 返回结果
    ea.js                       # EA 封装：getEA / 选区外扩 / 导出 PNG / blob→base64
    deepseek.js                 # 请求、超时重试、parseJsonLoose、错误人话化
    layout.js                   # blocks → 带坐标的行模型（纯函数，注入 measure）
    render.js                   # 行模型 → Excalidraw 元素（底板/分组/幂等替换）
    promptkit.js                # 共用的 system 前缀、水平描述、schema 信封
  dev/
    build.mjs                   # src/*.js 拼接成 main.js（零依赖）
    test.mjs                    # layout/prompt/JSON 修复/哈希/registry 单测
    smoke.mjs                   # 假 obsidian 加载 main.js
    fixtures/{word,grammar,translate}.json  # 录制的真实响应，离线测排版
  PLAN.md
```

---

## 8. 关键代码骨架

### 8.1 模式注册表（`src/registry.js`）

```js
import { wordMode } from "./modes/word.js";
import { grammarMode } from "./modes/grammar.js";
import { translateMode } from "./modes/translate.js";

export const MODES = { word: wordMode, grammar: grammarMode, translate: translateMode };  // key = 模式 id
export const MODE_ORDER = [wordMode, grammarMode, translateMode];                        // 菜单顺序

// 每个 mode 的形状：
// { id, label, icon, cmd, hotkeyHint, emoji, defaultTemp,
//   build(input, settings) -> {system, userText},
//   render(result, settings) -> blocks[] }
```

### 8.2 一个模式长这样（`src/modes/word.js` 节选）

```js
export const word = {
  id: "word", label: "词缀与释义", icon: "spell-check", emoji: "🔤",
  cmd: "analyze-word", hotkeyHint: "Mod+Alt+1", defaultTemp: 0.3,

  build({ text, settings }) {
    return {
      system: SYSTEM_BASE + `
你是词汇老师。识别图中的单词（手写或打字），逐词输出 JSON，字段：
{"mode":"word","transcript":[{"line":"","confidence":0}],
 "words":[{"headword":"","phonetic_us":"","phonetic_uk":"","pos":"","cn":"",
   "affix":{"prefix":[{"part":"","meaning":""}],"root":[],"suffix":[],
            "split":"","note_zh":""},
   "family":[{"word":"","pos":"","cn":""}],
   "example":{"en":"","zh":""},"collocation":[],"memory_zh":""}],
 "unclear":[]}
要求：必须拆词缀，拆不动写"不可拆分（基础词）"，不许编造词源；
family 只给真实存在的同根词，给不出就空数组；最多 8 个词，按画布上从上到下排序。
只输出 JSON。`,
      userText: text ? `这是用户画布上打的字：\n${text}` : `用户水平：${settings.userLevel}。请识别并拆解图中所有单词。`,
    };
  },

  render(r, s) {
    const blocks = [{ kind: "title", text: `🔤 词缀与释义` }];
    for (const [i, w] of (r.words || []).entries()) {
      if (i) blocks.push({ kind: "divider" });
      blocks.push({ kind: "head", text: `${w.headword}  ${w.pos}  ${w.phonetic_us}` });
      blocks.push({ kind: "body", text: w.cn, color: "answer" });
      blocks.push({ kind: "label", text: "词缀" });
      blocks.push({ kind: "body", text: w.affix?.split || "" });
      for (const p of w.affix?.root || []) blocks.push({ kind: "small", text: `${p.part} = ${p.meaning}` });
      if (w.affix?.note_zh) blocks.push({ kind: "small", text: w.affix.note_zh });
      if (w.family?.length) {
        blocks.push({ kind: "label", text: "同根" });
        for (const f of w.family) blocks.push({ kind: "small", text: `${f.word} ${f.pos} ${f.cn}` });
      }
      if (w.example?.en) { blocks.push({ kind: "label", text: "例句" }); blocks.push({ kind: "body", text: w.example.en }); blocks.push({ kind: "small", text: w.example.zh }); }
      if (w.collocation?.length) { blocks.push({ kind: "label", text: "搭配" }); blocks.push({ kind: "small", text: w.collocation.join(" / ") }); }
      if (w.memory_zh) blocks.push({ kind: "small", text: `记忆 ${w.memory_zh}` });
    }
    return blocks;
  },
};
```

### 8.3 导出选区（`src/ea.js`，含选区外扩）

```js
export function getEA() {
  const ea = window.ExcalidrawAutomate;
  if (!ea) throw new Error("没检测到 Excalidraw 插件");
  ea.reset();
  ea.setView("active");
  return ea;
}

export function expandSelection(ea, sel, enabled) {          // 选区外扩：把相交的笔迹并进来
  if (!enabled || !sel.length) return sel;
  const bb = ea.getBoundingBox(sel);
  const pad = 12;
  return ea.getViewElements().filter(el => {
    if (el.isDeleted) return false;
    const b = ea.getBoundingBox([el]);
    return b.topX < bb.topX + bb.width + pad && b.topX + b.width > bb.topX - pad &&
           b.topY < bb.topY + bb.height + pad && b.topY + b.height > bb.topY - pad;
  });
}

export async function selectionToInput(ea, sel) {
  if (!sel.length) throw new Error("先框选要处理的内容");
  if (sel.every(el => el.type === "text")) {
    return { text: sel.map(el => el.text).join("\n"), png: null };   // 快路径：不花 token
  }
  const bb = ea.getBoundingBox(sel);
  const blob = await ea.createViewPNG({
    elementsOverride: sel,
    exportArea: { x: bb.topX, y: bb.topY, width: bb.width, height: bb.height },
    scale: 2,                                                        // ← M0 验证字段名
  });
  return { text: null, png: await blobToBase64(blob), bbox: bb };
}

async function blobToBase64(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
```

> 兜底：`createViewPNG` 不存在时 → `ea.copyViewElementsToEAforEditing(sel)` + `ea.createPNG(null, 2, ea.getExportSettings(true, false))`；再用 `ea.verifyMinimumPluginVersion()` 早期提示。

### 8.4 调模型 + 校验模式 + 解析（`src/deepseek.js`）

```js
export async function ask({ settings, system, userText, png, temperature }) {
  const content = [{ type: "text", text: userText }];
  if (png) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png}` } });

  const res = await requestUrl({
    url: `${settings.baseUrl}/chat/completions`,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "system", content: system }, { role: "user", content }],
      response_format: { type: "json_object" },      // 提示词里必须出现 "JSON" 字样
      temperature: temperature ?? 0.2,
      max_tokens: 2000,
    }),
    throw: false,
  });
  if (res.status !== 200) throw new Error(humanizeError(res));
  return { json: parseJsonLoose(res.json.choices[0].message.content), usage: res.json.usage };
}

// 模式串台检测：返回的 mode 不等于要的模式 → 重试一次，再不对就按"降级纯文本卡片"处理
export function assertMode(json, expected) {
  if (json?.mode && json.mode !== expected) throw new Error(`模式串了：期望 ${expected}，返回 ${json.mode}`);
  return json;
}
```

### 8.5 画卡片 + 幂等（`src/render.js`）

```js
export async function renderCard(ea, bb, blocks, settings, meta) {
  const model = layoutBlocks(blocks, settings.cardWidth, t => ea.measureText(t));
  const x = bb.topX + bb.width + 80, y = bb.topY;

  // ① 幂等：先删掉同一批源元素生成的旧卡片
  const old = ea.getViewElements().filter(el =>
    el.customData?.coach && meta.src.some(id => el.customData.coach.src.includes(id)));
  old.forEach(el => { ea.getElement(el.id).isDeleted = true; });

  ea.clear();
  Object.assign(ea.style, {
    roughness: 0, strokeWidth: 1, fillStyle: "solid",
    backgroundColor: "#f8f9fa", strokeColor: "#dee2e6", fontFamily: 2,
  });
  const boxId = ea.addRect(x, y, model.width, model.height);

  let cy = y + model.pad;
  const ids = [];
  for (const row of model.rows) {
    if (row.kind === "divider") { ea.addLine([[x + 16, cy], [x + model.width - 16, cy]]); cy += 12; continue; }
    ea.style.fontSize = row.size;
    const id = ea.addText(x + model.pad, cy, row.text, { width: model.width - model.pad * 2 });
    ea.getElement(id).strokeColor = row.color;
    ids.push(id); cy += row.height + model.gap;
  }

  ea.addToGroup([boxId, ...ids]);
  for (const id of [boxId, ...ids]) ea.addAppendUpdateCustomData(id, { coach: meta });
  await ea.addElementsToView(false, true, true);
  ea.selectElementsInView([boxId, ...ids]);
}
```

---

## 9. 设置项

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| API Key | 空 | 存 `data.json`；`DEEPSEEK_API_KEY` 环境变量优先 |
| Base URL / 模型 | `https://api.deepseek.com` / `deepseek-flash` | 可换中转 |
| 默认模式 | 📝 语法批改 | 菜单默认高亮项，也决定 `Mod+Shift+E` 走哪个 |
| 我的水平 | A2 | A2 / B1 / B2，影响讲解深度 |
| 卡片宽度 | 440 | 360 / 440 / 520 |
| 卡片位置 | 右侧 | 右侧 / 下方 / 光标处 |
| 选区外扩 | 开 | 把相交笔迹并进来，防漏笔画 |
| 🔤 英美音标 | 都显示 | 或只显示美音 |
| 🔤 同根词族 | 显示 | 关掉卡片更短 |
| 📝 显示分数 | 开 | 关掉只留批改 |
| 🌉 版本数 | 3 | 2 或 3 个英文版本 |
| 发送前确认 | 关 | 打开后每次先问「即将发送 1 张手写图」 |
| 本地缓存 | 开 | 同图同模式不再计费 |
| 自动归档 | 关 | 追加到 `英语学习/Coach/YYYY-MM-DD.md`，为接 `lingua-cards` 复习留数据 |

**成本量级**：图片 token 封顶 1024，输出 300–1500，单次约 1.5–3k tokens；词缀模式最便宜。以官网定价为准（本次抓取定价页跳到了首页，没拿到最新数字，需以官网为准）。

---

## 10. 里程碑（约 4.5 天）

### M0 · 三份 prompt 先做个"实验室"（0.5 天）
不写插件，用 Excalidraw 脚本引擎（附录 A）跑：**三种模式 × 各 3 个手写样本**。
- [ ] `createViewPNG` 导出的手写清晰度、字段名对不对
- [ ] 手写单词/句子识别率（目标：单词 ≥95%，短句 ≥85%）
- [ ] 🔤 词缀拆分是否靠谱（有没有瞎编词源）、📝 错误是否漏、🌉 三个版本是否都对
- [ ] JSON 合法率（目标是 100%，`json_object` 模式下应该很稳）
- 验收：3 张实测截图 + 三份 JSON + 耗时/token 记录。**不达标就换方案，不往下走。**

### M1 · 框架 + 📝 语法批改（1.5 天）
先做最复杂的那个，因为它有「分数 + 多条错误 + 三段文本」，排版压力最大。
- [ ] 插件骨架、设置页、命令×3、`✨` 工具条三项菜单
- [ ] 选区 → PNG → API → 卡片，全链路通；占位卡片「⏳ 批改中…」→ 结果替换
- [ ] 错误人话化：无 key / 无选区 / 无 Excalidraw / 余额不足 / 超时
- [ ] 打字选区走直读，不发图

### M2 · 🔤 词缀与释义（1 天）
- [ ] 多词合并卡片 + 分隔线 + 最多 8 词的堆叠排版
- [ ] 词缀三级展示（前缀/词根/后缀 + 中文义 + 一句话词源）
- [ ] 同根词族、搭配、记忆法分行；关掉个别模块时高度自适应

### M3 · 🌉 中译英 + 模式切换体验（1 天）
- [ ] 三版本对照（自然版突出、直译变灰缩小）
- [ ] 关键句型、生词、避坑三块
- [ ] 上次模式记忆、同选区换模式=替换卡片、📝 检测到中文时的「一键切换」提示

### M4 · 留存与打磨（0.5–1 天）
- [ ] 本地缓存命中、手动归档到 Markdown、`customData` 溯源
- [ ] 深浅主题适配、卡片样式微调
- [ ] README（装法、key、快捷键、隐私说明）
- [ ] 打包到 `.obsidian/plugins/ai-english-help/`，重载插件即可生效

---

## 11. 测试方案

| 层 | 内容 |
| --- | --- |
| 纯函数单测 `dev/test.mjs` | 三个模式的 `render(JSON)→blocks`（fixtures 里录的三份真实响应）；`layoutBlocks` 的中英混排宽度/折行/分隔线高度；`parseJsonLoose` 六种坏输入；`assertMode`；hash 稳定性；没错误的句子 → `corrections: []` 时卡片不塌成空框 |
| 离线链路 | fixtures → blocks → 元素数组，断言元素数量/颜色/分组/`customData.mode` |
| 冒烟 `dev/smoke.mjs` | 假 `obsidian` 加载 `main.js`，验证 3 条命令 + 1 个 ribbon + 1 个 action provider 都注册了 |
| 真机 | 在 Obsidian 中各模式各执行 5 次，检查：中文显示、卡片不遮挡笔迹、同选区换模式时正确替换 |

---

## 12. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
| --- | --- | --- | --- |
| 视觉模型认错手写 → 三个模式全错 | 中 | 高 | 卡片头永远显示「我看到的原文」；`confidence`/`unclear` 标出来；打字选区走直读零误差；写大一点 |
| 🔤 模型**编造词源**（很常见） | 高 | 中 | prompt 里明令「拆不动就写不可拆分，不许编」；卡片上对 `note_zh` 标注「AI 推测」字样；设置里可关掉词源只留词义 |
| 🌉 三版本其实差不多 | 中 | 低 | prompt 限定：直译必须贴原句结构、进阶必须换句式（从句/名词化/习语）；`note_zh` 必须说清差异 |
| `createViewPNG` 字段/版本差异 | 中 | 中 | M0 实测 + `createPNG` 兜底 + 版本检查 |
| 卡片遮挡画布 | 中 | 中 | 位置避让 + 设置项 + 整组可拖 |
| 中文在 Excalidraw 显示成方块 | 低 | 中 | M0 验一下；设置项可换字体族；兜底中文走图片元素 |
| 成本/隐私 | 低 | 中 | 只发选区、本地缓存、发送前确认开关、README 写明 |
| 移动端手势冲突 | 低 | 低 | `isDesktopOnly: true` 先保桌面 |

**备选识别方案**（M0 不达标才启用）：Excalidraw 自带 OCR（Taskbone）先转文字 → DeepSeek 纯文本；或腾讯/百度手写体 OCR（另配 key）；或"识别后固化成 text 元素，以后都走直读"。

---

## 13. 与初始计划的差异

实现阶段相对本文的调整：

1. **翻译扩展为双向**。原计划只有中译英，实际实现为「母语 → 目标语言 / 目标语言 → 母语」，方向在悬浮窗上切换，不再出现在设置页。
2. **新增画布悬浮窗**。原计划仅有元素工具条与快捷键，实际增加常驻浮动条（模式按钮 + 方向切换 + 设置入口）。
3. **新增界面语言**。原计划只有母语与学习语言两条线，实际拆出独立的界面语言，与提示词语言解耦。
4. **「取词」并入词缀模式**。曾单独规划取词面板，实现后取消独立入口，改为「文本编辑状态下，选中内容即为处理输入」。
5. **插件更名**。`excalidraw-coach` → `ai-english-help`，目录、`manifest.json` 中的 id 与显示名均已同步。
6. **深思模式默认关闭**。实测简单句下开启推理会导致同一错误被拆成多条，且耗时增加约 2.6 倍。

---

## 附录 A · M0 实验室脚本（Excalidraw Script Engine，单文件）

框选手写 → 运行脚本 → 用菜单选模式 → 结果以纯文本贴到画布下方，用于对比三份提示词的输出质量。

```javascript
// ==AI Coach Lab==
const KEY = "sk-...";                 // 临时填
const MODEL = "deepseek-flash";

const SYSTEM = `你是英语老师。需要时识别图中手写内容，先逐行转录（保留原始拼写错误）。
只输出 JSON，不要任何解释文字。`;

const PROMPTS = {
  "🔤 词缀与释义": `识别图中所有单词，输出 JSON：
{"mode":"word","transcript":[{"line":"","confidence":0}],
 "words":[{"headword":"","phonetic_us":"","pos":"","cn":"",
  "affix":{"prefix":[],"root":[{"part":"","meaning":""}],"suffix":[],"split":"","note_zh":""},
  "family":[{"word":"","pos":"","cn":""}],"example":{"en":"","zh":""},
  "collocation":[],"memory_zh":""}],"unclear":[]}
必须拆词缀；拆不动写"不可拆分（基础词）"，不许编造词源；family 只给真实同根词。`,

  "📝 语法批改": `批改图中英文。先逐行转录，保留原始错误，不要边转录边改。输出 JSON：
{"mode":"grammar","transcript":[{"line":"","confidence":0,"uncertain":[]}],
 "detected_language":"en","rewrite":"","translation_zh":"",
 "corrections":[{"original":"","corrected":"","type":"tense|agreement|article|preposition|sentence-structure|word-form|collocation|word-order|spelling|punctuation|chinglish","rule":"","why_zh":"","level":""}],
 "praise_zh":"","score":{"grammar":0,"vocab":0,"naturalness":0},
 "summary_zh":"","next_step_zh":""}
why_zh 必须点出规则名和原因，不能只说"更自然"。`,

  "🌉 中译英": `把图中中文译成英文。输出 JSON：
{"mode":"translate","transcript":[{"line":"","confidence":0}],
 "versions":[{"label":"自然版","en":"","note_zh":""},{"label":"直译","en":"","note_zh":""},{"label":"进阶","en":"","note_zh":""}],
 "key_structures":[{"en":"","function":"","example":""}],
 "vocab":[{"word":"","phonetic":"","pos":"","cn":"","hint_zh":""}],
 "pitfall_zh":""}
必须给 3 个版本，直译要贴中文结构，进阶要换句式；pitfall_zh 写具体的中式英语坑。`,
};

const names = Object.keys(PROMPTS);
const mode = await utils.suggester(names, names, "选一个模式");
if (!mode) return;

const sel = ea.getViewSelectedElements();
if (!sel.length) { new ea.obsidian.Notice("先框选内容"); return; }

let b64 = null, plain = null;
if (sel.every(el => el.type === "text")) {
  plain = sel.map(el => el.text).join("\n");
} else {
  const bb = ea.getBoundingBox(sel);
  const blob = await ea.createViewPNG({
    elementsOverride: sel,
    exportArea: { x: bb.topX, y: bb.topY, width: bb.width, height: bb.height },
  });
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  b64 = btoa(s);
}

const userText = plain ? `用户画布上的文字：\n${plain}` : "请按要求处理图中的手写内容。";
const content = [{ type: "text", text: userText }];
if (b64) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } });

const t0 = Date.now();
const res = await ea.obsidian.requestUrl({
  url: "https://api.deepseek.com/chat/completions",
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM + "\n" + PROMPTS[mode] }, { role: "user", content }],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 2000,
  }),
  throw: false,
});
const dt = Date.now() - t0;
const txt = res.status === 200 ? res.json.choices[0].message.content : `HTTP ${res.status}: ${res.text}`;
console.log(mode, dt + "ms", res.json?.usage);

ea.style.fontSize = 14;
ea.addText(sel[0].x, sel[0].y + (sel[0].height || 100) + 40,
  `【${mode}】${dt}ms\n${txt}`, { width: 700 });
await ea.addElementsToView(false, true, true);
```

> 每组样本记三件事：**对不对、`usage` 的 token 数、耗时**。这三项直接决定 M1 的参数（`scale` 取多少、要不要限制成 8 词、`max_tokens` 给到多少）。
