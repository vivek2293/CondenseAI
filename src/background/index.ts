import contentScript from "../content/index.ts?script";
import { createProvider } from "../providers";
import { getConfig } from "../shared/config";
import { AppError, ErrorCode, getUserMessage, toSummarizeFailure } from "../shared/errors";
import { createLogger } from "../shared/logger";
import {
  isAskFollowUpMessage,
  isCancelJobMessage,
  isPageExtractFailedMessage,
  isPageExtractedMessage,
  isSummarizeActiveTabMessage,
  MessageType,
  type AckResponse,
  type BackgroundContentMessage,
  type ChatMessage,
  type ExtractedPage,
  type FollowUpResponse,
  type SummarizeResponse,
} from "../shared/messages";
import { buildChatMessages, buildFollowUpContext } from "../shared/prompt";
import { sanitizeQuestion } from "../shared/sanitize";
import { truncate } from "../shared/truncate";
import { delay, delayUnlessAborted } from "../shared/delay";
import {
  cancelPageExtraction,
  createRequestId,
  dispatchExtractionRequest,
  rejectPageExtraction,
  resolvePageExtraction,
  waitForPageExtraction,
} from "./extractionBridge";
import {
  clearPopupSession,
  loadPopupSession,
  savePopupSession,
  type PopupSession,
} from "../shared/popupSession";

const log = createLogger("background");

const EXTRACTION_RETRIES = 3;
const EXTRACTION_RETRY_DELAY_MS = 400;
const OLLAMA_RETRIES = 2;
const OLLAMA_RETRY_DELAY_MS = 1_500;
const POST_INJECT_SETTLE_MS = 300;

// Panel UI runs in a content-script / untrusted context. Session storage is
// service-worker-only by default — open it so the panel can read/write popupState.
void chrome.storage.session
  .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
  .then(() => {
    log.info("chrome.storage.session accessible from content scripts");
  })
  .catch((error) => {
    log.warn("Failed to expose chrome.storage.session to content scripts", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

// ── Cancelable job registry (per tab) ────────────────────────────────────────
//
// Each tab can run at most one summarize/follow-up job. Tabs do not cancel each
// other. Starting a new request in the *same* tab supersedes that tab's job so
// Reset / double-Summarize stays idempotent.

interface ActiveJob {
  id: number;
  tabId: number;
  controller: AbortController;
  extractionRequestId: string | null;
}

let jobCounter = 0;
const activeJobs = new Map<number, ActiveJob>();

function cancelActiveJob(tabId: number, reason: string): boolean {
  const job = activeJobs.get(tabId);
  if (!job) {
    return false;
  }

  activeJobs.delete(tabId);
  job.controller.abort();
  if (job.extractionRequestId) {
    rejectPageExtraction(job.extractionRequestId, ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED));
    job.extractionRequestId = null;
  }
  log.info("Cancelled active job", { jobId: job.id, tabId, reason });
  return true;
}

function startJob(tabId: number): ActiveJob {
  cancelActiveJob(tabId, "superseded by new request");
  const job: ActiveJob = {
    id: ++jobCounter,
    tabId,
    controller: new AbortController(),
    extractionRequestId: null,
  };
  activeJobs.set(tabId, job);
  return job;
}

function isCurrentJob(job: ActiveJob): boolean {
  return activeJobs.get(job.tabId)?.id === job.id;
}

/**
 * Write session state only while this job still owns the tab. If we lose
 * ownership mid-write, undo only when the stored row still carries our jobId
 * so a newer job's session is never cleared.
 */
async function commitPopupSession(
  job: ActiveJob,
  session: Omit<PopupSession, "jobId">,
): Promise<boolean> {
  if (!isCurrentJob(job)) {
    return false;
  }

  await savePopupSession({ ...session, jobId: job.id });

  if (isCurrentJob(job)) {
    return true;
  }

  const latest = await loadPopupSession(job.tabId);
  if (latest?.jobId === job.id) {
    await clearPopupSession(job.tabId);
    log.info("Undid stale session write after job lost ownership", {
      jobId: job.id,
      tabId: job.tabId,
      status: session.status,
    });
  }
  return false;
}

function finishJob(job: ActiveJob): void {
  if (activeJobs.get(job.tabId)?.id === job.id) {
    activeJobs.delete(job.tabId);
  }
}

function throwIfJobCancelled(job: ActiveJob): void {
  if (job.controller.signal.aborted || !isCurrentJob(job)) {
    throw new AppError(ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED));
  }
}

function isRestrictedUrl(url?: string): boolean {
  if (!url) {
    // URL may be unavailable briefly on first load; allow extraction to proceed.
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

  // Never retry user cancel / superseded jobs.
  if (error.code === ErrorCode.CANCELLED) {
    return false;
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

async function extractPageFromTab(tabId: number, job: ActiveJob): Promise<ExtractedPage> {
  const endTimer = log.time("page extraction");
  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= EXTRACTION_RETRIES; attempt++) {
      throwIfJobCancelled(job);

      const requestId = createRequestId();
      job.extractionRequestId = requestId;

      try {
        log.info("Starting page extraction attempt", { tabId, requestId, attempt });
        const extractionPromise = waitForPageExtraction(requestId);
        await dispatchExtractionRequest(tabId, requestId, injectContentScript);
        const page = await extractionPromise;
        job.extractionRequestId = null;
        log.info("Page extraction succeeded", {
          tabId,
          requestId,
          attempt,
          method: page.method,
          textLength: page.text.length,
        });
        return page;
      } catch (error) {
        if (job.extractionRequestId) {
          cancelPageExtraction(job.extractionRequestId);
          job.extractionRequestId = null;
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
          throwIfJobCancelled(job);
          await delayUnlessAborted(EXTRACTION_RETRY_DELAY_MS, job.controller.signal);
          throwIfJobCancelled(job);
        }
      }
    }

    throw mapExtractionError(lastError);
  } finally {
    if (job.extractionRequestId) {
      cancelPageExtraction(job.extractionRequestId);
      job.extractionRequestId = null;
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
  signal: AbortSignal,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= OLLAMA_RETRIES; attempt++) {
    if (signal.aborted) {
      throw new AppError(ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED));
    }

    try {
      log.info(`${label} attempt`, { attempt, maxAttempts: OLLAMA_RETRIES });
      return await fn();
    } catch (error) {
      lastError = error;

      if (error instanceof AppError && error.code === ErrorCode.CANCELLED) {
        throw error;
      }

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
      await delayUnlessAborted(OLLAMA_RETRY_DELAY_MS, signal);
    }
  }

  throw lastError;
}

async function summarizeActiveTab(
  job: ActiveJob,
  tabId: number,
  tabUrl: string,
): Promise<SummarizeResponse> {
  const endTimer = log.time("summarize pipeline");
  log.info("Summarize pipeline started", { tabId, tabUrl });

  try {
    if (isRestrictedUrl(tabUrl)) {
      log.warn("Restricted page blocked", { url: tabUrl, tabId });
      throw new AppError(ErrorCode.RESTRICTED_PAGE, getUserMessage(ErrorCode.RESTRICTED_PAGE));
    }

    if (!(await commitPopupSession(job, { status: "loading", tabUrl, tabId }))) {
      throw new AppError(ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED));
    }

    log.info("Extracting page content", { tabId, url: tabUrl });
    const page = await extractPageFromTab(tabId, job);
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
    const summary = await callWithOllamaRetry("Ollama summarize", job.controller.signal, () =>
      provider.summarize(text, {
        title: page.title,
        url: page.url,
        timeoutMs: config.requestTimeoutMs,
        signal: job.controller.signal,
      }),
    );
    summarizeTimer();

    log.info("Summarize pipeline succeeded", {
      tabId,
      pageTitle: page.title,
      extractionMethod: page.method,
      ...log.tokens(summary.length),
    });

    // Build compact 3-turn context for follow-ups (no raw page text, no question yet)
    const conversationHistory: ChatMessage[] = buildFollowUpContext(page.title, summary);

    if (
      !(await commitPopupSession(job, {
        status: "done",
        tabUrl,
        tabId,
        pageTitle: page.title,
        summary,
        conversationHistory,
        qaThread: [],
      }))
    ) {
      log.info("Summarize job cancelled/superseded; discarding result", { jobId: job.id, tabId });
      return { ok: true, summary, pageTitle: page.title, extractionMethod: page.method, conversationHistory };
    }

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

    if (!isCurrentJob(job) || failure.code === ErrorCode.CANCELLED) {
      log.info("Summarize job cancelled/superseded; suppressing error session", {
        jobId: job.id,
        tabId,
        code: failure.code,
      });
      throw error;
    }

    await commitPopupSession(job, {
      status: "error",
      tabUrl,
      tabId,
      errorCode: failure.code,
      errorMessage: failure.message,
    });

    throw error;
  } finally {
    finishJob(job);
    endTimer();
  }
}

async function handleFollowUp(
  question: string,
  conversationHistory: ChatMessage[],
  job: ActiveJob,
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

    const result = await callWithOllamaRetry("Ollama follow-up", job.controller.signal, () =>
      provider.askFollowUp(safeQuestion, conversationHistory, {
        timeoutMs: config.requestTimeoutMs,
        signal: job.controller.signal,
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
    finishJob(job);
    endTimer();
  }
}

// ── Floating panel toggle (toolbar icon click) ───────────────────────────────

async function togglePanelInTab(tabId: number): Promise<void> {
  const message = { type: MessageType.TOGGLE_PANEL, tabId };

  try {
    await chrome.tabs.sendMessage(tabId, message);
    log.info("Toggled panel", { tabId });
    return;
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      log.warn("Could not toggle panel", { tabId, error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }

  try {
    log.info("Content script not reachable, injecting before toggling panel", { tabId });
    await injectContentScript(tabId);
    await delay(POST_INJECT_SETTLE_MS);
    await chrome.tabs.sendMessage(tabId, message);
    log.info("Toggled panel after injection", { tabId });
  } catch (error) {
    log.warn("Panel unavailable on this page", {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    log.warn("Action clicked but tab has no id");
    return;
  }
  void togglePanelInTab(tab.id);
});

// ── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isPageExtractedMessage(message) || isPageExtractFailedMessage(message)) {
    handleContentMessage(message);
    return false;
  }

  if (isCancelJobMessage(message)) {
    const cancelled = cancelActiveJob(message.tabId, "cancelled by user");
    log.info("Cancel job requested", { tabId: message.tabId, cancelled });
    sendResponse({ ok: true } satisfies AckResponse);
    return false;
  }

  if (isAskFollowUpMessage(message)) {
    log.info("Received follow-up request", {
      question: message.question,
      historyTurns: message.conversationHistory.length,
      tabId: message.tabId,
    });
    const job = startJob(message.tabId);
    handleFollowUp(message.question, message.conversationHistory, job)
      .then((result) => {
        log.info("Sending follow-up response", {
          ok: result.ok,
          tabId: message.tabId,
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

  if (!isSummarizeActiveTabMessage(message)) {
    return false;
  }

  log.info("Received summarize request", { tabId: message.tabId, tabUrl: message.tabUrl });

  // Acknowledge immediately so closing/reopening the panel does not cancel the
  // in-flight job. Results are delivered via chrome.storage.session (per tab).
  const job = startJob(message.tabId);
  void summarizeActiveTab(job, message.tabId, message.tabUrl).catch((error) => {
    const failure = toSummarizeFailure(error);
    log.warn("Summarize job failed", { ...failure, tabId: message.tabId });
  });

  sendResponse({ ok: true, started: true } satisfies SummarizeResponse);
  return false;
});
