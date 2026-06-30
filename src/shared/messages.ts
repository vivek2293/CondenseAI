export const MessageType = {
  SUMMARIZE_ACTIVE_TAB: "SUMMARIZE_ACTIVE_TAB",
  EXTRACT_PAGE_TEXT: "EXTRACT_PAGE_TEXT",
  PAGE_EXTRACTED: "PAGE_EXTRACTED",
  PAGE_EXTRACT_FAILED: "PAGE_EXTRACT_FAILED",
  ASK_FOLLOW_UP: "ASK_FOLLOW_UP",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export type ExtractionMethod = "readability" | "body";

/** A single turn in an Ollama-style chat conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ExtractedPage {
  title: string;
  url: string;
  text: string;
  method: ExtractionMethod;
}

export interface SummarizeSuccess {
  ok: true;
  summary: string;
  pageTitle: string;
  extractionMethod: ExtractionMethod;
  /** Compact conversation history for follow-up questions (no raw page text). */
  conversationHistory: ChatMessage[];
}

export interface SummarizeFailure {
  ok: false;
  code: string;
  message: string;
}

export interface SummarizeStarted {
  ok: true;
  started: true;
}

export type SummarizeResponse = SummarizeSuccess | SummarizeFailure | SummarizeStarted;

export function isSummarizeStarted(
  response: SummarizeResponse,
): response is SummarizeStarted {
  return response.ok === true && "started" in response && response.started === true;
}

export interface FollowUpSuccess {
  ok: true;
  answer: string;
  /** Updated conversation history including this Q&A turn. */
  conversationHistory: ChatMessage[];
}

export type FollowUpResponse = FollowUpSuccess | SummarizeFailure;

export interface SummarizeActiveTabMessage {
  type: typeof MessageType.SUMMARIZE_ACTIVE_TAB;
}

export interface AskFollowUpMessage {
  type: typeof MessageType.ASK_FOLLOW_UP;
  question: string;
  conversationHistory: ChatMessage[];
}

export interface ExtractPageTextMessage {
  type: typeof MessageType.EXTRACT_PAGE_TEXT;
  requestId: string;
}

export interface PageExtractedMessage {
  type: typeof MessageType.PAGE_EXTRACTED;
  requestId: string;
  page: ExtractedPage;
}

export interface PageExtractFailedMessage {
  type: typeof MessageType.PAGE_EXTRACT_FAILED;
  requestId: string;
  code: string;
  message: string;
}

/** Messages the popup sends to the background service worker. */
export type BackgroundInboundMessage = SummarizeActiveTabMessage | AskFollowUpMessage;

/** Messages the background receives from the content script. */
export type BackgroundContentMessage = PageExtractedMessage | PageExtractFailedMessage;

/** Messages the background dispatches to the content script. */
export type ContentInboundMessage = ExtractPageTextMessage;

/** Messages the content script pushes to the background. */
export type ContentOutboundMessage = PageExtractedMessage | PageExtractFailedMessage;

export function isPageExtractedMessage(
  message: unknown,
): message is PageExtractedMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as PageExtractedMessage).type === MessageType.PAGE_EXTRACTED
  );
}

export function isPageExtractFailedMessage(
  message: unknown,
): message is PageExtractFailedMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as PageExtractFailedMessage).type === MessageType.PAGE_EXTRACT_FAILED
  );
}

export function isExtractPageTextMessage(
  message: unknown,
): message is ExtractPageTextMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as ExtractPageTextMessage).type === MessageType.EXTRACT_PAGE_TEXT
  );
}

export function isAskFollowUpMessage(
  message: unknown,
): message is AskFollowUpMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as AskFollowUpMessage).type === MessageType.ASK_FOLLOW_UP
  );
}
