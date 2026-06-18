import { describe, expect, it } from "vitest";

import { buildRubyTokens } from "./pinyinDisplay";

describe("pinyin display helpers", () => {
  it("aligns CJK characters with pinyin while preserving punctuation", () => {
    expect(buildRubyTokens("你好，世界")).toEqual([
      { text: "你", pinyin: "nǐ" },
      { text: "好", pinyin: "hǎo" },
      { text: "，" },
      { text: "世", pinyin: "shì" },
      { text: "界", pinyin: "jiè" }
    ]);
  });

  it("does not add pinyin to latin text", () => {
    expect(buildRubyTokens("hi 你")).toEqual([{ text: "h" }, { text: "i" }, { text: " " }, { text: "你", pinyin: "nǐ" }]);
  });
});
