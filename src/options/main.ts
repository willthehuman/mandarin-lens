import "../styles.css";

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

  const testButton = h("button", {
    className: "secondary-button",
    text: "Test connection",
    onClick: async () => {
      const nextSettings = readSettingsFromForm();
      testButton.textContent = "Testing...";
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
    }
  });

  replaceChildren(app, [
    h("div", { className: "app-shell" }, [
      h("div", { className: "settings-layout" }, [
        h("div", { className: "settings-heading" }, [
          h("div", { className: "brand" }, [
            h("div", { className: "brand-mark", text: "文" }),
            h("div", { className: "brand-text" }, [
              h("h1", { text: "Mandarin Lens Settings" }),
              h("p", { text: "Choose where analysis runs and which models handle text and images." })
            ])
          ])
        ]),
        h("section", { className: "panel form-grid" }, [
          h("div", { className: "field" }, [
            h("div", { className: "field-label", text: "Provider" }),
            h("div", { className: "segmented" }, [
              h("label", {}, [providerRadios.ollama, "Ollama"]),
              h("label", {}, [providerRadios.openrouter, "OpenRouter"])
            ])
          ]),
          h("div", { className: "field provider-field", id: "ollamaFields" }, [
            h("label", { htmlFor: ollamaBaseUrlId, text: "Ollama base URL" }),
            fields.ollamaBaseUrl,
            h("label", { htmlFor: ollamaModelId, text: "Ollama model" }),
            fields.ollamaModel
          ]),
          h("div", { className: "field provider-field", id: "openRouterFields" }, [
            h("label", { htmlFor: openRouterApiKeyId, text: "OpenRouter API key" }),
            fields.openRouterApiKey,
            h("label", { htmlFor: openRouterModelId, text: "OpenRouter model" }),
            fields.openRouterModel
          ]),
          h("div", { className: "toggle-row" }, [
            h("div", {}, [
              h("div", { className: "field-label", text: "Prefer same model for vision" }),
              h("div", {
                className: "small muted",
                text: "Use one configured model for text and image analysis when it supports both."
              })
            ]),
            fields.preferSameModelForVision
          ]),
          h("div", { className: "actions" }, [saveButton, testButton]),
          feedbackElement
        ])
      ])
    ])
  ]);

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
