import { describe, expect, it } from "vitest";
import { sanitizeQuestion, sanitizeText, sanitizeTitle } from "../src/shared/sanitize";

describe("sanitizeTitle", () => {
  it("trims and strips control characters", () => {
    expect(sanitizeTitle("  Hello\u0000World\t!  ")).toBe("HelloWorld\t!");
  });

  it("caps length at 300 characters", () => {
    const long = "a".repeat(400);
    expect(sanitizeTitle(long).length).toBe(300);
  });
});

describe("sanitizeText", () => {
  it("strips control characters but keeps newlines", () => {
    expect(sanitizeText("line1\nline2\u0007")).toBe("line1\nline2");
  });
});

describe("sanitizeQuestion", () => {
  it("trims and caps length at 1000 characters", () => {
    expect(sanitizeQuestion("  hi  ")).toBe("hi");
    expect(sanitizeQuestion("q".repeat(1500)).length).toBe(1000);
  });
});
