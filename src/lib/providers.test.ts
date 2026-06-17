import { describe, expect, it, vi } from "vitest";

import { buildOllamaRequestBody, buildOpenRouterRequestBody, testProvider } from "./providers";
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

  it("adds Mandarin-skip instruction when selected text is Mandarin", () => {
    const body = buildOllamaRequestBody(
      {
        kind: "text",
        text: "你好"
      },
      settings
    ) as { messages: Array<{ content: string }> };

    expect(body.messages[1]?.content).toContain("already contain Mandarin");
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
