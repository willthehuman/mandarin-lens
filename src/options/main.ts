import "../styles.css";
import ollamaSvg from "../icons/ollama.svg?raw";
import openRouterSvg from "../icons/openrouter.svg?raw";

import { h, replaceChildren } from "../lib/dom";
import { getSettings, saveSettings } from "../lib/settings";
import type { ExtensionMessage, ProviderName, Settings, TestProviderResponse } from "../lib/types";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing options app root.");
}

const app = appRoot;

void initialize();

async function initialize(): Promise<void> {
  render(await getSettings(), undefined);
}

function render(settings: Settings, feedback: { type: "success" | "error" | "neutral"; text: string } | undefined): void {
  const providerName = "provider";
  const ollamaBaseUrlId = "ollamaBaseUrl";
  const ollamaModelId = "ollamaModel";
  const openRouterApiKeyId = "openRouterApiKey";
  const openRouterModelId = "openRouterModel";
  const preferSameModelForVisionId = "preferSameModelForVision";

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
      placeholder: "google/gemini-2.5-flash"
    }),
    preferSameModelForVision: h("input", {
      id: preferSameModelForVisionId,
      type: "checkbox",
      checked: settings.preferSameModelForVision
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
      const nextSettings = readSettingsFromForm();
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
    const nextSettings = readSettingsFromForm();
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

  replaceChildren(app, [
    h("div", { className: "app-shell options-shell" }, [
      h("header", { className: "options-header" }, [
        h("div", { className: "brand" }, [
          h("div", { className: "brand-mark", text: "文" }),
          h("h1", { className: "brand-title", text: "Mandarin Lens Options" })
        ])
      ]),
      h("div", { className: "options-body" }, [
        h("div", { className: "provider-heading" }, [
          h("h2", { text: "Provider" }),
          h("p", { text: "Configure AI provider settings for text and vision analysis." })
        ]),
        h("div", { className: "form-grid" }, [
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
          h("div", { className: "field" }, [
            h("label", { htmlFor: openRouterApiKeyId, text: "OpenRouter API Key" }),
            passwordField(fields.openRouterApiKey),
            h("p", { className: "field-hint" }, [
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
          feedbackElement
        ])
      ]),
      h("footer", { className: "action-bar" }, [
        testButton,
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

function chartIcon(): SVGSVGElement {
  return svgIcon(
    '<path d="M5 20V12M12 20V6M19 20v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
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

function readSettingsFromForm(): Settings {
  const providerInput = document.querySelector<HTMLInputElement>('input[name="provider"]:checked');

  return {
    provider: (providerInput?.value === "openrouter" ? "openrouter" : "ollama") as ProviderName,
    ollamaBaseUrl: readInput("ollamaBaseUrl"),
    ollamaModel: readInput("ollamaModel"),
    openRouterApiKey: readInput("openRouterApiKey"),
    openRouterModel: readInput("openRouterModel"),
    preferSameModelForVision: document.querySelector<HTMLInputElement>("#preferSameModelForVision")?.checked ?? true
  };
}

function readInput(id: string): string {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() || "";
}
