import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "../src/shared/errors";
import {
  clearPendingExtractionsForTests,
  createRequestId,
  getPendingExtractionCountForTests,
  rejectPageExtraction,
  resolvePageExtraction,
  waitForPageExtraction,
} from "../src/background/extractionBridge";

describe("extractionBridge", () => {
  afterEach(() => {
    clearPendingExtractionsForTests();
    vi.restoreAllMocks();
  });

  it("creates unique request ids", () => {
    const a = createRequestId();
    const b = createRequestId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("resolves waitForPageExtraction when PAGE_EXTRACTED arrives", async () => {
    const requestId = "test-request-1";
    const page = {
      title: "Test",
      url: "https://example.com",
      text: "Hello world content here",
      method: "readability" as const,
    };

    const promise = waitForPageExtraction(requestId, 5000);
    expect(getPendingExtractionCountForTests()).toBe(1);

    resolvePageExtraction(requestId, page);

    await expect(promise).resolves.toEqual(page);
    expect(getPendingExtractionCountForTests()).toBe(0);
  });

  it("rejects waitForPageExtraction when PAGE_EXTRACT_FAILED arrives", async () => {
    const requestId = "test-request-2";
    const promise = waitForPageExtraction(requestId, 5000);

    rejectPageExtraction(requestId, ErrorCode.EMPTY_PAGE, "No content");

    await expect(promise).rejects.toMatchObject({
      code: ErrorCode.EMPTY_PAGE,
      message: "No content",
    });
    expect(getPendingExtractionCountForTests()).toBe(0);
  });

  it("times out when no push message is received", async () => {
    vi.useFakeTimers();
    const requestId = "test-request-3";
    const promise = waitForPageExtraction(requestId, 1000);

    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT });
    expect(getPendingExtractionCountForTests()).toBe(0);
    vi.useRealTimers();
  });

  it("ignores unknown requestId on resolve/reject", () => {
    expect(() =>
      resolvePageExtraction("unknown", {
        title: "T",
        url: "https://x.com",
        text: "text",
        method: "body",
      }),
    ).not.toThrow();
    expect(() => rejectPageExtraction("unknown", ErrorCode.EMPTY_PAGE, "x")).not.toThrow();
  });
});
