import { describe, expect, it } from "vitest";
import { createProvider } from "../src/providers";
import { OllamaProvider } from "../src/providers/ollama";
import type { AppConfig } from "../src/shared/config";
import { DEFAULT_CONFIG } from "../src/shared/config";
import { AppError, ErrorCode } from "../src/shared/errors";

describe("createProvider", () => {
  it("returns OllamaProvider for ollama", () => {
    const provider = createProvider(DEFAULT_CONFIG);
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it("throws UNKNOWN for unsupported provider types", () => {
    const bad = { ...DEFAULT_CONFIG, provider: "nope" as AppConfig["provider"] };
    try {
      createProvider(bad);
      expect.unreachable("expected createProvider to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: ErrorCode.UNKNOWN });
    }
  });
});
