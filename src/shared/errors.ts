export const ErrorCode = {
  EMPTY_PAGE: "EMPTY_PAGE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  TIMEOUT: "TIMEOUT",
  RESTRICTED_PAGE: "RESTRICTED_PAGE",
  CANCELLED: "CANCELLED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.EMPTY_PAGE]: "This page has no readable content.",
  [ErrorCode.PROVIDER_UNAVAILABLE]:
    "Ollama isn't running. Start it with `ollama serve`.",
  [ErrorCode.MODEL_NOT_FOUND]:
    "Model not found. Run `ollama pull llama3.1` (or your configured model).",
  [ErrorCode.TIMEOUT]: "Summary took too long. Try a shorter page.",
  [ErrorCode.RESTRICTED_PAGE]: "Can't summarize this type of page.",
  [ErrorCode.CANCELLED]: "Cancelled.",
  [ErrorCode.UNKNOWN]: "Something went wrong. Please try again.",
};

export function getUserMessage(code: ErrorCode): string {
  return USER_MESSAGES[code];
}

export function toSummarizeFailure(error: unknown): {
  code: ErrorCode;
  message: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  return { code: ErrorCode.UNKNOWN, message: getUserMessage(ErrorCode.UNKNOWN) };
}

export function isNetworkFetchError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof DOMException) {
    return error.name === "NetworkError";
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("network request failed")
    );
  }

  return false;
}

export function mapFetchError(
  error: unknown,
  model: string,
  baseUrl?: string,
): AppError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AppError(ErrorCode.TIMEOUT, getUserMessage(ErrorCode.TIMEOUT));
  }

  if (error instanceof AppError) {
    return error;
  }

  if (isNetworkFetchError(error)) {
    const detail = error instanceof Error ? error.message : "Failed to fetch";
    const target = baseUrl ? ` at ${baseUrl}` : "";
    return new AppError(
      ErrorCode.PROVIDER_UNAVAILABLE,
      `Cannot reach Ollama${target}. ${detail}. Ensure Ollama is running (\`ollama serve\`) and reload the extension after changing settings.`,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("model")) {
    return new AppError(
      ErrorCode.MODEL_NOT_FOUND,
      `Model not found. Run \`ollama pull ${model}\`.`,
    );
  }

  return new AppError(ErrorCode.UNKNOWN, getUserMessage(ErrorCode.UNKNOWN));
}
