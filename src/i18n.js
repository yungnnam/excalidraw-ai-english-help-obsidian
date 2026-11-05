// 语言包：界面文字跟着「母语」走，学习语言只影响内容语言
//
// 约定：
//   nativeLang —— 母语，讲解、点评、规则说明都用它；插件画出来的卡片标签也用它
//   learnLang  —— 正在学的语言，例句、改写、译文都是它
//   translatePair() —— 翻译模式的方向：母语→学习语言（默认）或反过来

export const LANGS = {
  zh: { code: "zh", zh: "中文", en: "Chinese", shortZh: "中", shortEn: "ZH" },
  en: { code: "en", zh: "英文", en: "English", shortZh: "英", shortEn: "EN" },
};

// 界面语言：uiLang 没设就跟着母语走（老用户升级后看不出任何变化）
export function resolveUiLang(settings) {
  const s = settings || {};
  if (s.uiLang === 'zh' || s.uiLang === 'en') return s.uiLang;
  return normalizeLang(s.nativeLang);
}

export function normalizeLang(code) {
  return code === "en" ? "en" : "zh";
}

export function langLabel(code) {
  const l = LANGS[normalizeLang(code)];
  return code === "en" ? "English（英语）" : "中文（Chinese）";
}

export function langName(code, native) {
  const l = LANGS[normalizeLang(code)];
  return normalizeLang(native) === "en" ? l.en : l.zh;
}

// 翻译方向：默认母语 → 学习语言；reverse 就是学习语言 → 母语
export function translatePair(settings) {
  const s = settings || {};
  const native = normalizeLang(s.nativeLang);
  const learn = normalizeLang(s.learnLang);
  if (s.translateDirection === "reverse") return { from: learn, to: native };
  return { from: native, to: learn };
}

// 翻译模式的名字：「中译英」「英译中」，英文界面则是 Chinese → English
export function translateLabel(settings) {
  const { from, to } = translatePair(settings);
  if (resolveUiLang(settings) === "en") {
    return LANGS[from].en + " → " + LANGS[to].en;
  }
  return LANGS[from].shortZh + "译" + LANGS[to].shortZh;
}

const STRINGS = {
  zh: {
    modeWord: "词缀与释义",
    modeGrammar: "语法批改",
    shortWord: "词缀",
    shortGrammar: "批改",
    seen: "我看到的原文",
    original: "原文",
    rewrite: "改写",
    issues: "问题 {n} 处",
    praise: "点评",
    nextStep: "下一步",
    meaning: "意思",
    noErrors: "✅ 没发现明显语法错误",
    wrongLang: "这段看着不是{learn}，建议用「{mode}」",
    affix: "词缀",
    prefix: "前缀",
    root: "词根",
    suffix: "后缀",
    family: "同根",
    example: "例句",
    collocation: "搭配",
    memory: "记忆",
    spelling: "拼写应为 {v}",
    uk: "英",
    wordFooter: "词源拆解由 AI 推测，标了「不确定」的以词典为准",
    nothing: "没认出单词。写大一点，或者一个词一个词地框选再试。",
    unclear: "⚠ 没认出来：{v}",
    natural: "自然版",
    literal: "直译",
    advanced: "进阶",
    version: "译法",
    structures: "句型",
    vocab: "生词",
    pitfall: "避坑",
    eg: "例",
    ph1: "⏳ 正在看你的手写…",
    ph2: "（识别 + 组织答案，通常 3–8 秒）",
    errTitle: "⚠️ 没跑通",
    errHint: "修好后再框选一次，或者换个模式重跑。",
    noSelection: "先框选要处理的内容：在画布空白处拖个框，把手写整个包进去",
    gear: "⚙ 设置",
    flipTitle: "切换翻译方向（中译英 ⇄ 英译中）",
    flipToast: "现在翻：{pair}",
    gearTitle: "设置（跳转到插件设置页）",
    drag: "按住拖动",
    ribbonTip: "打开设置",
    cmdRepeat: "用上次的模式运行",
    cmdSettings: "打开设置",
    cmdToggleBar: "显示 / 隐藏悬浮窗",
    cmdForceBar: "显示悬浮窗（找不到时点这个）",
    // ---- 设置页 ----
    secLanguage: "语言",
    secMode: "模式",
    secCard: "卡片",
    secBehavior: "行为",
    setUiLang: "界面语言",
    descUiLang: "这个设置页、悬浮窗上的按钮、各种提示消息用哪门语言。默认跟着母语走。",
    optFollow: "跟随母语",
    setApiKey: "DeepSeek API Key",
    descApiKey: "粘在这里就行，改完立刻生效；也可以用环境变量 DEEPSEEK_API_KEY（优先于这里）。",
    setBaseUrl: "Base URL",
    descBaseUrl: "换中转服务时改这里",
    setModel: "模型",
    descModel: "手写识图用 deepseek-flash",
    setFloatBar: "画布悬浮窗",
    descFloatBar: "在 Excalidraw 画布上常驻三个按钮，选中手写后点一下就处理，不用再翻菜单",
    btnResetPos: "重置位置",
    noticeResetPos: "悬浮窗已回到右下角",
    setDefaultMode: "默认模式",
    descDefaultMode: "「用上次的模式运行」的初始值",
    setNative: "母语",
    descNative: "讲解、点评、卡片标签用这门语言写",
    setLearn: "要学的语言",
    descLearn: "例句、改写、译文用这门语言写；和母语必须不同",
    setLevel: "我的水平",
    descLevel: "影响讲解深度和打分标准，按要学的那门语言算",
    setDeepThink: "深思模式",
    descDeepThink: "让模型先在内部推理再作答：复杂长句更准，但慢 2–3 倍、也更费 token",
    setCardWidth: "卡片宽度",
    descCardWidth: "太窄长句会折很多行",
    optNarrow: "360（窄）",
    optDefault: "440（默认）",
    optWide: "520（宽）",
    setCardPos: "卡片位置",
    descCardPos: "避开已有元素，放不下的位置会自动换",
    optPosRight: "笔迹右侧",
    optPosBelow: "笔迹下方",
    setUk: "显示英式音标",
    descUk: "关掉只显示美音",
    setFamily: "显示同根词族",
    setScore: "显示分数",
    descScore: "关掉只留批改内容",
    setExpand: "选区外扩",
    descExpand: "把和选区相交的笔迹也带进来，防止漏笔画导致缺字",
    setConfirm: "发送前确认",
    descConfirm: "每次弹窗问一下要不要发送这张手写图",
    setCache: "本地缓存",
    descCache: "同一张图 + 同一模式不重复计费",
    btnClear: "清空",
    noticeCleared: "缓存已清空",
    setArchive: "自动归档",
    descArchive: "每次批改追加一行到 Markdown，方便以后做复习",
    appName: "ai-english-help",
    ribbonTitle: "ai-english-help",
    secApi: "连接",
    secModeOptions: "模式选项",
    setClearCache: "清空缓存",
    noticeUnknownMode: "未知模式：{v}",
    noticeCardFail: "卡片画不出来：{v}",
    noticeSettingsPath: "设置 → 第三方插件 → Excalidraw AI 英语老师",
    noticeBarShown: "悬浮窗已打开",
    noticeBarHidden: "悬浮窗已隐藏",
    noticeBarAttached: "悬浮窗已挂到当前画布",
    noticeBarNoView: "当前没有打开 Excalidraw 画布，切到画布再试",
    noticeDefaultMode: "默认模式：{v}",
    confirmTitle: "把这张图发给 DeepSeek？",
    confirmBody: "将发送 {n} 个元素的截图（只含你框选的部分）。",
    btnSend: "发送",
    btnCancel: "取消",    setArchiveFolder: "归档目录",
  },
  en: {
    modeWord: "Word Parts",
    modeGrammar: "Grammar Check",
    shortWord: "Roots",
    shortGrammar: "Check",
    seen: "What I read",
    original: "Original",
    rewrite: "Rewrite",
    issues: "Issues: {n}",
    praise: "Good",
    nextStep: "Next step",
    meaning: "Meaning",
    noErrors: "✅ No obvious grammar errors",
    wrongLang: "This doesn't look like {learn}. Try 「{mode}」 instead.",
    affix: "Word parts",
    prefix: "Prefix",
    root: "Root",
    suffix: "Suffix",
    family: "Same root",
    example: "Example",
    collocation: "Collocations",
    memory: "Memory hook",
    spelling: "Spelling: {v}",
    uk: "UK",
    wordFooter: "Etymology is inferred by AI — check a dictionary when it says it is unsure.",
    nothing: "No words recognised. Write bigger, or select one word at a time.",
    unclear: "⚠ Not recognised: {v}",
    natural: "Natural",
    literal: "Literal",
    advanced: "Advanced",
    version: "Version",
    structures: "Structures",
    vocab: "Vocabulary",
    pitfall: "Watch out",
    eg: "e.g.",
    ph1: "⏳ Reading your handwriting…",
    ph2: "(recognise + compose, usually 3–8s)",
    errTitle: "⚠️ Failed",
    errHint: "Fix the problem and select again, or try another mode.",
    noSelection: "Select something first: drag a box on the canvas around your handwriting.",
    gear: "⚙ Settings",
    flipTitle: "Switch translation direction",
    flipToast: "Now translating: {pair}",
    gearTitle: "Open the plugin settings",
    drag: "Drag to move",
    ribbonTip: "Open settings",
    cmdRepeat: "Run with last mode",
    cmdSettings: "Open settings",
    cmdToggleBar: "Show / hide the floating bar",
    cmdForceBar: "Show the floating bar (if you can't find it)",
    // ---- settings page ----
    secLanguage: "Language",
    secMode: "Modes",
    secCard: "Card",
    secBehavior: "Behaviour",
    setUiLang: "Interface language",
    descUiLang: "Language of this settings page, the floating-bar buttons and every notice. Defaults to your native language.",
    optFollow: "Same as native",
    setApiKey: "DeepSeek API key",
    descApiKey: "Paste it here and it takes effect immediately. The DEEPSEEK_API_KEY environment variable also works and wins over this field.",
    setBaseUrl: "Base URL",
    descBaseUrl: "Change this when you go through a proxy or relay",
    setModel: "Model",
    descModel: "deepseek-flash is the one that reads images",
    setFloatBar: "Canvas floating bar",
    descFloatBar: "Three buttons pinned on the Excalidraw canvas: select your handwriting, click one, done.",
    btnResetPos: "Reset position",
    noticeResetPos: "Floating bar moved back to the corner",
    setDefaultMode: "Default mode",
    descDefaultMode: "Starting value for “run the last mode again”",
    setNative: "Native language",
    descNative: "Explanations, corrections and card labels are written in this language",
    setLearn: "Language to learn",
    descLearn: "Examples, rewrites and translations are written in this language; it must differ from your native one",
    setLevel: "My level",
    descLevel: "Affects how deep the explanation goes and how strict the scoring is (based on the language you learn)",
    setDeepThink: "Thinking mode",
    descDeepThink: "Let the model reason before answering: better on complicated sentences, but 2–3× slower and uses more tokens",
    setCardWidth: "Card width",
    descCardWidth: "Too narrow and long sentences wrap a lot",
    optNarrow: "360 (narrow)",
    optDefault: "440 (default)",
    optWide: "520 (wide)",
    setCardPos: "Card position",
    descCardPos: "Placed next to your ink; it moves by itself when that spot is taken",
    optPosRight: "Right of the ink",
    optPosBelow: "Below the ink",
    setUk: "Show UK phonetic",
    descUk: "Off: US only",
    setFamily: "Show word family",
    setScore: "Show score",
    descScore: "Off: corrections only",
    setExpand: "Expand selection",
    descExpand: "Also grab strokes that touch your selection, so no character gets clipped",
    setConfirm: "Confirm before sending",
    descConfirm: "Ask before every image upload",
    setCache: "Local cache",
    descCache: "Same image + same mode is not charged twice",
    btnClear: "Clear",
    noticeCleared: "Cache cleared",
    setArchive: "Auto archive",
    descArchive: "Append one line per run to a Markdown file, handy for later review",
    appName: "ai-english-help",
    ribbonTitle: "ai-english-help",
    secApi: "Connection",
    secModeOptions: "Mode options",
    setClearCache: "Clear cache",
    noticeUnknownMode: "Unknown mode: {v}",
    noticeCardFail: "Could not draw the card: {v}",
    noticeSettingsPath: "Settings → Community plugins → Excalidraw AI English Coach",
    noticeBarShown: "Floating bar shown",
    noticeBarHidden: "Floating bar hidden",
    noticeBarAttached: "Floating bar attached to this canvas",
    noticeBarNoView: "No Excalidraw canvas is open — switch to one and try again",
    noticeDefaultMode: "Default mode: {v}",
    confirmTitle: "Send this image to DeepSeek?",
    confirmBody: "Sends a screenshot of {n} element(s) — only what you selected.",
    btnSend: "Send",
    btnCancel: "Cancel",    setArchiveFolder: "Archive folder",
  },
};

export function t(key, settings, vars) {
  const pack = STRINGS[resolveUiLang(settings)] || STRINGS.zh;
  let s = pack[key];
  if (s === undefined) s = STRINGS.zh[key];
  if (s === undefined) return key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  }
  return s;
}

// 模式的全名（菜单、命令、卡片标题都用它）
export function modeLabel(mode, settings) {
  if (!mode) return "";
  if (mode.id === "translate") return translateLabel(settings);
  if (mode.id === "word") return t("modeWord", settings);
  if (mode.id === "grammar") return t("modeGrammar", settings);
  return mode.label || mode.id;
}

// 悬浮窗上的短名
export function modeShort(mode, settings) {
  if (!mode) return "";
  if (mode.id === "translate") {
    const { from, to } = translatePair(settings);
    if (resolveUiLang(settings) === "en") {
      return LANGS[from].shortEn + "→" + LANGS[to].shortEn;
    }
    return LANGS[from].shortZh + "译" + LANGS[to].shortZh;
  }
  if (mode.id === "word") return t("shortWord", settings);
  if (mode.id === "grammar") return t("shortGrammar", settings);
  return modeLabel(mode, settings);
}

// 卡片标题：emoji + 全名（批改带分数）
export function cardTitle(mode, settings, score) {
  const name = modeLabel(mode, settings);
  const emoji = mode && mode.emoji ? mode.emoji + " " : "";
  if (mode && mode.id === "grammar" && typeof score === "number" && settings && settings.showScore) {
    return resolveUiLang(settings) === "en"
      ? emoji + name + " · " + score + " pts"
      : emoji + name + " · " + score + "分";
  }
  return emoji + name;
}

// 旧的 JSON 字段名要兼容（缓存里可能还是老结构），取值时两个都认
export function pick(obj, keys, fallback) {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}
