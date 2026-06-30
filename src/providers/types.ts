import type { AppConfig } from "../shared/config";
import type { ChatMessage } from "../shared/messages";

export interface SummarizeOptions {
  title: string;
  url: string;
  timeoutMs: number;
}

export interface FollowUpOptions {
  timeoutMs: number;
}

export interface FollowUpResult {
  answer: string;
  conversationHistory: ChatMessage[];
}

export interface SummarizerProvider {
  summarize(text: string, options: SummarizeOptions): Promise<string>;
  askFollowUp(
    question: string,
    conversationHistory: ChatMessage[],
    options: FollowUpOptions,
  ): Promise<FollowUpResult>;
}

export type ProviderConfig = Pick<
  AppConfig,
  "provider" | "ollamaBaseUrl" | "apiKey" | "model" | "maxOutputTokens" | "requestTimeoutMs"
>;
