import type { AnalysisStatus, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  provider: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "gemma4:e4b-it-qat",
  openRouterApiKey: "",
  openRouterModel: "google/gemini-2.5-flash",
  preferSameModelForVision: true
};

const LEGACY_DEFAULT_OLLAMA_MODELS = new Set(["qwen2.5vl:7b", "gemma4:e4b-it-qat"]);
const SETTINGS_KEY = "settings";
const STATUS_KEY = "analysisStatus";

export function normalizeSettings(value: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    provider: value?.provider === "openrouter" ? "openrouter" : "ollama",
    ollamaBaseUrl: trimTrailingSlash(value?.ollamaBaseUrl || DEFAULT_SETTINGS.ollamaBaseUrl),
    ollamaModel: normalizeOllamaModel(value?.ollamaModel),
    openRouterApiKey: value?.openRouterApiKey?.trim() || "",
    openRouterModel: value?.openRouterModel?.trim() || DEFAULT_SETTINGS.openRouterModel,
    preferSameModelForVision: value?.preferSameModelForVision ?? DEFAULT_SETTINGS.preferSameModelForVision
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export async function getAnalysisStatus(): Promise<AnalysisStatus> {
  const stored = await chrome.storage.local.get(STATUS_KEY);
  return stored[STATUS_KEY] || { status: "idle" };
}

export async function saveAnalysisStatus(status: AnalysisStatus): Promise<void> {
  await chrome.storage.local.set({ [STATUS_KEY]: status });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeOllamaModel(value: string | undefined): string {
  const model = value?.trim();

  if (!model || LEGACY_DEFAULT_OLLAMA_MODELS.has(model)) {
    return DEFAULT_SETTINGS.ollamaModel;
  }

  return model;
}
