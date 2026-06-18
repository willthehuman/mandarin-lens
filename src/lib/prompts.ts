import { isLikelyMandarin } from "./language";
import type { AnalysisRequest } from "./types";

export interface PromptOptions {
  includeCharacterBreakdown?: boolean;
}

export function resultSchemaDescription(options: PromptOptions = {}): string {
  const characterBreakdown = options.includeCharacterBreakdown
    ? ', "characterBreakdown": [{ "hanzi": "字", "pinyin": "zi4 with tone marks preferred", "english": "character meaning", "notes": "optional brief note" }]'
    : "";

  return `{
  "inputLanguage": "English | Mandarin | Mixed | Unknown",
  "sourceText": "original text or concise image-derived source phrase. If the selected text is Mandarin, copy it exactly.",
  "mandarin": "Simplified Chinese text. If source text is already Mandarin, copy the Mandarin source exactly without changing, paraphrasing, transliterating, or replacing characters.",
  "pinyin": "Mandarin pinyin with tone marks. Do not mix hanzi into this field.",
  "literalMeaning": "literal word-by-word English meaning",
  "naturalEnglish": "natural English meaning",
  "wordBreakdown": [
    { "hanzi": "词", "pinyin": "ci2 with tone marks preferred", "english": "meaning", "pos": "part of speech abbreviation, e.g. n., v., adj., adv., conj., part.", "notes": "brief learner note"${characterBreakdown} }
  ],
  "grammarNotes": ["short grammar note"],
  "usageNotes": ["short usage, tone, cultural, or register note"],
  "imageDescription": "only for image requests; concise English description of the image",
  "warnings": ["uncertainty, ambiguity, OCR issue, or model limitation"]
}`;
}

export const RESULT_SCHEMA_DESCRIPTION = resultSchemaDescription();

export function buildSystemPrompt(options: PromptOptions = {}): string {
  return [
    "You are Mandarin Lens, a careful Mandarin learning assistant.",
    "Return only valid JSON. Do not wrap the JSON in markdown.",
    "Use Simplified Chinese for Mandarin output and pinyin with tone marks.",
    "Explain in concise English for adult learners.",
    "If the selected text is already Mandarin, skip translation and analyze the source text as Mandarin.",
    "For Mandarin source text, sourceText and mandarin must be an exact character-for-character copy of the selected text.",
    "Never rewrite, paraphrase, romanize, transliterate, or substitute characters in existing Mandarin source text.",
    "If translating from English or another language, provide natural Mandarin first, then learning details.",
    "Any page URL or surrounding context is reference only. Never translate it or include it in sourceText, mandarin, or the word breakdown.",
    "Prefer useful vocabulary segmentation over character-by-character breakdown unless a single character is meaningful.",
    options.includeCharacterBreakdown
      ? "For each multi-character word, include characterBreakdown with each character's pinyin and standalone meaning when useful."
      : "Do not include characterBreakdown unless explicitly requested.",
    "The response must match this schema exactly enough for a parser to consume it:",
    resultSchemaDescription(options)
  ].join("\n");
}

export function buildUserPrompt(request: AnalysisRequest, options: PromptOptions = {}): string {
  const characterBreakdownInstruction = options.includeCharacterBreakdown
    ? "For multi-character words, include per-character meanings inside characterBreakdown when each character has a useful standalone meaning."
    : "";

  if (request.kind === "image") {
    return [
      "Analyze the image for a Mandarin learner.",
      "First describe what is visible in English.",
      "Then provide a concise Mandarin description or useful Mandarin vocabulary related to the image.",
      "Include pinyin, literal meaning, natural English meaning, word breakdown, grammar notes, and usage notes.",
      characterBreakdownInstruction,
      request.pageUrl
        ? `For reference only, this image appeared on the page ${request.pageUrl}. Do not translate the URL or include it in any output field.`
        : "",
      `Image URL: ${request.srcUrl}`
    ]
      .filter(Boolean)
      .join("\n");
  }

  const sourceIsMandarin = isLikelyMandarin(request.text);
  return [
    sourceIsMandarin
      ? "The selected text is Mandarin. Do not translate it. Copy it exactly into sourceText and mandarin, then analyze it directly."
      : "Translate the selected text into natural Simplified Chinese, then analyze the Mandarin.",
    "Include pinyin, literal meaning, natural English meaning, word breakdown, grammar notes, and usage notes.",
    characterBreakdownInstruction,
    request.pageUrl
      ? `For reference only, this text appeared on the page ${request.pageUrl}. Do not translate the URL or include it in any output field.`
      : "",
    `Selected text to analyze:\n${request.text}`
  ]
    .filter(Boolean)
    .join("\n");
}
