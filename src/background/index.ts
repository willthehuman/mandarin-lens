import { activeModel, testProvider } from "../lib/providers";
import { getSettings, saveAnalysisStatus } from "../lib/settings";
import type { AnalysisRequest, AnalysisStatus, ExtensionMessage, TestProviderResponse } from "../lib/types";

const MENU_SELECTION = "mandarin-lens-selection";
const MENU_IMAGE = "mandarin-lens-image";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "Analyze Mandarin with pinyin",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: MENU_IMAGE,
    title: "Describe and analyze in Mandarin",
    contexts: ["image"]
  });

  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_SELECTION && info.selectionText) {
    handleContextMenuRequest(
      {
        kind: "text",
        text: info.selectionText,
        pageUrl: info.pageUrl
      },
      tab
    );
  }

  if (info.menuItemId === MENU_IMAGE && info.srcUrl) {
    handleContextMenuRequest(
      {
        kind: "image",
        srcUrl: info.srcUrl,
        pageUrl: info.pageUrl
      },
      tab
    );
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== "TEST_PROVIDER") {
    return false;
  }

  void testProvider(message.payload).then((response: TestProviderResponse) => {
    sendResponse(response);
  });

  return true;
});

function handleContextMenuRequest(request: AnalysisRequest, tab?: chrome.tabs.Tab): void {
  const panelOpenResult = openPanelFromUserGesture(tab);
  void runAnalysis(request, panelOpenResult);
}

async function runAnalysis(request: AnalysisRequest, panelOpenResult: Promise<Error | undefined>): Promise<void> {
  const settings = await getSettings();
  const model = activeModel(settings);
  const loadingStatus: AnalysisStatus = {
    status: "loading",
    request,
    provider: settings.provider,
    model,
    startedAt: new Date().toISOString()
  };

  await publishStatus("ANALYSIS_STARTED", loadingStatus);

  const panelOpenError = await panelOpenResult;
  if (panelOpenError) {
    await publishStatus("ANALYSIS_ERROR", {
      status: "error",
      request,
      provider: settings.provider,
      model,
      failedAt: new Date().toISOString(),
      error: {
        message: "Chrome blocked Mandarin Lens from opening the side panel.",
        details: panelOpenError.message,
        recoverable: true
      }
    });
  }
}

function openPanelFromUserGesture(tab?: chrome.tabs.Tab): Promise<Error | undefined> {
  try {
    if (tab?.id !== undefined) {
      return chrome.sidePanel.open({ tabId: tab.id }).then(() => undefined, normalizeError);
    }

    if (tab?.windowId !== undefined) {
      return chrome.sidePanel.open({ windowId: tab.windowId }).then(() => undefined, normalizeError);
    }

    return Promise.resolve(new Error("No active tab or window was available for the context-menu click."));
  } catch (error) {
    return Promise.resolve(normalizeError(error));
  }
}

async function publishStatus(
  type: "ANALYSIS_STARTED" | "ANALYSIS_RESULT" | "ANALYSIS_ERROR",
  status: AnalysisStatus
): Promise<void> {
  await saveAnalysisStatus(status);

  try {
    await chrome.runtime.sendMessage({
      type,
      payload: status
    });
  } catch {
    // The side panel may not have attached a listener yet; persisted status will render on load.
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
