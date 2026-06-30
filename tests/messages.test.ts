import { describe, expect, it } from "vitest";
import {
  isExtractPageTextMessage,
  isPageExtractFailedMessage,
  isPageExtractedMessage,
  MessageType,
} from "../src/shared/messages";

describe("message type guards", () => {
  it("identifies EXTRACT_PAGE_TEXT messages", () => {
    expect(
      isExtractPageTextMessage({
        type: MessageType.EXTRACT_PAGE_TEXT,
        requestId: "abc-123",
      }),
    ).toBe(true);
    expect(isExtractPageTextMessage({ type: MessageType.SUMMARIZE_ACTIVE_TAB })).toBe(false);
  });

  it("identifies PAGE_EXTRACTED messages", () => {
    expect(
      isPageExtractedMessage({
        type: MessageType.PAGE_EXTRACTED,
        requestId: "abc-123",
        page: { title: "T", url: "https://x.com", text: "body", method: "readability" },
      }),
    ).toBe(true);
    expect(isPageExtractedMessage({ type: MessageType.PAGE_EXTRACT_FAILED })).toBe(false);
  });

  it("identifies PAGE_EXTRACT_FAILED messages", () => {
    expect(
      isPageExtractFailedMessage({
        type: MessageType.PAGE_EXTRACT_FAILED,
        requestId: "abc-123",
        code: "EMPTY_PAGE",
        message: "empty",
      }),
    ).toBe(true);
    expect(isPageExtractFailedMessage({ type: MessageType.PAGE_EXTRACTED })).toBe(false);
  });
});

describe("MessageType constants", () => {
  it("includes async push message types", () => {
    expect(MessageType.PAGE_EXTRACTED).toBe("PAGE_EXTRACTED");
    expect(MessageType.PAGE_EXTRACT_FAILED).toBe("PAGE_EXTRACT_FAILED");
  });
});
