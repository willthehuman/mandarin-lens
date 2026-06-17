const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const LATIN_RE = /[A-Za-z]/g;

export function containsCjk(text: string): boolean {
  return CJK_RE.test(text);
}

export function isLikelyMandarin(text: string): boolean {
  const cjkCount = text.match(CJK_RE)?.length ?? 0;
  const latinCount = text.match(LATIN_RE)?.length ?? 0;

  if (cjkCount === 0) {
    return false;
  }

  return cjkCount >= latinCount || cjkCount >= 3;
}
