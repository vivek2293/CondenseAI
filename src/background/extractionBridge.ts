import { AppError, ErrorCode, getUserMessage } from "../shared/errors";
import { createLogger } from "../shared/logger";
import { delay } from "../shared/delay";
import { MessageType, type ExtractedPage } from "../shared/messages";

const log = createLogger("extraction-bridge");

const DEFAULT_EXTRACTION_TIMEOUT_MS = 30_000;
const POST_INJECT_SETTLE_MS = 300;
const SEND_MESSAGE_RETRIES = 5;
const SEND_MESSAGE_RETRY_DELAY_MS = 250;

interface PendingExtraction {
  resolve: (page: ExtractedPage) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const pendingExtractions = new Map<string, PendingExtraction>();

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function cancelPageExtraction(requestId: string): void {
  const pending = pendingExtractions.get(requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingExtractions.delete(requestId);
  log.debug("Cancelled pending extraction", { requestId });
}

export function waitForPageExtraction(
  requestId: string,
  timeoutMs = DEFAULT_EXTRACTION_TIMEOUT_MS,
): Promise<ExtractedPage> {
  if (pendingExtractions.has(requestId)) {
    return Promise.reject(new Error(`Extraction already pending for requestId: ${requestId}`));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingExtractions.delete(requestId);
      log.warn("Page extraction timed out", { requestId, timeoutMs });
      reject(
        new AppError(
          ErrorCode.TIMEOUT,
          "Page extraction timed out. Refresh the page and try again.",
        ),
      );
    }, timeoutMs);

    pendingExtractions.set(requestId, { resolve, reject, timeoutId });
    log.debug("Waiting for PAGE_EXTRACTED", { requestId, timeoutMs });
  });
}

export function resolvePageExtraction(requestId: string, page: ExtractedPage): void {
  const pending = pendingExtractions.get(requestId);
  if (!pending) {
    log.warn("Received PAGE_EXTRACTED for unknown requestId", { requestId });
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingExtractions.delete(requestId);
  log.info("Received PAGE_EXTRACTED", {
    requestId,
    title: page.title,
    method: page.method,
    textLength: page.text.length,
  });
  pending.resolve(page);
}

export function rejectPageExtraction(requestId: string, code: string, message: string): void {
  const pending = pendingExtractions.get(requestId);
  if (!pending) {
    log.warn("Received PAGE_EXTRACT_FAILED for unknown requestId", { requestId, code });
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingExtractions.delete(requestId);
  log.warn("Received PAGE_EXTRACT_FAILED", { requestId, code, message });
  pending.reject(new AppError(code as ErrorCode, message));
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

export async function dispatchExtractionRequest(
  tabId: number,
  requestId: string,
  injectContentScript: (tabId: number) => Promise<void>,
): Promise<void> {
  const message = { type: MessageType.EXTRACT_PAGE_TEXT, requestId };

  async function trySend(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SEND_MESSAGE_RETRIES; attempt++) {
      try {
        await chrome.tabs.sendMessage(tabId, message);
        log.info("Dispatched EXTRACT_PAGE_TEXT", { tabId, requestId, attempt });
        return;
      } catch (error) {
        lastError = error;
        if (!isMissingContentScriptError(error) || attempt === SEND_MESSAGE_RETRIES) {
          throw error;
        }
        log.warn("Content script not ready, retrying sendMessage", {
          tabId,
          requestId,
          attempt,
        });
        await delay(SEND_MESSAGE_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  try {
    await trySend();
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      log.error("Failed to dispatch EXTRACT_PAGE_TEXT", error, { tabId, requestId });
      throw error;
    }

    log.info("Content script not reachable, injecting and retrying", { tabId, requestId });
    await injectContentScript(tabId);
    await delay(POST_INJECT_SETTLE_MS);
    await trySend();
    log.info("Dispatched EXTRACT_PAGE_TEXT after injection", { tabId, requestId });
  }
}

/** Visible for tests only — clears all pending extractions. */
export function clearPendingExtractionsForTests(): void {
  for (const pending of pendingExtractions.values()) {
    clearTimeout(pending.timeoutId);
  }
  pendingExtractions.clear();
}

/** Visible for tests only — returns count of pending extractions. */
export function getPendingExtractionCountForTests(): number {
  return pendingExtractions.size;
}
