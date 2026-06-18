import { describe, expect, it, vi } from "vitest";

import {
  base64UrlEncode,
  buildOpenRouterAuthUrl,
  createCodeVerifier,
  createS256CodeChallenge,
  exchangeOpenRouterCodeForKey,
  parseOpenRouterOAuthCallback
} from "./openrouterOAuth";

describe("OpenRouter OAuth helpers", () => {
  it("builds a PKCE auth URL", () => {
    const url = new URL(buildOpenRouterAuthUrl("https://abc.chromiumapp.org/openrouter", "challenge"));

    expect(url.origin).toBe("https://openrouter.ai");
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("callback_url")).toBe("https://abc.chromiumapp.org/openrouter");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("creates URL-safe PKCE verifier and challenge values", async () => {
    const verifier = createCodeVerifier(new Uint8Array(64).fill(7));
    const challenge = await createS256CodeChallenge(verifier);

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64UrlEncode(new Uint8Array([255, 238, 221]))).toBe("_-7d");
  });

  it("parses callback codes and rejects callback errors", () => {
    expect(parseOpenRouterOAuthCallback("https://abc.chromiumapp.org/openrouter?code=abc123")).toBe("abc123");
    expect(() => parseOpenRouterOAuthCallback(undefined)).toThrow(/callback URL/);
    expect(() => parseOpenRouterOAuthCallback("https://abc.chromiumapp.org/openrouter?error=access_denied")).toThrow(
      /access_denied/
    );
    expect(() => parseOpenRouterOAuthCallback("https://abc.chromiumapp.org/openrouter")).toThrow(/authorization code/);
  });

  it("exchanges an authorization code for a key", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        code: "code123",
        code_verifier: "verifier123",
        code_challenge_method: "S256"
      });
      return Response.json({ key: "sk-or-oauth" });
    }) as unknown as typeof fetch;

    await expect(exchangeOpenRouterCodeForKey("code123", "verifier123", fetcher)).resolves.toBe("sk-or-oauth");
  });

  it("rejects key exchange responses without a key", async () => {
    const fetcher = vi.fn(async () => Response.json({})) as unknown as typeof fetch;

    await expect(exchangeOpenRouterCodeForKey("code123", "verifier123", fetcher)).rejects.toThrow(/API key/);
  });
});
