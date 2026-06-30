import { describe, expect, it } from "vitest";
import {
  buildOllamaApiUrl,
  getOllamaBaseUrlCandidates,
  normalizeOllamaBaseUrl,
} from "../src/shared/ollamaUrl";

describe("ollamaUrl", () => {
  it("defaults invalid URLs to 127.0.0.1", () => {
    expect(normalizeOllamaBaseUrl("")).toBe("http://127.0.0.1:11434");
    expect(normalizeOllamaBaseUrl("not-a-url")).toBe("http://127.0.0.1:11434");
  });

  it("normalizes trailing slashes", () => {
    expect(normalizeOllamaBaseUrl("http://localhost:11434/")).toBe("http://localhost:11434");
  });

  it("provides localhost and 127.0.0.1 fallbacks", () => {
    expect(getOllamaBaseUrlCandidates("http://localhost:11434")).toEqual([
      "http://localhost:11434",
      "http://127.0.0.1:11434",
    ]);
  });

  it("builds API URLs", () => {
    expect(buildOllamaApiUrl("http://localhost:11434/", "/api/chat")).toBe(
      "http://localhost:11434/api/chat",
    );
  });
});
