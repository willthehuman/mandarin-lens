import { describe, expect, it, vi } from "vitest";

import {
  AnalysisDebugError,
  analyzeRequest,
  buildOllamaRequestBody,
  buildOpenRouterHeaders,
  buildOpenRouterRequestBody,
  testProvider
} from "./providers";
import { DEFAULT_SETTINGS } from "./settings";
import type { AnalysisRequest, Settings } from "./types";

const imageRequest: AnalysisRequest = {
  kind: "image",
  srcUrl: "https://example.com/cat.png"
};

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  openRouterApiKey: "test-key"
};

describe("provider request builders", () => {
  it("builds an Ollama body with base64 images", () => {
    const body = buildOllamaRequestBody(imageRequest, settings, ["abc123"]) as {
      messages: Array<{ images?: string[] }>;
      model: string;
      format: string;
    };

    expect(body.model).toBe(settings.ollamaModel);
    expect(body.format).toBe("json");
    expect(body.messages[1]?.images).toEqual(["abc123"]);
  });

  it("builds an OpenRouter body with image_url content", () => {
    const body = buildOpenRouterRequestBody(imageRequest, settings) as {
      messages: Array<{
        content: Array<{ type: string; image_url?: { url: string } }>;
      }>;
    };

    expect(body.messages[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image_url",
          image_url: { url: imageRequest.srcUrl, detail: "auto" }
        })
      ])
    );
  });

  it("adds OpenRouter app attribution headers", () => {
    expect(buildOpenRouterHeaders("test-key")).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/willthehuman/mandarin-lens",
      "X-OpenRouter-Title": "Mandarin Lens",
      "X-OpenRouter-Categories": "writing-assistant"
    });
  });

  it("adds Mandarin-skip instruction when selected text is Mandarin", () => {
    const body = buildOllamaRequestBody(
      {
        kind: "text",
        text: "你好"
      },
      settings
    ) as { messages: Array<{ content: string }> };

    expect(body.messages[1]?.content).toContain("Copy it exactly into sourceText and mandarin");
  });
});

describe("analysis debug info", () => {
  it("returns prompts, sanitized request data, raw response, and normalized result", async () => {
    const rawResponse = JSON.stringify({
      inputLanguage: "English",
      sourceText: "hello",
      mandarin: "你好",
      pinyin: "ni hao",
      literalMeaning: "you good",
      naturalEnglish: "hello",
      wordBreakdown: [],
      grammarNotes: [],
      usageNotes: [],
      warnings: []
    });
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: rawResponse
        }
      })
    ) as unknown as typeof fetch;

    const outcome = await analyzeRequest(
      {
        kind: "text",
        text: "hello"
      },
      {
        ...settings,
        provider: "ollama"
      },
      fetcher
    );

    expect(outcome.result.mandarin).toBe("你好");
    expect(outcome.debug.provider).toBe("ollama");
    expect(outcome.debug.userPrompt).toContain("Selected text to analyze:");
    expect(outcome.debug.rawResponse).toBe(rawResponse);
    expect(outcome.debug.normalizedResult?.mandarin).toBe("你好");
    expect(JSON.stringify(outcome.debug.providerRequest)).toContain("Return only valid JSON");
  });

  it("omits Ollama base64 image data from debug request payloads", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            inputLanguage: "Unknown",
            sourceText: "image",
            mandarin: "图片",
            pinyin: "tu pian",
            literalMeaning: "picture",
            naturalEnglish: "picture",
            wordBreakdown: [],
            grammarNotes: [],
            usageNotes: [],
            warnings: []
          })
        }
      })
    ) as unknown as typeof fetch;

    const outcome = await analyzeRequest(
      {
        kind: "image",
        srcUrl: "data:image/png;base64,abc123"
      },
      {
        ...settings,
        provider: "ollama"
      },
      fetcher
    );

    const debugJson = JSON.stringify(outcome.debug.providerRequest);
    expect(debugJson).toContain("[base64 image omitted; 6 chars]");
    expect(debugJson).not.toContain("abc123");
  });

  it("preserves raw model content when parsing fails", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: "not json"
        }
      })
    ) as unknown as typeof fetch;

    try {
      await analyzeRequest(
        {
          kind: "text",
          text: "hello"
        },
        {
          ...settings,
          provider: "ollama"
        },
        fetcher
      );
      throw new Error("Expected analyzeRequest to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisDebugError);
      expect((error as AnalysisDebugError).debug.rawResponse).toBe("not json");
      expect((error as AnalysisDebugError).debug.error).toContain("valid JSON");
    }
  });
});

describe("provider errors", () => {
  it("reports a missing OpenRouter API key", async () => {
    const response = await testProvider({
      ...settings,
      provider: "openrouter",
      openRouterApiKey: ""
    });

    expect(response.ok).toBe(false);
    expect(response.details).toContain("OpenRouter API key");
  });

  it("reports Ollama HTTP failures", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const response = await testProvider(
      {
        ...settings,
        provider: "ollama"
      },
      fetcher
    );

    expect(response.ok).toBe(false);
    expect(response.details).toContain("Ollama returned HTTP 500");
  });

  it("explains Ollama 403 as an origin allowlist issue", async () => {
    const fetcher = vi.fn(async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    const response = await testProvider(
      {
        ...settings,
        provider: "ollama"
      },
      fetcher
    );

    expect(response.ok).toBe(false);
    expect(response.details).toContain("chrome-extension:// origin");
    expect(response.details).toContain("OLLAMA_ORIGINS");
  });

  it("reports missing Ollama models before running chat", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        models: [{ name: "llama3.2:latest" }]
      })
    ) as unknown as typeof fetch;
    const response = await testProvider(
      {
        ...settings,
        provider: "ollama",
        ollamaModel: "gemma4:e4b-it-qat"
      },
      fetcher
    );

    expect(response.ok).toBe(false);
    expect(response.details).toContain("was not listed");
    expect(response.details).toContain("ollama pull gemma4:e4b-it-qat");
  });

  it("matches Ollama model names case-insensitively", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          models: [{ name: "gemma4:e4b-it-qat" }]
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          message: {
            content: JSON.stringify({
              inputLanguage: "English",
              sourceText: "hello",
              mandarin: "你好",
              pinyin: "ni hao",
              literalMeaning: "you good",
              naturalEnglish: "hello",
              wordBreakdown: [],
              grammarNotes: [],
              usageNotes: [],
              warnings: []
            })
          }
        })
      ) as unknown as typeof fetch;

    const response = await testProvider(
      {
        ...settings,
        provider: "ollama",
        ollamaModel: "gemma4:e4b-it-qat"
      },
      fetcher
    );

    expect(response.ok).toBe(true);
  });
});
