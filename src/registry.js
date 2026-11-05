// 模式注册表：加新模式只要写一个 modes/xxx.js 再挂到这里
import { wordMode } from "./modes/word.js";
import { grammarMode } from "./modes/grammar.js";
import { translateMode } from "./modes/translate.js";

export const MODE_ORDER = [wordMode, grammarMode, translateMode];

export const MODES = {
  word: wordMode,
  grammar: grammarMode,
  translate: translateMode,
};

export function getMode(id) {
  return MODES[id] || null;
}
