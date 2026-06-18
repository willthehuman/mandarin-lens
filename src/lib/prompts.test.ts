import { describe, expect, it } from "vitest";

import { buildSystemPrompt, buildUserPrompt } from "./prompts";

describe("buildUserPrompt", () => {
  it("labels the page URL as reference only and keeps the selected text last", () => {
    const prompt = buildUserPrompt({
      kind: "text",
      text: "translate this sentence",
      pageUrl: "https://example.com/some/long/article"
    });

    expect(prompt).toContain("For reference only");
    expect(prompt).toContain("Do not translate the URL");

    const urlIndex = prompt.indexOf("https://example.com/some/long/article");
    const textIndex = prompt.indexOf("Selected text to analyze:");
    expect(urlIndex).toBeGreaterThan(-1);
    expect(textIndex).toBeGreaterThan(urlIndex);
    expect(prompt.trimEnd().endsWith("translate this sentence")).toBe(true);
  });

  it("omits the page URL line when no pageUrl is provided", () => {
    const prompt = buildUserPrompt({ kind: "text", text: "translate this sentence" });

    expect(prompt).not.toContain("For reference only");
    expect(prompt).toContain("Selected text to analyze:");
  });

  it("labels the page URL as reference only for image requests", () => {
    const prompt = buildUserPrompt({
      kind: "image",
      srcUrl: "https://example.com/cat.png",
      pageUrl: "https://example.com/some/long/article"
    });

    expect(prompt).toContain("For reference only");
    expect(prompt).toContain("Image URL: https://example.com/cat.png");
    expect(prompt.indexOf("https://example.com/some/long/article")).toBeLessThan(
      prompt.indexOf("Image URL:")
    );
  });

  it("only requests character breakdowns when enabled", () => {
    const defaultPrompt = buildSystemPrompt();
    const enabledSystemPrompt = buildSystemPrompt({ includeCharacterBreakdown: true });
    const enabledUserPrompt = buildUserPrompt(
      {
        kind: "text",
        text: "good morning"
      },
      { includeCharacterBreakdown: true }
    );

    expect(defaultPrompt).not.toContain('"characterBreakdown"');
    expect(enabledSystemPrompt).toContain('"characterBreakdown"');
    expect(enabledUserPrompt).toContain("per-character meanings");
  });
});
