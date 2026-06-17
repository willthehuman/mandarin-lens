export type ProviderName = "ollama" | "openrouter";

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
  openRouterApiKey: string;
  openRouterModel: string;
  preferSameModelForVision: boolean;
}

export interface WordBreakdownItem {
  hanzi: string;
  pinyin: string;
  english: string;
  pos?: string;
  notes?: string;
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
    }
  | {
      status: "error";
      request?: AnalysisRequest;
      error: AnalysisError;
      provider?: ProviderName;
      model?: string;
      failedAt: string;
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
