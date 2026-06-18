# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mandarin Lens is a Chrome Manifest V3 extension for Mandarin learners. Users select text or right-click an image on any page, choose a context-menu item, and get a side-panel analysis (Simplified Chinese, pinyin, word breakdowns, grammar/usage notes). Analysis runs against a local Ollama server (default) or OpenRouter.

## Commands

```bash
npm run build        # tsc --noEmit type check, then vite build into dist/
npm run dev          # Vite dev server on 127.0.0.1 (web UI iteration only; not a loaded extension)
npm test             # vitest run (one shot)
npm run test:watch   # vitest watch
npx vitest run src/lib/resultParser.test.ts   # run a single test file
```

There is no separate lint step; type checking happens inside `npm run build`.

Loading the extension: run `npm run build`, then in `chrome://extensions` (Developer mode on) Load unpacked → select `dist/`. Click the reload icon after each rebuild.

## Architecture

The extension is split across three entry points wired up in `vite.config.ts` (`background`, `options`, `sidepanel`) plus shared code in `src/lib/`. The non-obvious flows:

**Context menu → side panel handoff (the core constraint).** The background service worker (`src/background/index.ts`) registers context menus and, on click, must call `chrome.sidePanel.open()` *synchronously inside the user-gesture handler* — opening the panel cannot be awaited behind other async work or Chrome rejects it. The worker does NOT run the model request itself, because MV3 service workers get suspended during slow local inference. Instead it writes a `loading` status and the panel takes over.

**Status passed through `chrome.storage.local`, not just messages.** State flows as an `AnalysisStatus` discriminated union (`idle | loading | result | error`, see `src/lib/types.ts`). The background worker and side panel both call `saveAnalysisStatus` / `getAnalysisStatus` (`src/lib/settings.ts`). Messages (`ANALYSIS_STARTED/RESULT/ERROR`) are best-effort notifications; the persisted status is the source of truth so the panel renders correctly even if it loads after the message fired. When editing the status lifecycle, update both the persisted write and the message dispatch.

**The side panel runs the actual analysis.** `src/sidepanel/main.ts` watches for a `loading` status and calls `analyzeRequest` (`src/lib/providers.ts`) from the long-lived panel page. `activeAnalysisKey` dedupes so a given (startedAt, provider, model, request) tuple only runs once even if both the storage read and the incoming message trigger it. Retry rebuilds a fresh `loading` status from current settings.

**Provider adapters** (`src/lib/providers.ts`) normalize Ollama and OpenRouter to one `AnalysisResult`. Ollama uses `/api/chat` with `stream:false, format:"json"`, and the configured `think` value; images are fetched and sent as base64 (`blob:` URLs are rejected — the worker can't fetch them). OpenRouter uses the OpenAI-compatible chat completions endpoint with `response_format: json_object` and `image_url` content. Side-panel model requests do not abort at the analysis timeout; the panel owns that timer and offers Continue waiting while the original request keeps running. Connection tests still request abort-on-timeout behavior. HTTP 403 from Ollama is specifically translated into the `OLLAMA_ORIGINS` guidance message.

**Result parsing is defensive** (`src/lib/resultParser.ts`). Models don't reliably emit clean JSON, so `parseJsonObject` tries raw parse → fenced ```json``` block → brace-matched first object. `normalizeAnalysisResult` coerces every field and drops empty word-breakdown rows. Two important behaviors:
- If the source text `isLikelyMandarin` (`src/lib/language.ts`), the original selection is preserved verbatim as `mandarin`/`sourceText`; if the model rewrote it, the original is kept and a warning is added. The prompt also instructs the model not to alter existing Mandarin.
- Pinyin for any CJK string is recomputed locally via `pinyin-pro` rather than trusting the model; the model's pinyin is only a fallback for non-CJK content.

**Prompts** live in `src/lib/prompts.ts`. `RESULT_SCHEMA_DESCRIPTION` is the JSON contract embedded in the system prompt — keep it in sync with the `AnalysisResult` shape in `types.ts` and the coercion in `resultParser.ts`.

**Settings** (`src/lib/settings.ts`) always pass through `normalizeSettings` on read and write (trims trailing slash on base URL, migrates legacy default Ollama model names in `LEGACY_DEFAULT_OLLAMA_MODELS`, clamps analysis timeout, etc.). Defaults: provider `ollama`, model `gemma4:e4b-it-qat`, base URL `http://localhost:11434`, Ollama thinking off, analysis timeout 180 seconds.

`src/lib/dom.ts` provides a tiny `h()` / `replaceChildren()` helper — the UI is hand-built DOM, no framework.

## Tests

Unit tests sit beside their source (`*.test.ts`) and cover the pure logic: `resultParser`, `providers` (with an injected `Fetcher`), and `language`. Provider functions accept a `fetcher = fetch` parameter specifically so tests can pass a mock — preserve that injection point when adding network code.

## Release

`.github/workflows/release-build.yml` runs on every push to `main`: tests → build → zip `dist/` into `mandarin-lens-chrome-extension.zip` → force-update the `latest` git tag and GitHub release. The workflow asserts the zip contains `manifest.json`, `background.js`, `options.html`, `sidepanel.html`, and `assets/*`, so renaming entry outputs (configured in `vite.config.ts`) will break the release check.
