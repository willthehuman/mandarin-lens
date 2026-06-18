import { pinyin as convertToPinyin } from "pinyin-pro";

import { containsCjk } from "./language";

export interface RubyToken {
  text: string;
  pinyin?: string;
}

export function buildRubyTokens(text: string): RubyToken[] {
  const characters = Array.from(text);
  const pinyinTokens = convertToPinyin(text, { type: "array" });

  return characters.map((character, index) => {
    if (!containsCjk(character)) {
      return { text: character };
    }

    return {
      text: character,
      pinyin: pinyinTokens[index] || convertToPinyin(character)
    };
  });
}
