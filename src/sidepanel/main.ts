import "../styles.css";

import { h, replaceChildren } from "../lib/dom";
import { buildRubyTokens } from "../lib/pinyinDisplay";
import { AnalysisDebugError, activeModel, analyzeRequest } from "../lib/providers";
import { getAnalysisStatus, getSettings, saveAnalysisStatus } from "../lib/settings";
import { applyTheme } from "../lib/theme";
import type {
  AnalysisRequest,
  AnalysisResult,
  AnalysisStatus,
  ExtensionMessage,
  ProviderName,
  Settings
} from "../lib/types";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing side panel app root.");
}

const app = appRoot;
let activeAnalysisKey: string | undefined;
let activeTimeoutId: number | undefined;
let currentSettings: Settings | undefined;
let currentStatus: AnalysisStatus | undefined;
let waitingNoticeKey: string | undefined;
let characterDetailsExpanded = true;

void initialize();

async function initialize(): Promise<void> {
  const [initialStatus, settings] = await Promise.all([getAnalysisStatus(), getSettings()]);
  currentSettings = settings;
  applyTheme(settings.theme);
  render(initialStatus, settings);
  maybeRunAnalysis(initialStatus);

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (
      message.type === "ANALYSIS_STARTED" ||
      message.type === "ANALYSIS_RESULT" ||
      message.type === "ANALYSIS_ERROR"
    ) {
      render(message.payload, currentSettings);
      maybeRunAnalysis(message.payload);
    }
  });
}

function render(status: AnalysisStatus, settings: Settings | undefined = currentSettings): void {
  currentStatus = status;
  replaceChildren(app, [
    h("div", { className: "app-shell" }, [
      h("div", { className: "content" }, [renderContent(status, settings)]),
      renderStatusBar(status)
    ])
  ]);
}

function renderStatusBar(status: AnalysisStatus): HTMLElement {
  const provider = statusProvider(status);
  const model = statusModel(status);

  return h("footer", { className: "status-bar" }, [
    h("div", { className: "status-bar-info" }, [
      h("span", { className: `status-dot ${provider ? "is-on" : ""}` }),
      h("span", { className: "status-provider", text: providerLabel(provider) }),
      model ? h("span", { className: "status-model", text: compactModel(model) }) : undefined
    ]),
    h(
      "button",
      {
        className: "icon-button",
        title: "Settings",
        ariaLabel: "Open settings",
        onClick: () => {
          void chrome.runtime.openOptionsPage();
        }
      },
      [settingsIcon()]
    )
  ]);
}

function renderContent(status: AnalysisStatus, settings: Settings | undefined): HTMLElement {
  if (status.status === "idle") {
    return h("div", { className: "empty-state" }, [
      h("h2", { text: "No analysis yet" }),
      h("p", { text: "Use the page context menu to send selected text or an image." }),
      h("button", {
        className: "secondary-button",
        text: "Settings",
        onClick: () => {
          void chrome.runtime.openOptionsPage();
        }
      })
    ]);
  }

  if (status.status === "loading") {
    const isWaitingNoticeVisible = waitingNoticeKey === loadingStatusKey(status);

    return h("div", { className: "stack" }, [
      h("div", { className: "loading-row" }, [
        h("span", { className: "spinner" }),
        h("span", { text: isWaitingNoticeVisible ? "Still waiting…" : "Analyzing…" })
      ]),
      isWaitingNoticeVisible ? renderWaitingNotice(status, settings) : undefined,
      renderSourceSection(status.request)
    ]);
  }

  if (status.status === "error") {
    const retryRequest = status.request;

    return h("div", { className: "stack" }, [
      retryRequest ? renderSourceSection(retryRequest) : undefined,
      h("section", { className: "error-panel" }, [
        h("h2", { text: status.error.message }),
        status.error.details ? h("p", { text: status.error.details }) : undefined,
        h("div", { className: "error-actions actions" }, [
          retryRequest
            ? h("button", {
                className: "primary-button",
                text: "Retry",
                onClick: () => {
                  void retryAnalysis(retryRequest);
                }
              })
            : undefined,
          h("button", {
            className: "secondary-button",
            text: "Settings",
            onClick: () => {
              void chrome.runtime.openOptionsPage();
            }
          })
        ])
      ])
    ]);
  }

  return renderResult(status.request, status.result, settings);
}

function maybeRunAnalysis(status: AnalysisStatus): void {
  if (status.status !== "loading") {
    clearAnalysisTimeout();
    waitingNoticeKey = undefined;
    return;
  }

  const analysisKey = loadingStatusKey(status);
  if (activeAnalysisKey === analysisKey) {
    return;
  }

  clearAnalysisTimeout();
  waitingNoticeKey = undefined;
  activeAnalysisKey = analysisKey;
  void runAnalysisInPanel(status, analysisKey);
}

async function retryAnalysis(request: AnalysisRequest): Promise<void> {
  const settings = await getSettings();
  currentSettings = settings;
  applyTheme(settings.theme);
  const loadingStatus: AnalysisStatus = {
    status: "loading",
    request,
    provider: settings.provider,
    model: activeModel(settings),
    startedAt: new Date().toISOString()
  };

  await saveAnalysisStatus(loadingStatus);
  render(loadingStatus, settings);
  maybeRunAnalysis(loadingStatus);
}

async function runAnalysisInPanel(
  status: Extract<AnalysisStatus, { status: "loading" }>,
  analysisKey: string
): Promise<void> {
  try {
    const settings = await getSettings();
    currentSettings = settings;
    applyTheme(settings.theme);
    scheduleAnalysisTimeout(status, settings, analysisKey);
    const outcome = await analyzeRequest(status.request, settings);
    if (activeAnalysisKey !== analysisKey) {
      return;
    }

    clearAnalysisTimeout();
    waitingNoticeKey = undefined;
    const resultStatus: AnalysisStatus = {
      status: "result",
      request: status.request,
      result: outcome.result,
      debug: outcome.debug
    };

    characterDetailsExpanded = true;
    await saveAnalysisStatus(resultStatus);
    render(resultStatus, settings);
  } catch (error) {
    if (activeAnalysisKey !== analysisKey) {
      return;
    }

    clearAnalysisTimeout();
    waitingNoticeKey = undefined;
    const debug = error instanceof AnalysisDebugError ? error.debug : undefined;
    const errorStatus: AnalysisStatus = {
      status: "error",
      request: status.request,
      provider: status.provider,
      model: status.model,
      failedAt: new Date().toISOString(),
      error: {
        message: error instanceof Error ? error.message : "Analysis failed.",
        details: status.request.kind === "image" ? imageFailureHint(status.provider, status.request.srcUrl) : undefined,
        recoverable: true
      },
      debug
    };

    await saveAnalysisStatus(errorStatus);
    render(errorStatus, currentSettings);
  } finally {
    if (activeAnalysisKey === analysisKey) {
      activeAnalysisKey = undefined;
      clearAnalysisTimeout();
      waitingNoticeKey = undefined;
    }
  }
}

function renderWaitingNotice(
  status: Extract<AnalysisStatus, { status: "loading" }>,
  settings: Settings | undefined
): HTMLElement {
  const waitSeconds = settings?.analysisTimeoutSeconds || 180;

  return h("section", { className: "warning-panel" }, [
    h("h2", { text: `Still waiting after ${formatSeconds(waitSeconds)}` }),
    h("p", { text: "The model request is still running. You can keep waiting or start over with a fresh request." }),
    h("div", { className: "warning-actions actions" }, [
      h("button", {
        className: "primary-button",
        text: "Continue waiting",
        onClick: () => {
          continueWaiting(status);
        }
      }),
      h("button", {
        className: "secondary-button",
        text: "Retry",
        onClick: () => {
          void retryAnalysis(status.request);
        }
      })
    ])
  ]);
}

function continueWaiting(status: Extract<AnalysisStatus, { status: "loading" }>): void {
  const analysisKey = loadingStatusKey(status);
  waitingNoticeKey = undefined;
  scheduleAnalysisTimeout(status, currentSettings, analysisKey);
  render(status, currentSettings);
}

function scheduleAnalysisTimeout(
  status: Extract<AnalysisStatus, { status: "loading" }>,
  settings: Settings | undefined,
  analysisKey: string
): void {
  clearAnalysisTimeout();
  activeTimeoutId = window.setTimeout(() => {
    if (activeAnalysisKey !== analysisKey || currentStatus?.status !== "loading") {
      return;
    }

    waitingNoticeKey = analysisKey;
    render(status, currentSettings);
  }, analysisTimeoutMs(settings));
}

function clearAnalysisTimeout(): void {
  if (activeTimeoutId !== undefined) {
    window.clearTimeout(activeTimeoutId);
  }

  activeTimeoutId = undefined;
}

function renderResult(request: AnalysisRequest, result: AnalysisResult, settings: Settings | undefined): HTMLElement {
  const pinyinDisplayMode = settings?.pinyinDisplayMode || "combined";
  const showRuby = pinyinDisplayMode === "ruby" || pinyinDisplayMode === "combined";
  const showSeparatePinyin = pinyinDisplayMode === "separate" || pinyinDisplayMode === "combined";

  return h("div", { className: "stack" }, [
    renderSourceSection(request),
    result.imageDescription
      ? renderSection("Image", [h("p", { className: "source-text", text: result.imageDescription })])
      : undefined,
    renderSection(
      "Translation",
      [showRuby ? renderMandarinRuby(result.mandarin) : h("p", { className: "mandarin-text", text: result.mandarin || "No Mandarin returned." })],
      result.mandarin ? copyButton(result.mandarin, "Copy translation") : undefined
    ),
    result.pinyin && showSeparatePinyin
      ? renderSection("Pinyin", [h("p", { className: "pinyin-text", text: result.pinyin })], copyButton(result.pinyin, "Copy pinyin"))
      : undefined,
    renderSection("Meaning", [
      h("p", { className: "source-text", text: result.naturalEnglish || result.literalMeaning || "No meaning returned." }),
      result.literalMeaning
        ? h("p", { className: "small muted", text: `Literal: ${result.literalMeaning}` })
        : undefined
    ]),
    result.wordBreakdown.length ? renderBreakdown(result.wordBreakdown, settings?.showCharacterMeanings ?? false) : undefined,
    result.grammarNotes.length ? renderNotes("Grammar notes", result.grammarNotes) : undefined,
    result.usageNotes.length ? renderNotes("Usage notes", result.usageNotes) : undefined,
    result.provider === "ollama" ? renderOllamaNotice() : undefined,
    result.warnings.length ? renderWarnings(result.warnings) : undefined
  ]);
}

function renderSourceSection(request: AnalysisRequest): HTMLElement {
  if (request.kind === "image") {
    return renderSection("Selected image", [
      h("img", { className: "selected-image-preview", src: request.srcUrl, alt: "Selected image" }),
      h("p", { className: "source-text image-url-text", text: request.srcUrl })
    ]);
  }

  return renderSection("Selected text", [
    h("div", { className: "selected-box" }, [h("p", { className: "source-text", text: request.text })]),
    h("p", { className: "char-count", text: `${request.text.length} characters` })
  ]);
}

function renderSection(
  title: string,
  children: Array<HTMLElement | undefined>,
  action?: HTMLElement
): HTMLElement {
  return h("section", { className: "panel-section" }, [
    h("div", { className: "section-label-row" }, [
      h("span", { className: "section-label", text: title }),
      action
    ]),
    h("div", { className: "section-body" }, children)
  ]);
}

function renderMandarinRuby(value: string): HTMLElement {
  if (!value) {
    return h("p", { className: "mandarin-text", text: "No Mandarin returned." });
  }

  const tokens = buildRubyTokens(value).map((token) =>
    token.pinyin
      ? h("ruby", { className: "ruby-token" }, [token.text, h("rt", { text: token.pinyin })])
      : h("span", { text: token.text })
  );

  return h("p", { className: "mandarin-text mandarin-ruby-text" }, tokens);
}

function renderBreakdown(items: AnalysisResult["wordBreakdown"], showCharacterMeanings: boolean): HTMLElement {
  const hasCharacterDetails = showCharacterMeanings && items.some((item) => item.characterBreakdown?.length);
  const headerRow = h("tr", {}, [
    h("th", { text: "Word" }),
    h("th", { text: "Pinyin" }),
    h("th", { text: "Meaning" }),
    h("th", { text: "POS" })
  ]);

  const rows = items.flatMap((item) => {
    const masterRow = h("tr", {}, [
      h("td", { className: "breakdown-hanzi", text: item.hanzi }),
      h("td", { className: "breakdown-pinyin", text: item.pinyin }),
      h("td", {}, [
        h("span", { text: item.english }),
        item.notes ? h("div", { className: "breakdown-note", text: item.notes }) : undefined
      ]),
      h("td", { className: "breakdown-pos", text: item.pos || "" })
    ]);

    if (!hasCharacterDetails || !characterDetailsExpanded || !item.characterBreakdown?.length) {
      return [masterRow];
    }

    return [
      masterRow,
      h("tr", { className: "breakdown-detail-row" }, [
        h("td", { className: "breakdown-detail-cell", colSpan: 4 }, [renderCharacterBreakdown(item.characterBreakdown)])
      ])
    ];
  });

  return h("section", { className: "panel-section" }, [
    h("div", { className: "section-label-row" }, [
      h("span", { className: "section-label", text: "Word breakdown" }),
      hasCharacterDetails ? characterDetailsToggleButton() : undefined
    ]),
    h("table", { className: "breakdown-table" }, [
      h("colgroup", {}, [
        h("col", { className: "col-word" }),
        h("col", { className: "col-pinyin" }),
        h("col", { className: "col-meaning" }),
        h("col", { className: "col-pos" })
      ]),
      h("thead", {}, [headerRow]),
      h("tbody", {}, rows)
    ])
  ]);
}

function characterDetailsToggleButton(): HTMLElement {
  const label = characterDetailsExpanded ? "Collapse all" : "Expand all";
  return h("button", {
    className: "detail-toggle-button",
    text: label,
    title: label,
    ariaLabel: `${label} character meanings`,
    onClick: () => {
      characterDetailsExpanded = !characterDetailsExpanded;
      if (currentStatus) {
        render(currentStatus, currentSettings);
      }
    }
  });
}

function renderCharacterBreakdown(items: NonNullable<AnalysisResult["wordBreakdown"][number]["characterBreakdown"]>): HTMLElement {
  return h(
    "div",
    { className: "character-breakdown" },
    items.map((item) =>
      h("div", { className: "character-item" }, [
        h("div", { className: "character-hanzi", text: item.hanzi }),
        h("div", { className: "character-pinyin", text: item.pinyin }),
        h("div", { className: "character-meaning", text: item.english }),
        item.notes ? h("div", { className: "character-note", text: item.notes }) : undefined
      ])
    )
  );
}

function renderNotes(title: string, notes: string[]): HTMLElement {
  return renderSection(title, [
    h("ul", { className: "note-list" }, notes.map((note) => h("li", { text: note })))
  ]);
}

function renderOllamaNotice(): HTMLElement {
  return h("section", { className: "warning-panel" }, [
    h("h2", { text: "Using local model via Ollama" }),
    h("p", { text: "Response may vary with model quality." })
  ]);
}

function renderWarnings(warnings: string[]): HTMLElement {
  return h("section", { className: "warning-panel" }, [
    h("h2", { text: "Warnings" }),
    h("ul", { className: "note-list" }, warnings.map((warning) => h("li", { text: warning })))
  ]);
}

function copyButton(value: string, label: string): HTMLElement {
  const button = h("button", {
    className: "copy-button",
    title: label,
    ariaLabel: label,
    onClick: () => {
      void navigator.clipboard.writeText(value).then(() => {
        button.classList.add("is-copied");
        window.setTimeout(() => button.classList.remove("is-copied"), 1200);
      });
    }
  });
  button.append(copyIcon());
  return button;
}

function copyIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V5a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return svg;
}

function settingsIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8.6 8.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A8.6 8.6 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a8.6 8.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8.6 8.6 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>';
  return svg;
}

function statusProvider(status: AnalysisStatus): ProviderName | undefined {
  if (status.status === "loading" || status.status === "error") {
    return status.provider;
  }
  if (status.status === "result") {
    return status.result.provider;
  }
  return undefined;
}

function statusModel(status: AnalysisStatus): string | undefined {
  if (status.status === "loading" || status.status === "error") {
    return status.model;
  }
  if (status.status === "result") {
    return status.result.model;
  }
  return undefined;
}

function loadingStatusKey(status: Extract<AnalysisStatus, { status: "loading" }>): string {
  return `${status.startedAt}:${status.provider}:${status.model}:${requestKey(status.request)}`;
}

function analysisTimeoutMs(settings: Settings | undefined): number {
  const seconds = normalizedAnalysisTimeoutSeconds(settings?.analysisTimeoutSeconds);
  return seconds * 1000;
}

function formatSeconds(value: number): string {
  const seconds = normalizedAnalysisTimeoutSeconds(value);
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function normalizedAnalysisTimeoutSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 180;
  }

  return Math.min(3600, Math.max(10, Math.round(value)));
}

function providerLabel(provider: ProviderName | undefined): string {
  if (provider === "ollama") {
    return "Ollama (Local)";
  }
  if (provider === "openrouter") {
    return "OpenRouter";
  }
  return "Ready";
}

function compactModel(model: string): string {
  return model.length > 28 ? `${model.slice(0, 25)}...` : model;
}

function requestKey(request: AnalysisRequest): string {
  return request.kind === "text" ? request.text : request.srcUrl;
}

function imageFailureHint(provider: string, srcUrl: string): string {
  if (provider === "ollama") {
    return `For Ollama, Mandarin Lens must fetch the image and send it as base64. Some blob:, authenticated, or CORS-sensitive images cannot be fetched from the extension page. Image URL: ${srcUrl}`;
  }

  return `The image URL is sent to the selected OpenRouter model. The model/provider must support vision input and be able to access this URL. Image URL: ${srcUrl}`;
}
