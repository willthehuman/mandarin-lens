export type ProviderName = "ollama" | "openrouter";
export type PinyinDisplayMode = "separate" | "ruby" | "combined";
export type ThemeMode = "system" | "light" | "dark";
export type OpenRouterAuthSource = "manual" | "oauth";

export type AnalysisRequest =
  | {
      kind: "text";
      text: string;
      pageUrl?: string;
    }
  | {
      kind: "image";
      srcUrl: string;
      pageUrl?: string;
    };

export interface Settings {
  provider: ProviderName;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaThinkingEnabled: boolean;
  analysisTimeoutSeconds: number;
  openRouterApiKey: string;
  openRouterModel: string;
  openRouterAuthSource: OpenRouterAuthSource;
  openRouterConnectedAt?: string;
  preferSameModelForVision: boolean;
  pinyinDisplayMode: PinyinDisplayMode;
  showCharacterMeanings: boolean;
  theme: ThemeMode;
}

export interface CharacterBreakdownItem {
  hanzi: string;
  pinyin: string;
  english: string;
  notes?: string;
}

export interface WordBreakdownItem {
  hanzi: string;
  pinyin: string;
  english: string;
  pos?: string;
  notes?: string;
  characterBreakdown?: CharacterBreakdownItem[];
}

export interface AnalysisResult {
  inputLanguage: string;
  sourceText: string;
  mandarin: string;
  pinyin: string;
  literalMeaning: string;
  naturalEnglish: string;
  wordBreakdown: WordBreakdownItem[];
  grammarNotes: string[];
  usageNotes: string[];
  imageDescription?: string;
  warnings: string[];
  provider: ProviderName;
  model: string;
  createdAt: string;
}

export interface AnalysisDebugInfo {
  provider: ProviderName;
  model: string;
  request: AnalysisRequest;
  systemPrompt: string;
  userPrompt: string;
  providerRequest: unknown;
  rawResponse?: string;
  normalizedResult?: AnalysisResult;
  error?: string;
  createdAt: string;
}

export interface AnalysisOutcome {
  result: AnalysisResult;
  debug: AnalysisDebugInfo;
}

export interface AnalysisError {
  message: string;
  details?: string;
  recoverable?: boolean;
}

export type AnalysisStatus =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      request: AnalysisRequest;
      provider: ProviderName;
      model: string;
      startedAt: string;
    }
  | {
      status: "result";
      request: AnalysisRequest;
      result: AnalysisResult;
      debug?: AnalysisDebugInfo;
    }
  | {
      status: "error";
      request?: AnalysisRequest;
      error: AnalysisError;
      provider?: ProviderName;
      model?: string;
      failedAt: string;
      debug?: AnalysisDebugInfo;
    };

export interface AnalyzeSelectionMessage {
  type: "ANALYZE_SELECTION";
  payload: {
    text: string;
    pageUrl?: string;
  };
}

export interface AnalyzeImageMessage {
  type: "ANALYZE_IMAGE";
  payload: {
    srcUrl: string;
    pageUrl?: string;
  };
}

export interface AnalysisStartedMessage {
  type: "ANALYSIS_STARTED";
  payload: Extract<AnalysisStatus, { status: "loading" }>;
}

export interface AnalysisResultMessage {
  type: "ANALYSIS_RESULT";
  payload: Extract<AnalysisStatus, { status: "result" }>;
}

export interface AnalysisErrorMessage {
  type: "ANALYSIS_ERROR";
  payload: Extract<AnalysisStatus, { status: "error" }>;
}

export interface TestProviderMessage {
  type: "TEST_PROVIDER";
  payload: Settings;
}

export type ExtensionMessage =
  | AnalyzeSelectionMessage
  | AnalyzeImageMessage
  | AnalysisStartedMessage
  | AnalysisResultMessage
  | AnalysisErrorMessage
  | TestProviderMessage;

export interface TestProviderResponse {
  ok: boolean;
  message: string;
  details?: string;
}
