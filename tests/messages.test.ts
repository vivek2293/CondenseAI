import { describe, expect, it } from "vitest";
import {
  isAskFollowUpMessage,
  isCancelJobMessage,
  isExtractPageTextMessage,
  isPageExtractFailedMessage,
  isPageExtractedMessage,
  isSummarizeActiveTabMessage,
  isTogglePanelMessage,
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

describe("isAskFollowUpMessage", () => {
  it("identifies ASK_FOLLOW_UP messages with tabId", () => {
    expect(
      isAskFollowUpMessage({
        type: MessageType.ASK_FOLLOW_UP,
        question: "why?",
        conversationHistory: [],
        tabId: 4,
      }),
    ).toBe(true);
    expect(
      isAskFollowUpMessage({
        type: MessageType.ASK_FOLLOW_UP,
        question: "why?",
        conversationHistory: [],
      }),
    ).toBe(false);
  });
});

describe("isCancelJobMessage", () => {
  it("identifies CANCEL_JOB messages with tabId", () => {
    expect(isCancelJobMessage({ type: MessageType.CANCEL_JOB, tabId: 3 })).toBe(true);
    expect(isCancelJobMessage({ type: MessageType.CANCEL_JOB })).toBe(false);
    expect(isCancelJobMessage({ type: MessageType.ASK_FOLLOW_UP })).toBe(false);
    expect(isCancelJobMessage(null)).toBe(false);
    expect(isCancelJobMessage(undefined)).toBe(false);
  });
});

describe("isTogglePanelMessage", () => {
  it("identifies TOGGLE_PANEL messages", () => {
    expect(isTogglePanelMessage({ type: MessageType.TOGGLE_PANEL, tabId: 7 })).toBe(true);
    expect(isTogglePanelMessage({ type: MessageType.CANCEL_JOB })).toBe(false);
  });
});

describe("isSummarizeActiveTabMessage", () => {
  it("identifies SUMMARIZE_ACTIVE_TAB messages carrying tabId/tabUrl", () => {
    expect(
      isSummarizeActiveTabMessage({
        type: MessageType.SUMMARIZE_ACTIVE_TAB,
        tabId: 3,
        tabUrl: "https://example.com",
      }),
    ).toBe(true);
    expect(isSummarizeActiveTabMessage({ type: MessageType.SUMMARIZE_ACTIVE_TAB })).toBe(false);
    expect(isSummarizeActiveTabMessage({ type: MessageType.ASK_FOLLOW_UP })).toBe(false);
  });
});
