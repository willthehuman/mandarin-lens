import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("settings normalization", () => {
  it("fills display, auth, and theme defaults for legacy settings", () => {
    const settings = normalizeSettings({
      provider: "openrouter",
      openRouterApiKey: "sk-test"
    });

    expect(settings).toMatchObject({
      provider: "openrouter",
      ollamaThinkingEnabled: false,
      analysisTimeoutSeconds: 180,
      pinyinDisplayMode: "combined",
      showCharacterMeanings: false,
      theme: "system",
      openRouterAuthSource: "manual"
    });
  });

  it("preserves OAuth metadata only while an OAuth key exists", () => {
    const connected = normalizeSettings({
      ...DEFAULT_SETTINGS,
      provider: "openrouter",
      openRouterApiKey: "sk-oauth",
      openRouterAuthSource: "oauth",
      openRouterConnectedAt: "2026-06-18T12:00:00.000Z"
    });

    expect(connected.openRouterAuthSource).toBe("oauth");
    expect(connected.openRouterConnectedAt).toBe("2026-06-18T12:00:00.000Z");

    const disconnected = normalizeSettings({
      ...connected,
      openRouterApiKey: "",
      openRouterAuthSource: "oauth"
    });

    expect(disconnected.openRouterAuthSource).toBe("manual");
    expect(disconnected.openRouterConnectedAt).toBeUndefined();
  });

  it("rejects unknown display and theme modes", () => {
    const settings = normalizeSettings({
      pinyinDisplayMode: "stacked" as never,
      theme: "sepia" as never
    });

    expect(settings.pinyinDisplayMode).toBe(DEFAULT_SETTINGS.pinyinDisplayMode);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("normalizes analysis timeout bounds", () => {
    expect(normalizeSettings({ analysisTimeoutSeconds: 9 }).analysisTimeoutSeconds).toBe(10);
    expect(normalizeSettings({ analysisTimeoutSeconds: 3601 }).analysisTimeoutSeconds).toBe(3600);
    expect(normalizeSettings({ analysisTimeoutSeconds: Number.NaN }).analysisTimeoutSeconds).toBe(
      DEFAULT_SETTINGS.analysisTimeoutSeconds
    );
  });
});
