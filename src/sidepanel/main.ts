import "../styles.css";

import { h, replaceChildren } from "../lib/dom";
import { analyzeRequest } from "../lib/providers";
import { getAnalysisStatus, getSettings, saveAnalysisStatus } from "../lib/settings";
import type { AnalysisRequest, AnalysisResult, AnalysisStatus, ExtensionMessage } from "../lib/types";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing side panel app root.");
}

const app = appRoot;
let activeAnalysisKey: string | undefined;

void initialize();

async function initialize(): Promise<void> {
  const initialStatus = await getAnalysisStatus();
  render(initialStatus);
  maybeRunAnalysis(initialStatus);

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (
      message.type === "ANALYSIS_STARTED" ||
      message.type === "ANALYSIS_RESULT" ||
      message.type === "ANALYSIS_ERROR"
    ) {
      render(message.payload);
      maybeRunAnalysis(message.payload);
    }
  });
}

function render(status: AnalysisStatus): void {
  replaceChildren(app, [
    h("div", { className: "app-shell" }, [
      renderHeader(status),
      h("div", { className: "content" }, [renderContent(status)])
    ])
  ]);
}

function renderHeader(status: AnalysisStatus): HTMLElement {
  const model =
    status.status === "loading"
      ? status.model
      : status.status === "result"
        ? status.result.model
        : status.status === "error"
          ? status.model
          : undefined;

  return h("header", { className: "app-header" }, [
    h("div", { className: "brand" }, [
      h("div", { className: "brand-mark", text: "文" }),
      h("div", { className: "brand-text" }, [
        h("h1", { className: "brand-title", text: "Mandarin Lens" }),
        h("p", { className: "brand-subtitle", text: model ? compactModel(model) : "Ready" })
      ])
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

function renderContent(status: AnalysisStatus): HTMLElement {
  if (status.status === "idle") {
    return h("section", { className: "panel empty-state" }, [
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
    return h("div", { className: "stack" }, [
      h("section", { className: "panel" }, [
        h("div", { className: "status-pill" }, [h("span", { className: "spinner" }), "Analyzing"]),
        h("div", { className: "status-row" }, [
          h("span", { className: "small muted", text: status.provider }),
          h("span", { className: "small muted", text: compactModel(status.model) })
        ])
      ]),
      renderSourceSection(status.request)
    ]);
  }

  if (status.status === "error") {
    return h("div", { className: "stack" }, [
      status.request ? renderSourceSection(status.request) : undefined,
      h("section", { className: "error-panel" }, [
        h("h2", { text: status.error.message }),
        status.error.details ? h("p", { text: status.error.details }) : undefined
      ])
    ]);
  }

  return renderResult(status.request, status.result);
}

function maybeRunAnalysis(status: AnalysisStatus): void {
  if (status.status !== "loading") {
    return;
  }

  const analysisKey = `${status.startedAt}:${status.provider}:${status.model}:${requestKey(status.request)}`;
  if (activeAnalysisKey === analysisKey) {
    return;
  }

  activeAnalysisKey = analysisKey;
  void runAnalysisInPanel(status, analysisKey);
}

async function runAnalysisInPanel(
  status: Extract<AnalysisStatus, { status: "loading" }>,
  analysisKey: string
): Promise<void> {
  try {
    const settings = await getSettings();
    const result = await analyzeRequest(status.request, settings);
    const resultStatus: AnalysisStatus = {
      status: "result",
      request: status.request,
      result
    };

    await saveAnalysisStatus(resultStatus);
    render(resultStatus);
  } catch (error) {
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
      }
    };

    await saveAnalysisStatus(errorStatus);
    render(errorStatus);
  } finally {
    if (activeAnalysisKey === analysisKey) {
      activeAnalysisKey = undefined;
    }
  }
}

function renderResult(request: AnalysisRequest, result: AnalysisResult): HTMLElement {
  return h("div", { className: "stack" }, [
    renderSourceSection(request),
    result.imageDescription
      ? renderTextSection("Image", [
          h("p", {
            className: "source-text",
            text: result.imageDescription
          })
        ])
      : undefined,
    renderTextSection("Mandarin", [
      h("p", { className: "mandarin-text", text: result.mandarin || "No Mandarin returned." }),
      result.pinyin ? h("p", { className: "pinyin-text", text: result.pinyin }) : undefined
    ]),
    renderTextSection("Meaning", [
      h("p", { className: "source-text", text: result.naturalEnglish || result.literalMeaning || "No meaning returned." }),
      result.literalMeaning
        ? h("p", { className: "small muted", text: `Literal: ${result.literalMeaning}` })
        : undefined
    ]),
    result.wordBreakdown.length ? renderBreakdown(result.wordBreakdown) : undefined,
    result.grammarNotes.length ? renderNotes("Grammar", result.grammarNotes) : undefined,
    result.usageNotes.length ? renderNotes("Usage", result.usageNotes) : undefined,
    result.warnings.length ? renderWarnings(result.warnings) : undefined
  ]);
}

function renderSourceSection(request: AnalysisRequest): HTMLElement {
  return renderTextSection("Source", [
    h("p", {
      className: "source-text",
      text: request.kind === "text" ? request.text : request.srcUrl
    })
  ]);
}

function renderTextSection(title: string, children: Array<HTMLElement | undefined>): HTMLElement {
  return h("section", { className: "section" }, [
    h("div", { className: "section-header" }, [h("h2", { className: "section-title", text: title })]),
    h("div", { className: "section-body stack" }, children)
  ]);
}

function renderBreakdown(items: AnalysisResult["wordBreakdown"]): HTMLElement {
  return h("section", { className: "section" }, [
    h("div", { className: "section-header" }, [h("h2", { className: "section-title", text: "Word Breakdown" })]),
    h("div", { className: "section-body breakdown-list" }, [
      ...items.map((item) =>
        h("div", { className: "breakdown-row" }, [
          h("div", { className: "breakdown-hanzi", text: item.hanzi }),
          h("div", { className: "breakdown-meta" }, [
            h("div", { className: "breakdown-pinyin", text: item.pinyin }),
            h("div", { className: "breakdown-english", text: item.english }),
            item.notes ? h("div", { className: "breakdown-note", text: item.notes }) : undefined
          ])
        ])
      )
    ])
  ]);
}

function renderNotes(title: string, notes: string[]): HTMLElement {
  return h("section", { className: "section" }, [
    h("div", { className: "section-header" }, [h("h2", { className: "section-title", text: title })]),
    h("div", { className: "section-body" }, [
      h("ul", { className: "note-list" }, notes.map((note) => h("li", { text: note })))
    ])
  ]);
}

function renderWarnings(warnings: string[]): HTMLElement {
  return h("section", { className: "warning-panel" }, [
    h("h2", { text: "Warnings" }),
    h("ul", { className: "note-list" }, warnings.map((warning) => h("li", { text: warning })))
  ]);
}

function settingsIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "19");
  svg.setAttribute("height", "19");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8.6 8.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A8.6 8.6 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a8.6 8.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8.6 8.6 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>';
  return svg;
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
