import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { parseAnalysisResult } from "./resultParser";
import type { AnalysisRequest, AnalysisResult, Settings, TestProviderResponse } from "./types";

type Fetcher = typeof fetch;
const OLLAMA_CHAT_TIMEOUT_MS = 180_000;
const OLLAMA_TAGS_TIMEOUT_MS = 20_000;
const IMAGE_FETCH_TIMEOUT_MS = 45_000;
const OPENROUTER_TIMEOUT_MS = 120_000;

interface ChatMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | {
            type: "text";
            text: string;
          }
        | {
            type: "image_url";
            image_url: {
              url: string;
              detail?: "auto" | "low" | "high";
            };
          }
      >;
}

export function activeModel(settings: Settings): string {
  return settings.provider === "ollama" ? settings.ollamaModel : settings.openRouterModel;
}

export async function analyzeRequest(
  request: AnalysisRequest,
  settings: Settings,
  fetcher: Fetcher = fetch
): Promise<AnalysisResult> {
  if (settings.provider === "openrouter") {
    return analyzeWithOpenRouter(request, settings, fetcher);
  }

  return analyzeWithOllama(request, settings, fetcher);
}

export async function testProvider(settings: Settings, fetcher: Fetcher = fetch): Promise<TestProviderResponse> {
  try {
    if (settings.provider === "ollama") {
      await assertOllamaReachable(settings, fetcher);
    }

    const result = await analyzeRequest(
      {
        kind: "text",
        text: "hello"
      },
      settings,
      fetcher
    );

    return {
      ok: true,
      message: `Connected to ${settings.provider} using ${result.model}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: "Connection test failed.",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

export function buildOllamaRequestBody(request: AnalysisRequest, settings: Settings, images?: string[]): object {
  const userPrompt = buildUserPrompt(request);

  return {
    model: settings.ollamaModel,
    stream: false,
    format: "json",
    options: {
      temperature: 0.2
    },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt()
      },
      {
        role: "user",
        content: userPrompt,
        ...(images?.length ? { images } : {})
      }
    ]
  };
}

export function buildOpenRouterRequestBody(request: AnalysisRequest, settings: Settings): object {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt()
    },
    {
      role: "user",
      content:
        request.kind === "image"
          ? [
              {
                type: "text",
                text: buildUserPrompt(request)
              },
              {
                type: "image_url",
                image_url: {
                  url: request.srcUrl,
                  detail: "auto"
                }
              }
            ]
          : buildUserPrompt(request)
    }
  ];

  return {
    model: settings.openRouterModel,
    messages,
    response_format: {
      type: "json_object"
    },
    temperature: 0.2
  };
}

async function analyzeWithOllama(
  request: AnalysisRequest,
  settings: Settings,
  fetcher: Fetcher
): Promise<AnalysisResult> {
  const images = request.kind === "image" ? [await imageUrlToBase64(request.srcUrl, fetcher)] : undefined;
  const response = await fetchWithTimeout(
    fetcher,
    `${settings.ollamaBaseUrl}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildOllamaRequestBody(request, settings, images))
    },
    OLLAMA_CHAT_TIMEOUT_MS,
    `Ollama analysis with ${settings.ollamaModel}`
  );

  if (!response.ok) {
    throw new Error(await buildOllamaHttpError(response, settings));
  }

  const data = (await response.json()) as { message?: { content?: string }; error?: string };

  if (data.error) {
    throw new Error(data.error);
  }

  const content = data.message?.content;
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return parseAnalysisResult(content, request, {
    provider: "ollama",
    model: settings.ollamaModel
  });
}

async function assertOllamaReachable(settings: Settings, fetcher: Fetcher): Promise<void> {
  const response = await fetchWithTimeout(
    fetcher,
    `${settings.ollamaBaseUrl}/api/tags`,
    undefined,
    OLLAMA_TAGS_TIMEOUT_MS,
    "Ollama model list"
  );

  if (!response.ok) {
    throw new Error(await buildOllamaHttpError(response, settings));
  }

  const data = (await response.json()) as {
    models?: Array<{
      name?: string;
      model?: string;
    }>;
  };

  const modelNames = (data.models || []).flatMap((model) => [model.name, model.model]).filter(isString);
  const normalizedModelNames = new Set(modelNames.map((model) => model.toLowerCase()));
  if (modelNames.length && !normalizedModelNames.has(settings.ollamaModel.toLowerCase())) {
    throw new Error(
      `Ollama is reachable, but model "${settings.ollamaModel}" was not listed by /api/tags. Pull it with "ollama pull ${settings.ollamaModel}" or update the model name in settings.`
    );
  }
}

async function buildOllamaHttpError(response: Response, settings: Settings): Promise<string> {
  const body = await safeResponseText(response);
  const suffix = body ? ` Ollama response: ${body}` : "";

  if (response.status === 403) {
    return [
      `Ollama returned HTTP 403 from ${settings.ollamaBaseUrl}.`,
      "Chrome extension requests use a chrome-extension:// origin, and Ollama is rejecting that origin.",
      "Restart Ollama with OLLAMA_ORIGINS=\"chrome-extension://*,http://localhost:*,http://127.0.0.1:*\".",
      suffix.trim()
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (response.status === 404) {
    return `Ollama returned HTTP 404 from ${settings.ollamaBaseUrl}. Check the base URL and model "${settings.ollamaModel}".${suffix}`;
  }

  return `Ollama returned HTTP ${response.status}. Check that Ollama is running at ${settings.ollamaBaseUrl} and model "${settings.ollamaModel}" is installed.${suffix}`;
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function analyzeWithOpenRouter(
  request: AnalysisRequest,
  settings: Settings,
  fetcher: Fetcher
): Promise<AnalysisResult> {
  if (!settings.openRouterApiKey) {
    throw new Error("Add an OpenRouter API key in Mandarin Lens settings before using OpenRouter.");
  }

  const response = await fetchWithTimeout(
    fetcher,
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Mandarin Lens"
      },
      body: JSON.stringify(buildOpenRouterRequestBody(request, settings))
    },
    OPENROUTER_TIMEOUT_MS,
    `OpenRouter analysis with ${settings.openRouterModel}`
  );

  if (!response.ok) {
    throw new Error(`OpenRouter returned HTTP ${response.status}. Check your API key, model, and account credits.`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    error?: {
      message?: string;
    };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return parseAnalysisResult(content, request, {
    provider: "openrouter",
    model: settings.openRouterModel
  });
}

async function imageUrlToBase64(srcUrl: string, fetcher: Fetcher): Promise<string> {
  if (srcUrl.startsWith("data:")) {
    const encoded = srcUrl.split(",", 2)[1];
    if (!encoded) {
      throw new Error("The image data URL did not contain base64 content.");
    }
    return encoded;
  }

  if (srcUrl.startsWith("blob:")) {
    throw new Error("Ollama cannot analyze blob: images from the service worker. Open the source image URL or switch to OpenRouter.");
  }

  const response = await fetchWithTimeout(fetcher, srcUrl, undefined, IMAGE_FETCH_TIMEOUT_MS, "Image fetch");
  if (!response.ok) {
    throw new Error(`Could not fetch the image for Ollama analysis. Image URL returned HTTP ${response.status}: ${srcUrl}`);
  }

  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
