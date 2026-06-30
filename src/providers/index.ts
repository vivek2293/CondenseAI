import { AppError, ErrorCode, getUserMessage } from "../shared/errors";
import type { AppConfig } from "../shared/config";
import { OllamaProvider } from "./ollama";
import type { SummarizerProvider } from "./types";

export function createProvider(config: AppConfig): SummarizerProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
    default:
      throw new AppError(
        ErrorCode.UNKNOWN,
        getUserMessage(ErrorCode.UNKNOWN),
      );
  }
}

export { OllamaProvider } from "./ollama";
export type { SummarizerProvider, SummarizeOptions, FollowUpOptions, FollowUpResult } from "./types";
