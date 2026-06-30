import { Readability } from "@mozilla/readability";
import { AppError, ErrorCode, getUserMessage } from "../shared/errors";
import { createLogger } from "../shared/logger";
import type { ExtractedPage, ExtractionMethod } from "../shared/messages";

const log = createLogger("content");
const MIN_TEXT_LENGTH = 2;

function normalizeWhitespace(text: string): string {
  if (!text) {
    return "";
  }
  return text.replace(/\s+/g, " ").trim();
}

function extractWithReadability(doc: Document): string | null {
  try {
    const clone = doc.cloneNode(true) as Document;
    const reader = new Readability(clone);
    const article = reader.parse();

    if (!article?.textContent) {
      return null;
    }

    const text = normalizeWhitespace(article.textContent);
    return text.length >= MIN_TEXT_LENGTH ? text : null;
  } catch (error) {
    log.warn("Readability extraction failed, will fall back to body text", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function extractFromBody(doc: Document): string {
  if (!doc.body) {
    return "";
  }

  const innerText = normalizeWhitespace(doc.body.innerText ?? "");
  if (innerText.length >= MIN_TEXT_LENGTH) {
    return innerText;
  }

  return normalizeWhitespace(doc.body.textContent ?? "");
}

export function extractPageText(doc: Document = document): ExtractedPage {
  const title = doc.title || "Untitled";
  const url = doc.location?.href ?? "";

  let text = extractWithReadability(doc);
  let method: ExtractionMethod = "readability";

  if (!text) {
    log.debug("Readability result too short or empty, falling back to body text");
    text = extractFromBody(doc);
    method = "body";
  }

  if (!text || text.length < MIN_TEXT_LENGTH) {
    log.warn("No readable content found", { url, method, textLength: text?.length ?? 0 });
    throw new AppError(ErrorCode.EMPTY_PAGE, getUserMessage(ErrorCode.EMPTY_PAGE));
  }

  log.debug("Extraction method selected", { method, textLength: text.length });

  return { title, url, text, method };
}
