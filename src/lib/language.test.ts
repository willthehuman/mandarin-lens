import { describe, expect, it } from "vitest";

import { containsCjk, isLikelyMandarin } from "./language";

describe("language helpers", () => {
  it("detects CJK text", () => {
    expect(containsCjk("你好")).toBe(true);
    expect(containsCjk("hello")).toBe(false);
  });

  it("treats Mandarin-heavy text as Mandarin", () => {
    expect(isLikelyMandarin("我想喝咖啡")).toBe(true);
    expect(isLikelyMandarin("hello 你好")).toBe(false);
    expect(isLikelyMandarin("translate this sentence")).toBe(false);
  });
});
