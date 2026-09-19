import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama";
import { ErrorCode } from "../src/shared/errors";

const config = {
  provider: "ollama" as const,
  ollamaBaseUrl: "http://localhost:11434",
  model: "llama3.1",
  requestTimeoutMs: 5000,
};

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /api/chat with correct payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: "- Point one\n- Point two" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider(config);
    const result = await provider.summarize("Page content here.", {
      title: "Title",
      url: "https://example.com",
      timeoutMs: 5000,
    });

    expect(result).toBe("- Point one\n- Point two");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("llama3.1");
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
  });

  it("throws MODEL_NOT_FOUND on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: "model not found" }),
      }),
    );

    const provider = new OllamaProvider(config);

    await expect(
      provider.summarize("text", {
        title: "T",
        url: "https://x.com",
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.MODEL_NOT_FOUND });
  });

  it("throws PROVIDER_UNAVAILABLE on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const provider = new OllamaProvider(config);

    await expect(
      provider.summarize("text", {
        title: "T",
        url: "https://x.com",
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PROVIDER_UNAVAILABLE });
  });

  it("throws CANCELLED when the external signal aborts the request (Reset)", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      ),
    );

    const provider = new OllamaProvider(config);
    const pending = provider.summarize("text", {
      title: "T",
      url: "https://x.com",
      timeoutMs: 5000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: ErrorCode.CANCELLED });
  });

  it("throws TIMEOUT (not CANCELLED) when only the timeout fires", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      ),
    );

    const provider = new OllamaProvider(config);
    const pending = provider.summarize("text", {
      title: "T",
      url: "https://x.com",
      timeoutMs: 1000,
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: ErrorCode.TIMEOUT });

    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    vi.useRealTimers();
  });

  it("cancels a pending follow-up via the external signal", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      ),
    );

    const provider = new OllamaProvider(config);
    const pending = provider.askFollowUp("question?", [], {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: ErrorCode.CANCELLED });
  });

  it("askFollowUp returns answer and appends history on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: "Because reasons." } }),
      }),
    );

    const provider = new OllamaProvider(config);
    const history = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "ctx" },
      { role: "assistant" as const, content: "ok" },
    ];

    const result = await provider.askFollowUp("Why?", history, { timeoutMs: 5000 });
    expect(result.answer).toBe("Because reasons.");
    expect(result.conversationHistory.at(-1)).toEqual({
      role: "assistant",
      content: "Because reasons.",
    });
    expect(result.conversationHistory.at(-2)).toMatchObject({ role: "user" });
  });
});
