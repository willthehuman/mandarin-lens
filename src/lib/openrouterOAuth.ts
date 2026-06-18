type Fetcher = typeof fetch;

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_AUTH_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
const CODE_VERIFIER_BYTE_LENGTH = 64;

interface OpenRouterKeyResponse {
  key?: string;
  error?: string | { message?: string };
}

export async function connectOpenRouterWithOAuth(fetcher: Fetcher = fetch): Promise<string> {
  const callbackUrl = chrome.identity.getRedirectURL("openrouter");
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createS256CodeChallenge(codeVerifier);
  const authUrl = buildOpenRouterAuthUrl(callbackUrl, codeChallenge);
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });
  const code = parseOpenRouterOAuthCallback(redirectUrl);

  return exchangeOpenRouterCodeForKey(code, codeVerifier, fetcher);
}

export function buildOpenRouterAuthUrl(callbackUrl: string, codeChallenge: string): string {
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function parseOpenRouterOAuthCallback(callbackUrl: string | undefined): string {
  if (!callbackUrl) {
    throw new Error("OpenRouter did not return an OAuth callback URL.");
  }

  const url = new URL(callbackUrl);
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(`OpenRouter OAuth failed: ${error}`);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("OpenRouter OAuth did not return an authorization code.");
  }

  return code;
}

export function createCodeVerifier(bytes: Uint8Array = randomBytes(CODE_VERIFIER_BYTE_LENGTH)): string {
  return base64UrlEncode(bytes);
}

export async function createS256CodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

export async function exchangeOpenRouterCodeForKey(
  code: string,
  codeVerifier: string,
  fetcher: Fetcher = fetch
): Promise<string> {
  const response = await fetcher(OPENROUTER_AUTH_KEYS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: "S256"
    })
  });

  const responseText = await response.text();
  const data = responseText ? parseKeyResponse(responseText) : {};

  if (!response.ok) {
    throw new Error(keyResponseError(data) || `OpenRouter OAuth returned HTTP ${response.status}.`);
  }

  if (!data.key) {
    throw new Error("OpenRouter OAuth did not return an API key.");
  }

  return data.key;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function parseKeyResponse(responseText: string): OpenRouterKeyResponse {
  try {
    return JSON.parse(responseText) as OpenRouterKeyResponse;
  } catch {
    return {
      error: responseText.trim()
    };
  }
}

function keyResponseError(data: OpenRouterKeyResponse): string | undefined {
  if (typeof data.error === "string") {
    return data.error;
  }

  return data.error?.message;
}
