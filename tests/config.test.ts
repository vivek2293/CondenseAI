import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, getConfig, saveConfig } from "../src/shared/config";
import { installChromeMock } from "./chromeMock";

describe("config", () => {
  let mock: ReturnType<typeof installChromeMock>;

  afterEach(() => {
    mock?.restore();
  });

  it("returns defaults when storage is empty", async () => {
    mock = installChromeMock();
    await expect(getConfig()).resolves.toMatchObject({
      provider: DEFAULT_CONFIG.provider,
      model: DEFAULT_CONFIG.model,
      maxInputChars: DEFAULT_CONFIG.maxInputChars,
    });
  });

  it("merges stored overrides and sanitizes invalid numbers", async () => {
    mock = installChromeMock();
    mock.syncStore.set("appConfig", {
      model: "  mistral  ",
      maxInputChars: -1,
      requestTimeoutMs: 0,
    });

    const config = await getConfig();
    expect(config.model).toBe("mistral");
    expect(config.maxInputChars).toBe(DEFAULT_CONFIG.maxInputChars);
    expect(config.requestTimeoutMs).toBe(DEFAULT_CONFIG.requestTimeoutMs);
  });

  it("saveConfig merges and persists", async () => {
    mock = installChromeMock();
    const updated = await saveConfig({ model: "phi3" });
    expect(updated.model).toBe("phi3");
    expect(mock.syncStore.get("appConfig")).toMatchObject({ model: "phi3" });
  });
});
