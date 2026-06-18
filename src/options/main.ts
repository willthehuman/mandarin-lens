import "../styles.css";
import ollamaSvg from "../icons/ollama.svg?raw";
import openRouterSvg from "../icons/openrouter.svg?raw";

import { h, replaceChildren } from "../lib/dom";
import { connectOpenRouterWithOAuth } from "../lib/openrouterOAuth";
import { getAnalysisStatus, getSettings, saveSettings } from "../lib/settings";
import { applyTheme } from "../lib/theme";
import type {
  AnalysisDebugInfo,
  AnalysisStatus,
  ExtensionMessage,
  PinyinDisplayMode,
  ProviderName,
  Settings,
  TestProviderResponse,
  ThemeMode
} from "../lib/types";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing options app root.");
}

const app = appRoot;
type Feedback = { type: "success" | "error" | "neutral"; text: string };

let debugVisible = false;
let latestAnalysisStatus: AnalysisStatus | undefined;
let latestFeedback: Feedback | undefined;

void initialize();

async function initialize(): Promise<void> {
  latestAnalysisStatus = await getAnalysisStatus();
  render(await getSettings(), undefined);
}

function render(settings: Settings, feedback: Feedback | undefined): void {
  applyTheme(settings.theme);
  latestFeedback = feedback;
  const providerName = "provider";
  const pinyinDisplayName = "pinyinDisplayMode";
  const themeName = "theme";
  const ollamaBaseUrlId = "ollamaBaseUrl";
  const ollamaModelId = "ollamaModel";
  const ollamaThinkingEnabledId = "ollamaThinkingEnabled";
  const analysisTimeoutSecondsId = "analysisTimeoutSeconds";
  const openRouterApiKeyId = "openRouterApiKey";
  const openRouterModelId = "openRouterModel";
  const preferSameModelForVisionId = "preferSameModelForVision";
  const showCharacterMeaningsId = "showCharacterMeanings";

  const providerRadios = {
    ollama: h("input", {
      type: "radio",
      name: providerName,
      value: "ollama",
      checked: settings.provider === "ollama"
    }),
    openrouter: h("input", {
      type: "radio",
      name: providerName,
      value: "openrouter",
      checked: settings.provider === "openrouter"
    })
  };

  const pinyinDisplayRadios = {
    combined: h("input", {
      type: "radio",
      name: pinyinDisplayName,
      value: "combined",
      checked: settings.pinyinDisplayMode === "combined"
    }),
    ruby: h("input", {
      type: "radio",
      name: pinyinDisplayName,
      value: "ruby",
      checked: settings.pinyinDisplayMode === "ruby"
    }),
    separate: h("input", {
      type: "radio",
      name: pinyinDisplayName,
      value: "separate",
      checked: settings.pinyinDisplayMode === "separate"
    })
  };

  const themeRadios = {
    system: h("input", {
      type: "radio",
      name: themeName,
      value: "system",
      checked: settings.theme === "system"
    }),
    light: h("input", {
      type: "radio",
      name: themeName,
      value: "light",
      checked: settings.theme === "light"
    }),
    dark: h("input", {
      type: "radio",
      name: themeName,
      value: "dark",
      checked: settings.theme === "dark"
    })
  };

  const fields = {
    ollamaBaseUrl: h("input", {
      id: ollamaBaseUrlId,
      type: "url",
      value: settings.ollamaBaseUrl,
      placeholder: "http://localhost:11434"
    }),
    ollamaModel: h("input", {
      id: ollamaModelId,
      type: "text",
      value: settings.ollamaModel,
      placeholder: "gemma4:e4b-it-qat"
    }),
    ollamaThinkingEnabled: h("input", {
      id: ollamaThinkingEnabledId,
      type: "checkbox",
      checked: settings.ollamaThinkingEnabled
    }),
    analysisTimeoutSeconds: h("input", {
      id: analysisTimeoutSecondsId,
      type: "number",
      value: String(settings.analysisTimeoutSeconds),
      min: "10",
      max: "3600",
      step: "10",
      placeholder: "180"
    }),
    openRouterApiKey: h("input", {
      id: openRouterApiKeyId,
      type: "password",
      value: settings.openRouterApiKey,
      placeholder: "sk-or-..."
    }),
    openRouterModel: h("input", {
      id: openRouterModelId,
      type: "text",
      value: settings.openRouterModel,
      placeholder: "qwen/qwen3.6-flash"
    }),
    preferSameModelForVision: h("input", {
      id: preferSameModelForVisionId,
      type: "checkbox",
      checked: settings.preferSameModelForVision
    }),
    showCharacterMeanings: h("input", {
      id: showCharacterMeaningsId,
      type: "checkbox",
      checked: settings.showCharacterMeanings
    })
  };

  const feedbackElement = h("p", {
    className: `feedback ${feedback?.type === "success" ? "success" : feedback?.type === "error" ? "error" : ""}`,
    text: feedback?.text || ""
  });

  const saveButton = h("button", {
    className: "primary-button",
    text: "Save",
    onClick: async () => {
      const nextSettings = readSettingsFromForm(settings);
      await saveSettings(nextSettings);
      render(nextSettings, { type: "success", text: "Settings saved." });
    }
  });

  const cancelButton = h("button", {
    className: "secondary-button",
    text: "Cancel",
    onClick: () => {
      window.close();
    }
  });

  const testButton = h("button", { className: "secondary-button" }, [chartIcon(), "Test connection"]);
  testButton.addEventListener("click", async () => {
    const nextSettings = readSettingsFromForm(settings);
    testButton.setAttribute("disabled", "true");
    feedbackElement.textContent = "";

    const message: ExtensionMessage = {
      type: "TEST_PROVIDER",
      payload: nextSettings
    };

    const response = (await chrome.runtime.sendMessage(message)) as TestProviderResponse;
    await saveSettings(nextSettings);
    render(nextSettings, {
      type: response.ok ? "success" : "error",
      text: response.details ? `${response.message} ${response.details}` : response.message
    });
  });

  const connectButton = h("button", { className: "secondary-button" }, [linkIcon(), "Connect OpenRouter"]);
  connectButton.addEventListener("click", async () => {
    const nextSettings = readSettingsFromForm(settings);
    connectButton.setAttribute("disabled", "true");
    feedbackElement.textContent = "";

    try {
      const key = await connectOpenRouterWithOAuth();
      const connectedSettings: Settings = {
        ...nextSettings,
        provider: "openrouter",
        openRouterApiKey: key,
        openRouterAuthSource: "oauth",
        openRouterConnectedAt: new Date().toISOString()
      };
      await saveSettings(connectedSettings);
      render(connectedSettings, { type: "success", text: "OpenRouter connected." });
    } catch (error) {
      render(nextSettings, {
        type: "error",
        text: error instanceof Error ? error.message : "OpenRouter connection failed."
      });
    }
  });

  const disconnectButton = h("button", {
    className: "secondary-button",
    text: "Disconnect",
    onClick: async () => {
      const disconnectedSettings: Settings = {
        ...readSettingsFromForm(settings),
        openRouterApiKey: "",
        openRouterAuthSource: "manual",
        openRouterConnectedAt: undefined
      };
      await saveSettings(disconnectedSettings);
      render(disconnectedSettings, { type: "success", text: "OpenRouter disconnected." });
    }
  });

  const debugButton = h("button", {
    className: "secondary-button",
    text: debugVisible ? "Hide debug info" : "Show debug info",
    onClick: async () => {
      debugVisible = !debugVisible;
      if (debugVisible) {
        latestAnalysisStatus = await getAnalysisStatus();
      }
      render(readSettingsFromForm(settings), latestFeedback);
    }
  });

  replaceChildren(app, [
    h("div", { className: "app-shell options-shell" }, [
      h("header", { className: "options-header" }, [
        h("div", { className: "brand" }, [
          brandLogo(),
          h("h1", { className: "brand-title", text: "Mandarin Lens Options" })
        ])
      ]),
      h("div", { className: "options-body" }, [
        h("div", { className: "provider-heading" }, [
          h("h2", { text: "Provider" }),
          h("p", { text: "Configure AI provider settings for text and vision analysis." })
        ]),
        h("div", { className: "form-grid" }, [
          h("div", { className: "form-section-heading" }, [h("h3", { text: "Provider" })]),
          h("div", { className: "segmented" }, [
            h("label", {}, [providerRadios.ollama, ollamaIcon(), "Ollama"]),
            h("label", {}, [providerRadios.openrouter, openRouterIcon(), "OpenRouter"])
          ]),
          h("div", { className: "field" }, [
            h("label", { htmlFor: ollamaBaseUrlId, text: "Ollama Base URL" }),
            fields.ollamaBaseUrl,
            h("p", { className: "field-hint", text: "Usually http://localhost:11434" })
          ]),
          h("div", { className: "field" }, [
            h("label", { htmlFor: ollamaModelId, text: "Ollama Model" }),
            fields.ollamaModel,
            h("p", { className: "field-hint", text: "Model must be available in your local Ollama instance." })
          ]),
          h("div", { className: "toggle-row" }, [
            h("div", {}, [
              h("div", { className: "field-label", text: "Ollama thinking" }),
              h("div", {
                className: "field-hint",
                text: "Send Ollama's think parameter for models that support thinking."
              })
            ]),
            switchControl(fields.ollamaThinkingEnabled)
          ]),
          h("div", { className: "field" }, [
            h("label", { htmlFor: analysisTimeoutSecondsId, text: "Analysis Timeout (seconds)" }),
            fields.analysisTimeoutSeconds,
            h("p", { className: "field-hint", text: "Used for model responses and the Wait again action." })
          ]),
          h("div", { className: "field" }, [
            h("label", { htmlFor: openRouterApiKeyId, text: "OpenRouter API Key" }),
            passwordField(fields.openRouterApiKey),
            h("div", { className: "oauth-row" }, [
              connectButton,
              settings.openRouterAuthSource === "oauth" ? disconnectButton : undefined,
              renderOpenRouterAuthStatus(settings)
            ]),
            settings.openRouterAuthSource === "oauth"
              ? h("p", { className: "field-hint", text: "Connected keys are stored locally in Chrome extension storage." })
              : h("p", { className: "field-hint" }, [
                  "Get your API key from ",
                  h("a", { className: "field-link", text: "openrouter.ai", href: "https://openrouter.ai/keys" })
                ])
          ]),
          h("div", { className: "field" }, [
            h("label", { htmlFor: openRouterModelId, text: "OpenRouter Model" }),
            fields.openRouterModel,
            h("p", { className: "field-hint", text: "Select a model available on OpenRouter." })
          ]),
          h("div", { className: "toggle-row" }, [
            h("div", {}, [
              h("div", { className: "field-label", text: "Prefer same model for vision (image analysis)" }),
              h("div", {
                className: "field-hint",
                text: "Use the selected text model for vision requests when possible."
              })
            ]),
            switchControl(fields.preferSameModelForVision)
          ]),
          h("div", { className: "form-section-heading" }, [h("h3", { text: "Display" })]),
          h("div", { className: "field" }, [
            h("div", { className: "field-label", text: "Pinyin display" }),
            h("div", { className: "segmented segmented-three" }, [
              h("label", {}, [pinyinDisplayRadios.combined, "Combined"]),
              h("label", {}, [pinyinDisplayRadios.ruby, "Above"]),
              h("label", {}, [pinyinDisplayRadios.separate, "Separate"])
            ])
          ]),
          h("div", { className: "toggle-row" }, [
            h("div", {}, [
              h("div", { className: "field-label", text: "Character meanings" }),
              h("div", {
                className: "field-hint",
                text: "Show per-character detail rows in word breakdowns when the model returns them."
              })
            ]),
            switchControl(fields.showCharacterMeanings)
          ]),
          h("div", { className: "form-section-heading" }, [h("h3", { text: "Appearance" })]),
          h("div", { className: "field" }, [
            h("div", { className: "field-label", text: "Theme" }),
            h("div", { className: "segmented segmented-three" }, [
              h("label", {}, [themeRadios.system, "System"]),
              h("label", {}, [themeRadios.light, "Light"]),
              h("label", {}, [themeRadios.dark, "Dark"])
            ])
          ]),
          feedbackElement
        ]),
        debugVisible ? renderDebugPanel(latestAnalysisStatus) : undefined
      ]),
      h("footer", { className: "action-bar" }, [
        h("div", { className: "action-bar-start" }, [
          testButton,
          debugButton,
          h("span", { className: "version-text", text: `Version ${extensionVersion()}` })
        ]),
        h("div", { className: "action-bar-end" }, [cancelButton, saveButton])
      ])
    ])
  ]);
}

function passwordField(input: HTMLInputElement): HTMLElement {
  const toggle = h("button", {
    className: "eye-button",
    title: "Show API key",
    ariaLabel: "Show API key",
    onClick: () => {
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      toggle.setAttribute("aria-label", visible ? "Show API key" : "Hide API key");
      toggle.title = visible ? "Show API key" : "Hide API key";
    }
  });
  toggle.append(eyeIcon());
  return h("div", { className: "password-field" }, [input, toggle]);
}

function switchControl(input: HTMLInputElement): HTMLElement {
  const track = h("span", { className: "switch-track" }, [h("span", { className: "switch-thumb" })]);
  return h("label", { className: "switch" }, [input, track]);
}

function renderOpenRouterAuthStatus(settings: Settings): HTMLElement | undefined {
  if (settings.openRouterAuthSource !== "oauth") {
    return undefined;
  }

  return h("span", {
    className: "auth-status",
    text: settings.openRouterConnectedAt ? `Connected ${formatDate(settings.openRouterConnectedAt)}` : "Connected"
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function renderDebugPanel(status: AnalysisStatus | undefined): HTMLElement {
  const debug = getStatusDebug(status);

  if (!debug) {
    return h("section", { className: "debug-panel" }, [
      h("div", { className: "debug-header" }, [h("h2", { text: "Debug info" })]),
      h("p", {
        className: "field-hint",
        text: "No analysis debug info is available yet. Run an analysis from the context menu, then return here."
      })
    ]);
  }

  const metadata = {
    provider: debug.provider,
    model: debug.model,
    createdAt: debug.createdAt,
    request: debug.request,
    error: debug.error
  };

  return h("section", { className: "debug-panel" }, [
    h("div", { className: "debug-header" }, [
      h("h2", { text: "Debug info" }),
      h("span", { className: "debug-meta", text: `${debug.provider} - ${compactDebugModel(debug.model)}` })
    ]),
    renderDebugBlock("Metadata", formatDebugValue(metadata)),
    renderDebugBlock("System prompt", debug.systemPrompt),
    renderDebugBlock("User prompt", debug.userPrompt),
    renderDebugBlock("Provider request", formatDebugValue(debug.providerRequest)),
    renderDebugBlock("Raw response", debug.rawResponse || "No raw response was captured."),
    renderDebugBlock("Normalized result", debug.normalizedResult ? formatDebugValue(debug.normalizedResult) : "No normalized result was captured.")
  ]);
}

function renderDebugBlock(title: string, value: string): HTMLElement {
  return h("details", { className: "debug-block" }, [
    h("summary", { text: title }),
    h("pre", { text: value })
  ]);
}

function getStatusDebug(status: AnalysisStatus | undefined): AnalysisDebugInfo | undefined {
  if (status?.status === "result" || status?.status === "error") {
    return status.debug;
  }

  return undefined;
}

function formatDebugValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function compactDebugModel(model: string): string {
  return model.length > 34 ? `${model.slice(0, 31)}...` : model;
}

function brandLogo(): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "brand-mark";
  img.src = "/icons/icon-128.png";
  img.width = 34;
  img.height = 34;
  img.alt = "Mandarin Lens";
  return img;
}

function chartIcon(): SVGSVGElement {
  return svgIcon(
    '<path d="M5 20V12M12 20V6M19 20v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  );
}

function linkIcon(): SVGSVGElement {
  return svgIcon(
    '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  );
}

function ollamaIcon(): SVGSVGElement {
  return brandIcon(ollamaSvg);
}

function openRouterIcon(): SVGSVGElement {
  return brandIcon(openRouterSvg);
}

// Render an imported brand SVG normalized to the palette: 18px box, recolored to
// currentColor (so it follows the segmented control's muted/teal state). Strips any
// dangling clip-path reference, which would otherwise hide the icon when the file
// ships without the matching <defs>.
function brandIcon(raw: string): SVGSVGElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = raw.trim();
  const svg = wrapper.querySelector("svg");

  if (!(svg instanceof SVGSVGElement)) {
    return svgIcon("");
  }

  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("stroke", svg.hasAttribute("stroke") ? "currentColor" : "none");
  svg.setAttribute("aria-hidden", "true");
  svg.removeAttribute("id");
  svg.removeAttribute("transform");
  svg.querySelectorAll("[clip-path]").forEach((node) => node.removeAttribute("clip-path"));
  return svg;
}

function eyeIcon(): SVGSVGElement {
  return svgIcon(
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.7"/>'
  );
}

function svgIcon(inner: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = inner;
  return svg;
}

function extensionVersion(): string {
  const manifest = chrome.runtime.getManifest();
  return manifest.version_name || manifest.version;
}

function readSettingsFromForm(previousSettings: Settings): Settings {
  const providerInput = document.querySelector<HTMLInputElement>('input[name="provider"]:checked');
  const pinyinDisplayMode = readRadioValue<PinyinDisplayMode>("pinyinDisplayMode", "combined");
  const theme = readRadioValue<ThemeMode>("theme", "system");
  const openRouterApiKey = readInput("openRouterApiKey");
  const keepsOAuthKey =
    previousSettings.openRouterAuthSource === "oauth" &&
    Boolean(openRouterApiKey) &&
    openRouterApiKey === previousSettings.openRouterApiKey;

  return {
    provider: (providerInput?.value === "openrouter" ? "openrouter" : "ollama") as ProviderName,
    ollamaBaseUrl: readInput("ollamaBaseUrl"),
    ollamaModel: readInput("ollamaModel"),
    ollamaThinkingEnabled: document.querySelector<HTMLInputElement>("#ollamaThinkingEnabled")?.checked ?? false,
    analysisTimeoutSeconds: Number(readInput("analysisTimeoutSeconds")),
    openRouterApiKey,
    openRouterModel: readInput("openRouterModel"),
    openRouterAuthSource: keepsOAuthKey ? "oauth" : "manual",
    openRouterConnectedAt: keepsOAuthKey ? previousSettings.openRouterConnectedAt : undefined,
    preferSameModelForVision: document.querySelector<HTMLInputElement>("#preferSameModelForVision")?.checked ?? true,
    pinyinDisplayMode,
    showCharacterMeanings: document.querySelector<HTMLInputElement>("#showCharacterMeanings")?.checked ?? false,
    theme
  };
}

function readInput(id: string): string {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() || "";
}

function readRadioValue<T extends string>(name: string, fallback: T): T {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return (input?.value || fallback) as T;
}
