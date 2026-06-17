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

  it("throws a repair-friendly error for invalid JSON", () => {
    expect(() => parseJsonObject("not json")).toThrow(/valid JSON/);
  });
});
