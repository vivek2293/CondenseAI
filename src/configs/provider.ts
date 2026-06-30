/**
 * Provider configuration — the single file to edit when switching LLM providers.
 *
 * To switch from Ollama to an API-based provider:
 *   1. Change `type` to the new provider name (e.g. "openai")
 *   2. Change `baseUrl` to the provider's API endpoint
 *   3. Set `apiKey` to your API key
 *   4. Create `src/providers/<name>.ts` implementing SummarizerProvider
 *   5. Add a `case "<name>"` in `src/providers/index.ts`
 */

export type ProviderType = "ollama"; // extend: | "openai" | "anthropic"

export const PROVIDER_CONFIG = {
  /** Change this to switch providers */
  type: "ollama" as ProviderType,

  /** Base URL for the provider API */
  baseUrl: "http://127.0.0.1:11434",

  /** API key — leave empty for local providers like Ollama */
  apiKey: "",

  /** Model name to use */
  model: "llama3.1",

  /** Max characters of page text to send (reduces input tokens) */
  maxInputChars: 8_000,

  /** Max tokens the model may generate in a single response */
  maxOutputTokens: 400,

  /** Abort timeout for any single LLM request (ms) */
  requestTimeoutMs: 120_000,
} as const;
