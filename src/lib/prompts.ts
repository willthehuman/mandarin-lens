import { isLikelyMandarin } from "./language";
import type { AnalysisRequest } from "./types";

export const RESULT_SCHEMA_DESCRIPTION = `{
  "inputLanguage": "English | Mandarin | Mixed | Unknown",
  "sourceText": "original text or concise image-derived source phrase",
  "mandarin": "Simplified Chinese text. If source text is already Mandarin, copy the Mandarin source here.",
  "pinyin": "Mandarin pinyin with tone marks",
  "literalMeaning": "literal word-by-word English meaning",
  "naturalEnglish": "natural English meaning",
  "wordBreakdown": [
    { "hanzi": "词", "pinyin": "ci2 with tone marks preferred", "english": "meaning", "notes": "brief learner note" }
  ],
  "grammarNotes": ["short grammar note"],
  "usageNotes": ["short usage, tone, cultural, or register note"],
  "imageDescription": "only for image requests; concise English description of the image",
  "warnings": ["uncertainty, ambiguity, OCR issue, or model limitation"]
}`;

export function buildSystemPrompt(): string {
  return [
    "You are Mandarin Lens, a careful Mandarin learning assistant.",
    "Return only valid JSON. Do not wrap the JSON in markdown.",
    "Use Simplified Chinese for Mandarin output and pinyin with tone marks.",
    "Explain in concise English for adult learners.",
    "If the selected text is already Mandarin, skip translation and analyze the source text as Mandarin.",
    "If translating from English or another language, provide natural Mandarin first, then learning details.",
    "Prefer useful vocabulary segmentation over character-by-character breakdown unless a single character is meaningful.",
    "The response must match this schema exactly enough for a parser to consume it:",
    RESULT_SCHEMA_DESCRIPTION
  ].join("\n");
}

export function buildUserPrompt(request: AnalysisRequest): string {
  if (request.kind === "image") {
    return [
      "Analyze the image for a Mandarin learner.",
      "First describe what is visible in English.",
      "Then provide a concise Mandarin description or useful Mandarin vocabulary related to the image.",
      "Include pinyin, literal meaning, natural English meaning, word breakdown, grammar notes, and usage notes.",
      `Image URL: ${request.srcUrl}`,
      request.pageUrl ? `Page URL: ${request.pageUrl}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  const sourceIsMandarin = isLikelyMandarin(request.text);
  return [
    sourceIsMandarin
      ? "The selected text appears to already contain Mandarin. Do not translate it; analyze it directly."
      : "Translate the selected text into natural Simplified Chinese, then analyze the Mandarin.",
    "Include pinyin, literal meaning, natural English meaning, word breakdown, grammar notes, and usage notes.",
    `Selected text:\n${request.text}`,
    request.pageUrl ? `Page URL: ${request.pageUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
