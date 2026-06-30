import { describe, expect, it } from "vitest";
import { truncate } from "../src/shared/truncate";

describe("truncate", () => {
  it("returns text unchanged when under limit", () => {
    expect(truncate("hello world", 100)).toBe("hello world");
  });

  it("truncates at word boundary when possible", () => {
    const text = "one two three four five six seven eight nine ten";
    const result = truncate(text, 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it("truncates at limit when no good word boundary", () => {
    const text = "abcdefghijklmnopqrstuvwxyz";
    const result = truncate(text, 10);
    expect(result).toBe("abcdefghij…");
  });
});
