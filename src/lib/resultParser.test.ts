import { describe, expect, it } from "vitest";

import { parseAnalysisResult, parseJsonObject } from "./resultParser";
import type { AnalysisRequest } from "./types";

const textRequest: AnalysisRequest = {
  kind: "text",
  text: "hello"
};

describe("result parser", () => {
  it("parses direct JSON", () => {
    const parsed = parseJsonObject('{"mandarin":"你好"}');
    expect(parsed).toMatchObject({ mandarin: "你好" });
  });

  it("recovers JSON from markdown fences", () => {
    const parsed = parseJsonObject('```json\n{"mandarin":"你好"}\n```');
    expect(parsed).toMatchObject({ mandarin: "你好" });
  });

  it("normalizes complete analysis output", () => {
    const result = parseAnalysisResult(
      JSON.stringify({
        inputLanguage: "English",
        sourceText: "hello",
        mandarin: "你好",
        pinyin: "ni hao",
        literalMeaning: "you good",
        naturalEnglish: "hello",
        wordBreakdown: [
          {
            hanzi: "你",
            pinyin: "ni",
            english: "you",
            notes: "informal singular"
          }
        ],
        grammarNotes: ["A common greeting."],
        usageNotes: ["Use with most people."],
        warnings: []
      }),
      textRequest,
      {
        provider: "ollama",
        model: "qwen2.5vl:7b"
      }
    );

    expect(result.mandarin).toBe("你好");
    expect(result.wordBreakdown).toHaveLength(1);
    expect(result.provider).toBe("ollama");
  });

  it("preserves Mandarin input exactly when the model rewrites it", () => {
    const request: AnalysisRequest = {
      kind: "text",
      text: "“文”字在汉语中有着丰富的内涵和历史底蕴。"
    };

    const result = parseAnalysisResult(
      JSON.stringify({
        inputLanguage: "Mandarin",
        sourceText: "wٛ z佚 h析 y授z不",
        mandarin: "wٛ z佚 h析 y授z不 b全n一",
        pinyin: "wٛ z佚 h析 y授z不",
        literalMeaning: "The character wen has rich meaning.",
        naturalEnglish: "The character 文 has rich meaning in Chinese.",
        wordBreakdown: [
          {
            hanzi: "文字",
            pinyin: "wٛ z佚",
            english: "writing; characters"
          }
        ],
        grammarNotes: [],
        usageNotes: [],
        warnings: []
      }),
      request,
      {
        provider: "ollama",
        model: "gemma4:e4b-it-qat"
      }
    );

    expect(result.sourceText).toBe(request.text);
    expect(result.mandarin).toBe(request.text);
    expect(result.pinyin).toContain("wén");
    expect(result.pinyin).toContain("zì");
    expect(result.wordBreakdown[0]?.pinyin).toBe("wén zì");
    expect(result.warnings).toContain(
      "The model rewrote the selected Mandarin text; Mandarin Lens preserved the original selection instead."
    );
  });

  it("throws a repair-friendly error for invalid JSON", () => {
    expect(() => parseJsonObject("not json")).toThrow(/valid JSON/);
  });
});
