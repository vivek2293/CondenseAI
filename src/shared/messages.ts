export const MessageType = {
  SUMMARIZE_ACTIVE_TAB: "SUMMARIZE_ACTIVE_TAB",
  EXTRACT_PAGE_TEXT: "EXTRACT_PAGE_TEXT",
  PAGE_EXTRACTED: "PAGE_EXTRACTED",
  PAGE_EXTRACT_FAILED: "PAGE_EXTRACT_FAILED",
  ASK_FOLLOW_UP: "ASK_FOLLOW_UP",
  CANCEL_JOB: "CANCEL_JOB",
  TOGGLE_PANEL: "TOGGLE_PANEL",
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

/** Generic ack used by fire-and-forget control messages (cancel, etc.). */
export interface AckResponse {
  ok: true;
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
  /** Tab the panel is attached to — the panel knows this directly, no active-tab lookup needed. */
  tabId: number;
  tabUrl: string;
}

export interface AskFollowUpMessage {
  type: typeof MessageType.ASK_FOLLOW_UP;
  question: string;
  conversationHistory: ChatMessage[];
  /** Tab that owns this follow-up — jobs are scoped per tab. */
  tabId: number;
}

/** Panel → Background: abort the in-flight job for a specific tab (if any). */
export interface CancelJobMessage {
  type: typeof MessageType.CANCEL_JOB;
  tabId: number;
}

/** Background → Content script: mount/reveal the floating panel for this tab. */
export interface TogglePanelMessage {
  type: typeof MessageType.TOGGLE_PANEL;
  tabId: number;
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

/** Messages the panel sends to the background service worker. */
export type BackgroundInboundMessage =
  | SummarizeActiveTabMessage
  | AskFollowUpMessage
  | CancelJobMessage;

/** Messages the background receives from the content script. */
export type BackgroundContentMessage = PageExtractedMessage | PageExtractFailedMessage;

/** Messages the background dispatches to the content script. */
export type ContentInboundMessage = ExtractPageTextMessage | TogglePanelMessage;

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
    (message as AskFollowUpMessage).type === MessageType.ASK_FOLLOW_UP &&
    typeof (message as AskFollowUpMessage).tabId === "number"
  );
}

export function isCancelJobMessage(message: unknown): message is CancelJobMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as CancelJobMessage).type === MessageType.CANCEL_JOB &&
    typeof (message as CancelJobMessage).tabId === "number"
  );
}

export function isTogglePanelMessage(message: unknown): message is TogglePanelMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as TogglePanelMessage).type === MessageType.TOGGLE_PANEL
  );
}

export function isSummarizeActiveTabMessage(
  message: unknown,
): message is SummarizeActiveTabMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as SummarizeActiveTabMessage).type === MessageType.SUMMARIZE_ACTIVE_TAB &&
    typeof (message as SummarizeActiveTabMessage).tabId === "number" &&
    typeof (message as SummarizeActiveTabMessage).tabUrl === "string"
  );
}
