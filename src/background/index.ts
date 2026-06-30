import contentScript from "../content/index.ts?script";
import { createProvider } from "../providers";
import { getConfig } from "../shared/config";
import { AppError, ErrorCode, getUserMessage, toSummarizeFailure } from "../shared/errors";
import { createLogger } from "../shared/logger";
import {
  isAskFollowUpMessage,
  isPageExtractFailedMessage,
  isPageExtractedMessage,
  MessageType,
  type BackgroundContentMessage,
  type BackgroundInboundMessage,
  type ChatMessage,
  type ExtractedPage,
  type FollowUpResponse,
  type SummarizeResponse,
} from "../shared/messages";
import { buildChatMessages, buildFollowUpContext } from "../shared/prompt";
import { sanitizeQuestion } from "../shared/sanitize";
import { truncate } from "../shared/truncate";
import { delay } from "../shared/delay";
import {
  cancelPageExtraction,
  createRequestId,
  dispatchExtractionRequest,
  rejectPageExtraction,
  resolvePageExtraction,
  waitForPageExtraction,
} from "./extractionBridge";
import { savePopupSession } from "../shared/popupSession";

const log = createLogger("background");

const TAB_QUERY_RETRIES = 3;
const TAB_QUERY_RETRY_DELAY_MS = 150;
const EXTRACTION_RETRIES = 3;
const EXTRACTION_RETRY_DELAY_MS = 400;
const OLLAMA_RETRIES = 2;
const OLLAMA_RETRY_DELAY_MS = 1_500;

async function getActiveTab() {
  for (let attempt = 1; attempt <= TAB_QUERY_RETRIES; attempt++) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.id) {
      if (tab.url || attempt === TAB_QUERY_RETRIES) {
        log.debug("Active tab resolved", {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          attempt,
        });
        return tab;
      }

      log.warn("Active tab URL not ready yet, retrying", {
        tabId: tab.id,
        attempt,
      });
    } else {
      log.warn("No active tab with id, retrying", { attempt });
    }

    if (attempt < TAB_QUERY_RETRIES) {
      await delay(TAB_QUERY_RETRY_DELAY_MS);
    }
  }

  log.warn("Failed to resolve active tab after retries");
  throw new AppError(ErrorCode.RESTRICTED_PAGE, getUserMessage(ErrorCode.RESTRICTED_PAGE));
}

function isRestrictedUrl(url?: string): boolean {
  if (!url) {
    // URL may be unavailable briefly on first popup open; allow extraction to proceed.
    return false;
  }
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  );
}

function isRetriableExtractionError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  return (
    error.code === ErrorCode.TIMEOUT ||
    error.code === ErrorCode.UNKNOWN
  );
}

async function injectContentScript(tabId: number): Promise<void> {
  const endTimer = log.time("content-script injection");
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScript],
    });
    log.info("Content script injected", { tabId, script: contentScript });
  } finally {
    endTimer();
  }
}

function isMissingContentScriptError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("could not establish connection") ||
    message.includes("receiving end does not exist")
  );
}

function mapExtractionError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isMissingContentScriptError(error)) {
    return new AppError(
      ErrorCode.UNKNOWN,
      "Could not reach the page. Refresh the tab and try again.",
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AppError(
    ErrorCode.UNKNOWN,
    message || "Could not extract page content. Try refreshing the page and summarizing again.",
  );
}

async function extractPageFromTab(tabId: number): Promise<ExtractedPage> {
  const endTimer = log.time("page extraction");
  let lastError: unknown;
  let activeRequestId: string | null = null;

  try {
    for (let attempt = 1; attempt <= EXTRACTION_RETRIES; attempt++) {
      const requestId = createRequestId();
      activeRequestId = requestId;

      try {
        log.info("Starting page extraction attempt", { tabId, requestId, attempt });
        const extractionPromise = waitForPageExtraction(requestId);
        await dispatchExtractionRequest(tabId, requestId, injectContentScript);
        const page = await extractionPromise;
        activeRequestId = null;
        log.info("Page extraction succeeded", {
          tabId,
          requestId,
          attempt,
          method: page.method,
          textLength: page.text.length,
        });
        return page;
      } catch (error) {
        if (activeRequestId) {
          cancelPageExtraction(activeRequestId);
          activeRequestId = null;
        }

        lastError = error;

        if (error instanceof AppError && !isRetriableExtractionError(error)) {
          throw error;
        }

        log.warn("Page extraction attempt failed", {
          tabId,
          requestId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof AppError ? error.code : undefined,
        });

        if (attempt < EXTRACTION_RETRIES) {
          await delay(EXTRACTION_RETRY_DELAY_MS);
        }
      }
    }

    throw mapExtractionError(lastError);
  } finally {
    if (activeRequestId) {
      cancelPageExtraction(activeRequestId);
    }
    endTimer();
  }
}

function handleContentMessage(message: BackgroundContentMessage): void {
  if (isPageExtractedMessage(message)) {
    resolvePageExtraction(message.requestId, message.page);
    return;
  }

  if (isPageExtractFailedMessage(message)) {
    rejectPageExtraction(message.requestId, message.code, message.message);
  }
}

async function callWithOllamaRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= OLLAMA_RETRIES; attempt++) {
    try {
      log.info(`${label} attempt`, { attempt, maxAttempts: OLLAMA_RETRIES });
      return await fn();
    } catch (error) {
      lastError = error;

      const retriable =
        error instanceof AppError && error.code === ErrorCode.PROVIDER_UNAVAILABLE;

      log.warn(`${label} attempt failed`, {
        attempt,
        retriable,
        code: error instanceof AppError ? error.code : undefined,
        message: error instanceof Error ? error.message : String(error),
      });

      if (!retriable || attempt === OLLAMA_RETRIES) {
        throw error;
      }

      log.info(`${label} retrying after delay`, {
        attempt,
        delayMs: OLLAMA_RETRY_DELAY_MS,
      });
      await delay(OLLAMA_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

async function summarizeActiveTab(): Promise<SummarizeResponse> {
  const endTimer = log.time("summarize pipeline");
  log.info("Summarize pipeline started");

  let tabUrl = "";
  let tabId: number | undefined;

  try {
    const tab = await getActiveTab();
    if (!tab.id) {
      throw new AppError(ErrorCode.RESTRICTED_PAGE, getUserMessage(ErrorCode.RESTRICTED_PAGE));
    }

    tabId = tab.id;
    tabUrl = tab.url ?? "";

    if (isRestrictedUrl(tab.url)) {
      log.warn("Restricted page blocked", { url: tab.url, tabId: tab.id });
      throw new AppError(ErrorCode.RESTRICTED_PAGE, getUserMessage(ErrorCode.RESTRICTED_PAGE));
    }

    await savePopupSession({
      status: "loading",
      tabUrl,
      tabId,
    });

    if (!tab.url) {
      log.warn("Active tab URL unavailable; proceeding with content-script extraction", {
        tabId: tab.id,
      });
    }

    log.info("Extracting page content", { tabId, url: tab.url ?? "(unknown)" });
    const page = await extractPageFromTab(tabId);
    tabUrl = page.url || tabUrl;

    const config = await getConfig();
    const text = truncate(page.text, config.maxInputChars);

    log.info("Calling LLM for summarization", {
      provider: config.provider,
      model: config.model,
      ...log.tokens(text.length),
      truncated: text.length < page.text.length,
    });

    const provider = createProvider(config);
    const summarizeTimer = log.time("provider summarize");
    const summary = await callWithOllamaRetry("Ollama summarize", () =>
      provider.summarize(text, {
        title: page.title,
        url: page.url,
        timeoutMs: config.requestTimeoutMs,
      }),
    );
    summarizeTimer();

    log.info("Summarize pipeline succeeded", {
      tabId: tab.id,
      pageTitle: page.title,
      extractionMethod: page.method,
      ...log.tokens(summary.length),
    });

    // Build compact 3-turn context for follow-ups (no raw page text, no question yet)
    const conversationHistory: ChatMessage[] = buildFollowUpContext(page.title, summary);

    await savePopupSession({
      status: "done",
      tabUrl,
      tabId,
      pageTitle: page.title,
      summary,
      conversationHistory,
      qaThread: [],
    });

    return {
      ok: true,
      summary,
      pageTitle: page.title,
      extractionMethod: page.method,
      conversationHistory,
    };
  } catch (error) {
    const failure = toSummarizeFailure(error);
    log.error("Summarize pipeline failed", error, { code: failure.code });

    if (tabId) {
      await savePopupSession({
        status: "error",
        tabUrl,
        tabId,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
    }

    throw error;
  } finally {
    endTimer();
  }
}

async function handleFollowUp(
  question: string,
  conversationHistory: ChatMessage[],
): Promise<FollowUpResponse> {
  const endTimer = log.time("follow-up pipeline");
  const safeQuestion = sanitizeQuestion(question);
  const contextChars = conversationHistory.reduce((sum, m) => sum + m.content.length, 0);

  log.info("Follow-up pipeline started", {
    question: safeQuestion,
    questionChars: safeQuestion.length,
    ...log.tokens(safeQuestion.length),
    historyTurns: conversationHistory.length,
    contextChars,
    ...log.tokens(contextChars),
  });

  try {
    const config = await getConfig();
    const provider = createProvider(config);

    const result = await callWithOllamaRetry("Ollama follow-up", () =>
      provider.askFollowUp(safeQuestion, conversationHistory, {
        timeoutMs: config.requestTimeoutMs,
      }),
    );

    log.info("Follow-up pipeline succeeded", {
      question: safeQuestion,
      ...log.tokens(result.answer.length),
      historyTurns: result.conversationHistory.length,
    });

    return {
      ok: true,
      answer: result.answer,
      conversationHistory: result.conversationHistory,
    };
  } catch (error) {
    const failure = toSummarizeFailure(error);
    log.error("Follow-up pipeline failed", error, {
      code: failure.code,
      question: safeQuestion,
    });
    return { ok: false, ...failure };
  } finally {
    endTimer();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isPageExtractedMessage(message) || isPageExtractFailedMessage(message)) {
    handleContentMessage(message);
    return false;
  }

  if (isAskFollowUpMessage(message)) {
    log.info("Received follow-up request", {
      question: message.question,
      historyTurns: message.conversationHistory.length,
    });
    handleFollowUp(message.question, message.conversationHistory)
      .then((result) => {
        log.info("Sending follow-up response", {
          ok: result.ok,
          ...(result.ok
            ? {
                answerChars: result.answer.length,
                historyTurns: result.conversationHistory.length,
              }
            : { code: result.code, message: result.message }),
        });
        sendResponse(result);
      });
    return true;
  }

  if ((message as BackgroundInboundMessage).type !== MessageType.SUMMARIZE_ACTIVE_TAB) {
    return false;
  }

  log.info("Received summarize request");

  // Acknowledge immediately so closing the popup (e.g. on tab switch) does not
  // cancel the in-flight job. Results are delivered via chrome.storage.session.
  void summarizeActiveTab().catch((error) => {
    const failure = toSummarizeFailure(error);
    log.warn("Summarize job failed", failure);
  });

  sendResponse({ ok: true, started: true } satisfies SummarizeResponse);
  return false;
});
