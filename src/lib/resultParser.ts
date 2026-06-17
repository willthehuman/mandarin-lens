import { pinyin as convertToPinyin } from "pinyin-pro";

import { containsCjk, isLikelyMandarin } from "./language";
import type { AnalysisRequest, AnalysisResult, ProviderName, WordBreakdownItem } from "./types";

interface ResultMetadata {
  provider: ProviderName;
  model: string;
}

export function parseAnalysisResult(
  content: string,
  request: AnalysisRequest,
  metadata: ResultMetadata
): AnalysisResult {
  const raw = parseJsonObject(content);
  return normalizeAnalysisResult(raw, request, metadata);
}

export function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      return JSON.parse(fenced.trim());
    }

    const extracted = extractFirstJsonObject(trimmed);
    if (extracted) {
      return JSON.parse(extracted);
    }
  }

  throw new Error("The model response was not valid JSON. Try a model with JSON mode or lower temperature.");
}

export function normalizeAnalysisResult(
  raw: unknown,
  request: AnalysisRequest,
  metadata: ResultMetadata
): AnalysisResult {
  if (!isRecord(raw)) {
    throw new Error("The model returned JSON, but it was not an object.");
  }

  const sourceIsMandarin = request.kind === "text" && isLikelyMandarin(request.text);
  const rawMandarin = toString(raw.mandarin);
  const mandarin = sourceIsMandarin ? request.text : rawMandarin;
  const warnings = toStringArray(raw.warnings);

  if (sourceIsMandarin && rawMandarin && rawMandarin !== request.text) {
    warnings.push("The model rewrote the selected Mandarin text; Mandarin Lens preserved the original selection instead.");
  }

  const wordBreakdown = toArray(raw.wordBreakdown)
    .map((item) => normalizeWordBreakdownItem(item))
    .filter((item): item is WordBreakdownItem => Boolean(item));

  return {
    inputLanguage: sourceIsMandarin ? "Mandarin" : toString(raw.inputLanguage) || "Unknown",
    sourceText: sourceIsMandarin ? request.text : toString(raw.sourceText) || fallbackSourceText(request),
    mandarin,
    pinyin: normalizePinyin(mandarin, toString(raw.pinyin)),
    literalMeaning: toString(raw.literalMeaning),
    naturalEnglish: toString(raw.naturalEnglish),
    wordBreakdown,
    grammarNotes: toStringArray(raw.grammarNotes),
    usageNotes: toStringArray(raw.usageNotes),
    imageDescription: request.kind === "image" ? toString(raw.imageDescription) : undefined,
    warnings,
    provider: metadata.provider,
    model: metadata.model,
    createdAt: new Date().toISOString()
  };
}

function normalizeWordBreakdownItem(raw: unknown): WordBreakdownItem | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const hanzi = toString(raw.hanzi);
  const pinyin = toString(raw.pinyin);
  const english = toString(raw.english);

  if (!hanzi && !pinyin && !english) {
    return undefined;
  }

  return {
    hanzi,
    pinyin: normalizePinyin(hanzi, pinyin),
    english,
    notes: toString(raw.notes) || undefined
  };
}

function normalizePinyin(hanzi: string, modelPinyin: string): string {
  if (!containsCjk(hanzi)) {
    return modelPinyin;
  }

  try {
    return convertToPinyin(hanzi);
  } catch {
    return modelPinyin;
  }
}

function extractFirstJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");

  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function fallbackSourceText(request: AnalysisRequest): string {
  return request.kind === "text" ? request.text : request.srcUrl;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown): string[] {
  return toArray(value)
    .map((item) => toString(item))
    .filter(Boolean);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
