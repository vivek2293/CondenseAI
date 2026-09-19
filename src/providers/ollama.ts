import { AppError, ErrorCode, getUserMessage, isNetworkFetchError, mapFetchError } from "../shared/errors";
import { createLogger } from "../shared/logger";
import { buildChatMessages, wrapQuestion } from "../shared/prompt";
import type { ChatMessage } from "../shared/messages";
import {
  buildOllamaApiUrl,
  getOllamaBaseUrlCandidates,
} from "../shared/ollamaUrl";
import type {
  FollowUpOptions,
  FollowUpResult,
  ProviderConfig,
  SummarizeOptions,
  SummarizerProvider,
} from "./types";

const log = createLogger("ollama");

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

async function fetchOllamaChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  maxOutputTokens: number,
  signal: AbortSignal,
): Promise<OllamaChatResponse> {
  const url = buildOllamaApiUrl(baseUrl, "/api/chat");
  const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  log.info("Calling Ollama chat API", {
    url,
    model,
    messageCount: messages.length,
    ...log.tokens(inputChars),
    maxOutputTokens,
  });

  const endTimer = log.time("ollama fetch");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { num_predict: maxOutputTokens },
    }),
    signal,
  });
  endTimer();

  if (!response.ok) {
    const body = await response.text();
    log.warn("Ollama returned HTTP error", { url, status: response.status, body });
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      detail = parsed.error ?? body;
    } catch {
      // use raw body
    }

    if (response.status === 404 || detail.toLowerCase().includes("not found")) {
      throw new AppError(
        ErrorCode.MODEL_NOT_FOUND,
        `Model not found. Run \`ollama pull ${model}\`.`,
      );
    }

    throw new AppError(
      ErrorCode.UNKNOWN,
      detail || getUserMessage(ErrorCode.UNKNOWN),
    );
  }

  return (await response.json()) as OllamaChatResponse;
}

async function tryOllamaCandidates(
  candidates: string[],
  model: string,
  messages: ChatMessage[],
  maxOutputTokens: number,
  controller: AbortController,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<string> {
  let lastError: unknown;

  for (const baseUrl of candidates) {
    try {
      log.debug("Trying Ollama base URL", { baseUrl });
      const data = await fetchOllamaChat(
        baseUrl,
        model,
        messages,
        maxOutputTokens,
        controller.signal,
      );

      if (data.error) {
        if (data.error.toLowerCase().includes("model")) {
          throw new AppError(
            ErrorCode.MODEL_NOT_FOUND,
            `Model not found. Run \`ollama pull ${model}\`.`,
          );
        }
        throw new AppError(ErrorCode.UNKNOWN, data.error);
      }

      const content = data.message?.content?.trim();
      if (!content) {
        throw new AppError(ErrorCode.UNKNOWN, getUserMessage(ErrorCode.UNKNOWN));
      }

      log.info("Ollama response received", {
        baseUrl,
        model,
        ...log.tokens(content.length),
      });
      return content;
    } catch (error) {
      lastError = error;

      if (error instanceof AppError) {
        log.warn("Ollama call failed with app error", {
          baseUrl,
          code: error.code,
          message: error.message,
        });
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        if (externalSignal?.aborted) {
          log.info("Ollama request cancelled by user", { baseUrl });
          throw new AppError(ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED));
        }
        log.error("Ollama request timed out", error, { baseUrl, timeoutMs });
        throw mapFetchError(error, model, baseUrl);
      }

      if (!isNetworkFetchError(error)) {
        log.error("Unexpected Ollama error", error, { baseUrl });
        throw error;
      }

      log.warn("Ollama network error, trying next candidate", {
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw mapFetchError(lastError, model, candidates.join(" or "));
}

export class OllamaProvider implements SummarizerProvider {
  constructor(private readonly config: ProviderConfig) {}

  async summarize(text: string, options: SummarizeOptions): Promise<string> {
    const timeoutMs = options.timeoutMs || this.config.requestTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort);

    const messages = buildChatMessages({ title: options.title, url: options.url, text });
    const candidates = getOllamaBaseUrlCandidates(this.config.ollamaBaseUrl);

    log.info("Ollama summarize started", {
      model: this.config.model,
      candidates,
      ...log.tokens(text.length),
      timeoutMs,
    });

    try {
      return await tryOllamaCandidates(
        candidates,
        this.config.model,
        messages,
        this.config.maxOutputTokens,
        controller,
        timeoutMs,
        options.signal,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapFetchError(error, this.config.model, candidates[0]);
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  async askFollowUp(
    question: string,
    conversationHistory: ChatMessage[],
    options: FollowUpOptions,
  ): Promise<FollowUpResult> {
    const timeoutMs = options.timeoutMs || this.config.requestTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort);

    const messages: ChatMessage[] = [
      ...conversationHistory,
      { role: "user", content: wrapQuestion(question) },
    ];
    const candidates = getOllamaBaseUrlCandidates(this.config.ollamaBaseUrl);
    const contextChars = messages.reduce((sum, m) => sum + m.content.length, 0);

    log.info("Ollama follow-up started", {
      model: this.config.model,
      question,
      turns: messages.length,
      ...log.tokens(contextChars),
      timeoutMs,
    });

    try {
      const answer = await tryOllamaCandidates(
        candidates,
        this.config.model,
        messages,
        this.config.maxOutputTokens,
        controller,
        timeoutMs,
        options.signal,
      );

      const newHistory: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: answer },
      ];

      log.info("Ollama follow-up succeeded", {
        model: this.config.model,
        question,
        historyTurns: newHistory.length,
        ...log.tokens(answer.length),
      });

      return { answer, conversationHistory: newHistory };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapFetchError(error, this.config.model, candidates[0]);
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}
