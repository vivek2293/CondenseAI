import { toSummarizeFailure } from "../shared/errors";
import { createLogger } from "../shared/logger";
import {
  isExtractPageTextMessage,
  MessageType,
  type ExtractedPage,
} from "../shared/messages";
import { extractPageText } from "./extractPageText";

const log = createLogger("content");

declare global {
  interface Window {
    __condenseAIContentScriptLoaded?: boolean;
  }
}

function pushExtractionResult(requestId: string, page: ExtractedPage): void {
  void chrome.runtime.sendMessage({
    type: MessageType.PAGE_EXTRACTED,
    requestId,
    page,
  });
  log.info("Pushed PAGE_EXTRACTED to background", {
    requestId,
    url: page.url,
    method: page.method,
    textLength: page.text.length,
  });
}

function pushExtractionFailure(requestId: string, code: string, message: string): void {
  void chrome.runtime.sendMessage({
    type: MessageType.PAGE_EXTRACT_FAILED,
    requestId,
    code,
    message,
  });
  log.warn("Pushed PAGE_EXTRACT_FAILED to background", { requestId, code, message });
}

if (window.__condenseAIContentScriptLoaded) {
  log.debug("Content script already registered, skipping duplicate listener");
} else {
  window.__condenseAIContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (!isExtractPageTextMessage(message)) {
      return false;
    }

    const { requestId } = message;
    const endTimer = log.time("extract page text");
    log.info("Extraction requested", {
      requestId,
      url: document.location?.href,
      title: document.title,
    });

    try {
      const page = extractPageText(document);
      pushExtractionResult(requestId, page);
    } catch (error) {
      const failure = toSummarizeFailure(error);
      pushExtractionFailure(requestId, failure.code, failure.message);
    } finally {
      endTimer();
    }

    return false;
  });

  log.debug("Content script listener registered");
}
