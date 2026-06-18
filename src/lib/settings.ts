import type { AnalysisStatus, OpenRouterAuthSource, PinyinDisplayMode, Settings, ThemeMode } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  provider: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "gemma4:e4b-it-qat",
  ollamaThinkingEnabled: false,
  analysisTimeoutSeconds: 180,
  openRouterApiKey: "",
  openRouterModel: "qwen/qwen3.6-flash",
  openRouterAuthSource: "manual",
  preferSameModelForVision: true,
  pinyinDisplayMode: "combined",
  showCharacterMeanings: false,
  theme: "system"
};

const LEGACY_DEFAULT_OLLAMA_MODELS = new Set(["qwen2.5vl:7b", "gemma4:e4b-it-qat"]);
const MIN_ANALYSIS_TIMEOUT_SECONDS = 10;
const MAX_ANALYSIS_TIMEOUT_SECONDS = 3600;
const SETTINGS_KEY = "settings";
const STATUS_KEY = "analysisStatus";

export function normalizeSettings(value: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    provider: value?.provider === "openrouter" ? "openrouter" : "ollama",
    ollamaBaseUrl: trimTrailingSlash(value?.ollamaBaseUrl || DEFAULT_SETTINGS.ollamaBaseUrl),
    ollamaModel: normalizeOllamaModel(value?.ollamaModel),
    ollamaThinkingEnabled: value?.ollamaThinkingEnabled === true,
    analysisTimeoutSeconds: normalizeAnalysisTimeoutSeconds(value?.analysisTimeoutSeconds),
    openRouterApiKey: value?.openRouterApiKey?.trim() || "",
    openRouterModel: value?.openRouterModel?.trim() || DEFAULT_SETTINGS.openRouterModel,
    openRouterAuthSource: normalizeOpenRouterAuthSource(value),
    openRouterConnectedAt:
      normalizeOpenRouterAuthSource(value) === "oauth" && value?.openRouterConnectedAt?.trim()
        ? value.openRouterConnectedAt.trim()
        : undefined,
    preferSameModelForVision: value?.preferSameModelForVision ?? DEFAULT_SETTINGS.preferSameModelForVision,
    pinyinDisplayMode: normalizePinyinDisplayMode(value?.pinyinDisplayMode),
    showCharacterMeanings: value?.showCharacterMeanings ?? DEFAULT_SETTINGS.showCharacterMeanings,
    theme: normalizeTheme(value?.theme)
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

function normalizeAnalysisTimeoutSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.analysisTimeoutSeconds;
  }

  return Math.min(MAX_ANALYSIS_TIMEOUT_SECONDS, Math.max(MIN_ANALYSIS_TIMEOUT_SECONDS, Math.round(value)));
}

function normalizeOpenRouterAuthSource(value: Partial<Settings> | undefined): OpenRouterAuthSource {
  return value?.openRouterAuthSource === "oauth" && Boolean(value.openRouterApiKey?.trim()) ? "oauth" : "manual";
}

function normalizePinyinDisplayMode(value: PinyinDisplayMode | undefined): PinyinDisplayMode {
  return value === "separate" || value === "ruby" || value === "combined"
    ? value
    : DEFAULT_SETTINGS.pinyinDisplayMode;
}

function normalizeTheme(value: ThemeMode | undefined): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_SETTINGS.theme;
}
